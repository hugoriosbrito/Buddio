//! Tauri command handlers — thin wrappers over managers.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::fake_devices;
use crate::managers::library::play_command_for_clip;
use crate::managers::virtual_cable::{
    self, VirtualCableEnsureResult, VirtualCableStatusDto,
};
use crate::models::{
    AppSettings, ClipDto, ClipUpdate, CollectionDto, CollectionUpdate, DiagnosticsDto,
    ImportResult, InputDeviceDto, OutputDeviceDto, OutputDevicesConfig, ProfileDto, ProfileUpdate,
};
use crate::AppState;

type CmdResult<T> = Result<T, String>;

fn map_err(err: impl std::fmt::Display) -> String {
    err.to_string()
}

#[tauri::command]
#[specta::specta]
pub async fn import_clips(app: AppHandle, paths: Option<Vec<String>>) -> CmdResult<ImportResult> {
    let state = app.state::<AppState>();

    let paths: Vec<PathBuf> = if let Some(paths) = paths {
        paths.into_iter().map(PathBuf::from).collect()
    } else {
        let dialog_app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            dialog_app
                .dialog()
                .file()
                .add_filter(
                    "Audio",
                    &["wav", "mp3", "flac", "ogg", "m4a", "aac", "opus"],
                )
                .blocking_pick_files()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|f| f.into_path().ok())
                .collect::<Vec<_>>()
        })
        .await
        .map_err(|e| e.to_string())?
    };

    if paths.is_empty() {
        return Ok(ImportResult {
            imported: vec![],
            duplicates: vec![],
            errors: vec![],
        });
    }

    let library = state.library.clone();
    let audio = state.audio.clone();

    let result = tauri::async_runtime::spawn_blocking(move || library.import_paths(&paths))
        .await
        .map_err(|e| e.to_string())?
        .map_err(map_err)?;

    for clip in &result.imported {
        let path = state.library.asset_path(&clip.file_hash, &clip.ext);
        let _ = audio.send(audio_engine::AudioCommand::LoadClip {
            clip_id: clip.id.clone(),
            path,
        });
    }

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn list_clips(state: State<'_, AppState>) -> CmdResult<Vec<ClipDto>> {
    state.library.list_clips().map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn update_clip(
    state: State<'_, AppState>,
    id: String,
    update: ClipUpdate,
) -> CmdResult<ClipDto> {
    state.library.update_clip(&id, update).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn delete_clip(app: AppHandle, id: String) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let _ = state.audio.send(audio_engine::AudioCommand::UnloadClip {
        clip_id: id.clone(),
    });
    state.library.delete_clip(&id).map_err(map_err)?;
    let _ = state.hotkeys.set_clip_hotkey(&app, &id, None);
    Ok(())
}

const TEST_SAMPLE_CLIP_ID: &str = "__buddio_test_sample__";
const TEST_SAMPLE_REL: &str = "resources/samples/sound-test-sample.wav";

fn resolve_test_sample_path(app: &AppHandle) -> CmdResult<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(TEST_SAMPLE_REL));
        candidates.push(resource_dir.join("samples").join("sound-test-sample.wav"));
        candidates.push(resource_dir.join("sound-test-sample.wav"));
    }

    // Dev / `cargo run`: file lives next to the Tauri crate manifest.
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(TEST_SAMPLE_REL),
    );

    for path in &candidates {
        if path.is_file() {
            return Ok(path.clone());
        }
    }

    Err(format!(
        "Amostra de teste não encontrada ({TEST_SAMPLE_REL}). Recompile o app com resources/samples."
    ))
}

#[tauri::command]
#[specta::specta]
pub fn play_clip(app: AppHandle, id: String) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let clip = state
        .library
        .get_clip(&id)
        .map_err(map_err)?
        .ok_or_else(|| format!("clip {id} not found"))?;

    if clip.stop_others {
        let _ = state.audio.send(audio_engine::AudioCommand::StopAll);
    }

    let path = state.library.asset_path(&clip.file_hash, &clip.ext);
    let _ = state.audio.send(audio_engine::AudioCommand::LoadClip {
        clip_id: clip.id.clone(),
        path,
    });
    state
        .audio
        .send(play_command_for_clip(&clip))
        .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn play_test_sample(app: AppHandle) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let path = resolve_test_sample_path(&app)?;

    let _ = state.audio.send(audio_engine::AudioCommand::LoadClip {
        clip_id: TEST_SAMPLE_CLIP_ID.to_string(),
        path,
    });
    state
        .audio
        .send(audio_engine::AudioCommand::Play {
            clip_id: TEST_SAMPLE_CLIP_ID.to_string(),
            volume: 1.0,
            loop_enabled: false,
            trim_start_secs: None,
            trim_end_secs: None,
            fade_in_secs: None,
            fade_out_secs: None,
            gain_linear: None,
        })
        .map_err(map_err)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn stop_clip(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    state
        .audio
        .send(audio_engine::AudioCommand::Stop { clip_id: id })
        .map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn stop_all(state: State<'_, AppState>) -> CmdResult<()> {
    state
        .audio
        .send(audio_engine::AudioCommand::StopAll)
        .map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn set_master_volume(state: State<'_, AppState>, volume: f32) -> CmdResult<()> {
    let volume = volume.clamp(0.0, 1.0);
    state
        .audio
        .send(audio_engine::AudioCommand::SetMasterVolume(volume))
        .map_err(map_err)?;
    let mut settings = state.settings.load().map_err(map_err)?;
    settings.master_volume = volume;
    state.settings.save(&settings).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn list_output_devices() -> CmdResult<Vec<OutputDeviceDto>> {
    if let Some(devices) = fake_devices::fake_output_devices() {
        return Ok(devices);
    }
    let devices = audio_engine::AudioEngineHandle::list_output_devices().map_err(map_err)?;
    Ok(devices
        .into_iter()
        .map(|d| OutputDeviceDto {
            name: d.name,
            is_default: d.is_default,
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub fn list_input_devices() -> CmdResult<Vec<InputDeviceDto>> {
    if let Some(devices) = fake_devices::fake_input_devices() {
        return Ok(devices);
    }
    let devices = audio_engine::list_input_devices().map_err(map_err)?;
    Ok(devices
        .into_iter()
        .map(|d| InputDeviceDto {
            name: d.name,
            is_default: d.is_default,
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub fn start_mic_meter(
    state: State<'_, AppState>,
    device_name: Option<String>,
) -> CmdResult<()> {
    state.mic_meter.start(device_name).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn stop_mic_meter(state: State<'_, AppState>) -> CmdResult<()> {
    state.mic_meter.stop();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_mic_level(state: State<'_, AppState>) -> CmdResult<f32> {
    Ok(state.mic_meter.level())
}

#[tauri::command]
#[specta::specta]
pub fn set_output_devices(
    state: State<'_, AppState>,
    config: OutputDevicesConfig,
) -> CmdResult<()> {
    state
        .audio
        .send(audio_engine::AudioCommand::SetOutputs {
            monitor_enabled: config.monitor_enabled,
            monitor: config.monitor.clone(),
            secondary: config.secondary.clone(),
        })
        .map_err(map_err)?;

    let mut settings = state.settings.load().map_err(map_err)?;
    settings.monitor_enabled = config.monitor_enabled;
    settings.monitor_device = config.monitor;
    settings.secondary_device = config.secondary;
    state.settings.save(&settings).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn get_settings(state: State<'_, AppState>) -> CmdResult<AppSettings> {
    state.settings.load().map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn set_clip_hotkey(app: AppHandle, id: String, hotkey: Option<String>) -> CmdResult<ClipDto> {
    let state = app.state::<AppState>();
    let hotkey = hotkey
        .filter(|s| !s.is_empty())
        .map(|s| crate::managers::hotkeys::normalize_shortcut(&s));
    let clip = state
        .library
        .set_hotkey(&id, hotkey.clone())
        .map_err(map_err)?;
    state
        .hotkeys
        .set_clip_hotkey(&app, &id, hotkey)
        .map_err(map_err)?;
    Ok(clip)
}

#[tauri::command]
#[specta::specta]
pub fn set_stop_all_hotkey(app: AppHandle, hotkey: Option<String>) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let hotkey = hotkey
        .filter(|s| !s.is_empty())
        .map(|s| crate::managers::hotkeys::normalize_shortcut(&s));
    let mut settings = state.settings.load().map_err(map_err)?;
    settings.stop_all_hotkey = hotkey.clone();
    state.settings.save(&settings).map_err(map_err)?;
    state
        .hotkeys
        .set_stop_all_hotkey(&app, hotkey)
        .map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn suspend_hotkeys(app: AppHandle) -> CmdResult<()> {
    app.state::<AppState>()
        .hotkeys
        .suspend(&app)
        .map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn resume_hotkeys(app: AppHandle) -> CmdResult<()> {
    app.state::<AppState>()
        .hotkeys
        .resume(&app)
        .map_err(map_err)
}

// --- Collections ---

#[tauri::command]
#[specta::specta]
pub fn list_collections(state: State<'_, AppState>) -> CmdResult<Vec<CollectionDto>> {
    state.collections.list().map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn create_collection(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
) -> CmdResult<CollectionDto> {
    state.collections.create(&name, color).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn update_collection(
    state: State<'_, AppState>,
    id: String,
    update: CollectionUpdate,
) -> CmdResult<CollectionDto> {
    state.collections.update(&id, update).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn delete_collection(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    state.collections.delete(&id).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn set_clip_collections(
    state: State<'_, AppState>,
    clip_id: String,
    collection_ids: Vec<String>,
) -> CmdResult<()> {
    state
        .collections
        .set_clip_collections(&clip_id, &collection_ids)
        .map_err(map_err)
}

// --- Profiles ---

#[tauri::command]
#[specta::specta]
pub fn list_profiles(state: State<'_, AppState>) -> CmdResult<Vec<ProfileDto>> {
    state.profiles.list().map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn create_profile(state: State<'_, AppState>, name: String) -> CmdResult<ProfileDto> {
    state.profiles.create(&name).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn update_profile(
    state: State<'_, AppState>,
    id: String,
    update: ProfileUpdate,
) -> CmdResult<ProfileDto> {
    state.profiles.update(&id, update).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn delete_profile(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    let settings = state.settings.load().map_err(map_err)?;
    state.profiles.delete(&id).map_err(map_err)?;
    if settings.active_profile_id.as_deref() == Some(id.as_str()) {
        state
            .settings
            .set_active_profile_id(None)
            .map_err(map_err)?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn apply_profile(state: State<'_, AppState>, id: String) -> CmdResult<ProfileDto> {
    let profile = state
        .profiles
        .get(&id)
        .map_err(map_err)?
        .ok_or_else(|| format!("profile {id} not found"))?;

    state
        .audio
        .send(audio_engine::AudioCommand::SetMasterVolume(
            profile.master_volume,
        ))
        .map_err(map_err)?;
    state
        .audio
        .send(audio_engine::AudioCommand::SetOutputs {
            monitor_enabled: profile.monitor_enabled,
            monitor: profile.monitor_device.clone(),
            secondary: profile.secondary_device.clone(),
        })
        .map_err(map_err)?;

    let mut settings = state.settings.load().map_err(map_err)?;
    settings.master_volume = profile.master_volume;
    settings.monitor_enabled = profile.monitor_enabled;
    settings.monitor_device = profile.monitor_device.clone();
    settings.secondary_device = profile.secondary_device.clone();
    settings.active_profile_id = Some(profile.id.clone());
    state.settings.save(&settings).map_err(map_err)?;

    Ok(profile)
}

// --- Diagnostics & settings helpers ---

#[tauri::command]
#[specta::specta]
pub fn get_diagnostics(state: State<'_, AppState>) -> CmdResult<DiagnosticsDto> {
    let settings = state.settings.load().map_err(map_err)?;
    let devices = audio_engine::AudioEngineHandle::list_output_devices()
        .map_err(map_err)?
        .into_iter()
        .map(|d| OutputDeviceDto {
            name: d.name,
            is_default: d.is_default,
        })
        .collect::<Vec<_>>();

    let mut warnings = Vec::new();
    if settings.secondary_device.is_none() {
        warnings.push("Secondary output device is not configured".into());
    } else if let Some(ref name) = settings.secondary_device {
        if !devices.iter().any(|d| &d.name == name) {
            warnings.push(format!("Secondary device not found: {name}"));
        }
    }
    if settings.monitor_enabled {
        if let Some(ref name) = settings.monitor_device {
            if !devices.iter().any(|d| &d.name == name) {
                warnings.push(format!("Monitor device not found: {name}"));
            }
        }
    } else {
        warnings.push("Monitor output is disabled".into());
    }
    if devices.is_empty() {
        warnings.push("No output devices detected".into());
    }

    Ok(DiagnosticsDto {
        devices,
        sample_rate: audio_engine::default_output_sample_rate(),
        warnings,
        monitor_device: settings.monitor_device,
        secondary_device: settings.secondary_device,
        monitor_enabled: settings.monitor_enabled,
    })
}

#[tauri::command]
#[specta::specta]
pub fn set_theme(state: State<'_, AppState>, theme: String) -> CmdResult<()> {
    state.settings.set_theme(&theme).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn set_onboarding_done(state: State<'_, AppState>, done: bool) -> CmdResult<()> {
    state.settings.set_onboarding_done(done).map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn set_mic_mix(state: State<'_, AppState>, enabled: bool) -> CmdResult<()> {
    state
        .settings
        .set_mic_mix_enabled(enabled)
        .map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn set_pinned_clips(state: State<'_, AppState>, clip_ids: Vec<String>) -> CmdResult<()> {
    state
        .settings
        .set_pinned_clip_ids(&clip_ids)
        .map_err(map_err)
}

#[tauri::command]
#[specta::specta]
pub fn show_mini_window(app: AppHandle) -> CmdResult<()> {
    if let Some(mini) = app.get_webview_window("mini") {
        mini.show().map_err(map_err)?;
        mini.set_focus().map_err(map_err)?;
    }
    // Só Mini visível: esconde a janela principal (app continua no tray).
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn hide_mini_window(app: AppHandle) -> CmdResult<()> {
    if let Some(mini) = app.get_webview_window("mini") {
        mini.hide().map_err(map_err)?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_virtual_cable_status(
    state: State<'_, AppState>,
) -> CmdResult<VirtualCableStatusDto> {
    let settings = state.settings.load().map_err(map_err)?;
    let pending = state.settings.pending_virtual_setup().map_err(map_err)?;
    virtual_cable::build_status(
        settings.secondary_device.as_deref(),
        settings.monitor_device.as_deref(),
        pending,
    )
    .map_err(map_err)
}

/// Detect VB-CABLE (or similar), install if missing, then set secondary output.
#[tauri::command]
#[specta::specta]
pub fn ensure_virtual_cable(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CmdResult<VirtualCableEnsureResult> {
    let settings = state.settings.load().map_err(map_err)?;
    let pending = state.settings.pending_virtual_setup().map_err(map_err)?;

    let mut status = virtual_cable::build_status(
        settings.secondary_device.as_deref(),
        settings.monitor_device.as_deref(),
        pending,
    )
    .map_err(map_err)?;

    if !status.installed {
        let work = app
            .path()
            .app_data_dir()
            .map_err(map_err)?
            .join("drivers")
            .join("vbcable");
        let _reboot = virtual_cable::download_and_install(&work).map_err(map_err)?;
        state
            .settings
            .set_pending_virtual_setup(true)
            .map_err(map_err)?;

        // Re-scan after install.
        status = virtual_cable::build_status(
            settings.secondary_device.as_deref(),
            settings.monitor_device.as_deref(),
            true,
        )
        .map_err(map_err)?;

        if !status.installed {
            return Ok(VirtualCableEnsureResult {
                status: VirtualCableStatusDto {
                    reboot_required: true,
                    pending_after_reboot: true,
                    ..status
                },
                message: "VB-CABLE instalado. Reinicie o Windows e abra o Buddio de novo para concluir a rota.".into(),
                reboot_required: true,
            });
        }
    }

    let playback = status
        .playback_device
        .clone()
        .ok_or_else(|| "cabo virtual não encontrado após a instalação".to_string())?;

    state
        .audio
        .send(audio_engine::AudioCommand::SetOutputs {
            monitor_enabled: settings.monitor_enabled,
            monitor: settings.monitor_device.clone(),
            secondary: Some(playback.clone()),
        })
        .map_err(map_err)?;

    // Persist via existing set_output_devices path
    let mut next = settings.clone();
    next.secondary_device = Some(playback.clone());
    state.settings.save(&next).map_err(map_err)?;
    state
        .settings
        .set_pending_virtual_setup(false)
        .map_err(map_err)?;

    let status = virtual_cable::build_status(
        next.secondary_device.as_deref(),
        next.monitor_device.as_deref(),
        false,
    )
    .map_err(map_err)?;

    Ok(VirtualCableEnsureResult {
        message: format!(
            "Rota pronta: sons vão para {playback}. No Discord/Zoom, escolha {} como microfone.",
            status.capture_hint
        ),
        reboot_required: false,
        status,
    })
}
