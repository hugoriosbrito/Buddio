//! Global hotkey registration via the `global-hotkey` crate (direct OS RegisterHotKey).
//!
//! We intentionally do **not** use `tauri-plugin-global-shortcut`'s `on_shortcut` path:
//! that plugin wraps every register/unregister in `run_on_main_thread` + `mpsc::recv`,
//! which surfaces opaque failures (often just our anyhow context) and is fragile during
//! Tauri setup. Buddio owns the manager on the UI thread and registers directly.

use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread::ThreadId;

use anyhow::{bail, Context, Result};
use global_hotkey::hotkey::HotKey;
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{debug, info, warn};

use crate::AppState;

#[derive(Debug, Clone)]
enum HotkeyAction {
    PlayClip(String),
    StopAll,
}

/// `GlobalHotKeyManager` must only be used on the thread that created it.
/// We enforce that in [`HotkeyManager::with_os`] and mark it Send for Arc storage.
struct HotkeyOs(GlobalHotKeyManager);

// SAFETY: all OS calls go through `with_os`, which runs on `main_thread_id`.
unsafe impl Send for HotkeyOs {}

/// Manages per-clip hotkeys and the global stop-all shortcut.
pub struct HotkeyManager {
    /// clip_id → normalized shortcut string
    bindings: Mutex<HashMap<String, String>>,
    stop_all: Mutex<Option<String>>,
    /// When true, registered shortcuts are temporarily unregistered (during capture UI).
    suspended: Mutex<bool>,
    /// normalized accelerator → OS hotkey (for unregister)
    registered: Mutex<HashMap<String, HotKey>>,
    /// hotkey id → action
    actions: Arc<Mutex<HashMap<u32, HotkeyAction>>>,
    os: Arc<Mutex<Option<HotkeyOs>>>,
    main_thread_id: Mutex<ThreadId>,
}

impl HotkeyManager {
    pub fn new() -> Self {
        Self {
            bindings: Mutex::new(HashMap::new()),
            stop_all: Mutex::new(None),
            suspended: Mutex::new(false),
            registered: Mutex::new(HashMap::new()),
            actions: Arc::new(Mutex::new(HashMap::new())),
            os: Arc::new(Mutex::new(None)),
            main_thread_id: Mutex::new(std::thread::current().id()),
        }
    }

    /// Create the Win32 hotkey HWND + event handler. Must run on the UI/main thread.
    pub fn init_os(&self, app: &AppHandle) -> Result<()> {
        *self.main_thread_id.lock() = std::thread::current().id();

        let manager = GlobalHotKeyManager::new().context("create GlobalHotKeyManager")?;
        *self.os.lock() = Some(HotkeyOs(manager));

        let actions = self.actions.clone();
        let app_handle = app.clone();
        // OnceCell — only one handler for the process. Do not also init the Tauri plugin.
        GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
            if event.state != HotKeyState::Pressed {
                return;
            }
            let action = actions.lock().get(&event.id).cloned();
            let Some(action) = action else {
                eprintln!("[buddio] hotkey id={} pressed but no action mapped", event.id);
                return;
            };
            match action {
                HotkeyAction::PlayClip(clip_id) => {
                    eprintln!("[buddio] HOTKEY FIRED clip={clip_id}");
                    info!(clip_id = %clip_id, "global hotkey pressed");
                    let state = app_handle.state::<AppState>();
                    if let Err(err) = play_clip_by_id(&app_handle, &state, &clip_id) {
                        warn!(error = %err, "hotkey play failed");
                        eprintln!("[buddio] HOTKEY PLAY FAILED clip={clip_id}: {err:#}");
                    }
                }
                HotkeyAction::StopAll => {
                    eprintln!("[buddio] STOP-ALL hotkey fired");
                    let state = app_handle.state::<AppState>();
                    let _ = state.audio.send(audio_engine::AudioCommand::StopAll);
                    let _ = app_handle.emit(
                        "playback-event",
                        crate::models::PlaybackEventPayload::Stopped {
                            clip_id: "*".into(),
                        },
                    );
                }
            }
        }));

        info!("hotkey OS manager ready");
        eprintln!("[buddio] hotkey OS manager ready");
        Ok(())
    }

    pub fn is_suspended(&self) -> bool {
        *self.suspended.lock()
    }

    /// Register all clip hotkeys + stop-all from current library/settings.
    pub fn sync_from_library(&self, app: &AppHandle) -> Result<()> {
        let state = app.state::<AppState>();
        let clips = state.library.list_clips()?;
        let settings = state.settings.load()?;

        self.unregister_all(app)?;

        let mut bindings = HashMap::new();
        for clip in clips {
            if let Some(hotkey) = clip.hotkey {
                if !hotkey.is_empty() {
                    bindings.insert(clip.id, normalize_shortcut(&hotkey));
                }
            }
        }

        let stop_all = settings
            .stop_all_hotkey
            .as_ref()
            .filter(|s| !s.is_empty())
            .map(|s| normalize_shortcut(s));

        *self.bindings.lock() = bindings.clone();
        *self.stop_all.lock() = stop_all.clone();

        if self.is_suspended() {
            debug!("hotkey sync skipped (suspended)");
            return Ok(());
        }

        self.register_all_current(app, &bindings, stop_all.as_deref());
        Ok(())
    }

    pub fn ensure_active(&self, app: &AppHandle) -> Result<()> {
        if self.is_suspended() {
            warn!("hotkeys were still suspended — forcing resume");
            *self.suspended.lock() = false;
        }
        self.sync_from_library(app)
    }

    pub fn set_clip_hotkey(
        &self,
        app: &AppHandle,
        clip_id: &str,
        hotkey: Option<String>,
    ) -> Result<()> {
        if let Some(old) = self.bindings.lock().get(clip_id).cloned() {
            let _ = self.unregister_accelerator(app, &old);
        }

        match hotkey {
            Some(key) if !key.is_empty() => {
                let key = normalize_shortcut(&key);

                if is_fragile_accelerator(&key) {
                    bail!(
                        "Atalhos sem Ctrl/Alt/Shift não funcionam bem no Windows (ex.: F12). Use Ctrl+Shift+1."
                    );
                }

                if let Some(stop) = self.stop_all.lock().clone() {
                    if stop == key {
                        bail!("hotkey '{key}' is reserved for stop-all");
                    }
                }
                for (other_id, other_key) in self.bindings.lock().iter() {
                    if other_id != clip_id && other_key == &key {
                        bail!("hotkey '{key}' is already assigned to another clip");
                    }
                }

                self.bindings
                    .lock()
                    .insert(clip_id.to_string(), key.clone());
                if !self.is_suspended() {
                    self.register_clip(app, clip_id, &key)?;
                } else {
                    debug!(
                        clip_id = %clip_id,
                        hotkey = %key,
                        "clip hotkey saved (deferred while suspended)"
                    );
                }
            }
            _ => {
                self.bindings.lock().remove(clip_id);
            }
        }
        Ok(())
    }

    pub fn set_stop_all_hotkey(&self, app: &AppHandle, hotkey: Option<String>) -> Result<()> {
        if let Some(old) = self.stop_all.lock().clone() {
            let _ = self.unregister_accelerator(app, &old);
        }
        let normalized = hotkey
            .filter(|s| !s.is_empty())
            .map(|s| normalize_shortcut(&s));
        *self.stop_all.lock() = normalized.clone();
        if let Some(key) = normalized {
            if !self.is_suspended() {
                self.register_stop_all(app, &key)?;
            }
        }
        Ok(())
    }

    pub fn suspend(&self, app: &AppHandle) -> Result<()> {
        if self.is_suspended() {
            return Ok(());
        }
        self.unregister_all(app)?;
        *self.suspended.lock() = true;
        info!("hotkeys suspended for capture");
        Ok(())
    }

    pub fn resume(&self, app: &AppHandle) -> Result<()> {
        if !self.is_suspended() {
            return Ok(());
        }
        *self.suspended.lock() = false;
        self.sync_from_library(app)?;
        info!("hotkeys resumed");
        Ok(())
    }

    fn register_all_current(
        &self,
        app: &AppHandle,
        bindings: &HashMap<String, String>,
        stop_all: Option<&str>,
    ) {
        let state = app.state::<AppState>();
        for (clip_id, hotkey) in bindings {
            // Drop known-bad bare keys before even hitting the OS.
            if is_fragile_accelerator(hotkey) {
                eprintln!(
                    "[buddio] clearing fragile hotkey clip={clip_id} hotkey={hotkey} (needs Ctrl/Alt/Shift)"
                );
                let _ = state.library.set_hotkey(clip_id, None);
                self.bindings.lock().remove(clip_id);
                let _ = app.emit(
                    "hotkey-event",
                    serde_json::json!({
                        "type": "clearedFragile",
                        "clipId": clip_id,
                        "hotkey": hotkey,
                        "message": format!(
                            "Atalho '{hotkey}' foi removido: teclas sozinhas não registram no Windows. Capture Ctrl+Shift+1 (ou similar)."
                        ),
                    }),
                );
                continue;
            }

            if let Err(err) = self.register_clip(app, clip_id, hotkey) {
                warn!(
                    error = %err,
                    clip_id = %clip_id,
                    hotkey = %hotkey,
                    "failed to register clip hotkey"
                );
                eprintln!("[buddio] FAILED register clip={clip_id} hotkey={hotkey}: {err:#}");
                // Persist clear so the UI doesn't keep showing a dead binding.
                let _ = state.library.set_hotkey(clip_id, None);
                self.bindings.lock().remove(clip_id);
                let _ = app.emit(
                    "hotkey-event",
                    serde_json::json!({
                        "type": "registerFailed",
                        "clipId": clip_id,
                        "hotkey": hotkey,
                        "message": format!(
                            "Atalho '{hotkey}' indisponível (outro app já usa). Foi limpo — capture outro com Ctrl/Alt/Shift."
                        ),
                    }),
                );
            }
        }
        if let Some(stop) = stop_all {
            if let Err(err) = self.register_stop_all(app, stop) {
                warn!(error = %err, hotkey = %stop, "failed to register stop-all hotkey");
                eprintln!("[buddio] FAILED register stop-all={stop}: {err:#}");
                let _ = app.emit(
                    "hotkey-event",
                    serde_json::json!({
                        "type": "registerFailed",
                        "clipId": null,
                        "hotkey": stop,
                        "message": format!(
                            "Atalho de Parar tudo '{stop}' indisponível. Vá em Configurações e escolha outro (ex.: Ctrl+Shift+Backspace)."
                        ),
                    }),
                );
            }
        }
    }

    fn register_clip(&self, app: &AppHandle, clip_id: &str, hotkey: &str) -> Result<()> {
        let normalized = normalize_shortcut(hotkey);
        let parsed: HotKey = normalized
            .parse()
            .with_context(|| format!("invalid shortcut '{hotkey}' (normalized: '{normalized}')"))?;

        self.unregister_accelerator(app, &normalized).ok();

        let label = normalized.clone();
        self.with_os(app, move |os| {
            os.0.register(parsed).with_context(|| {
                format!(
                    "RegisterHotKey failed for '{label}' (already taken by another app, or OS rejected the key)"
                )
            })
        })?;

        self.actions
            .lock()
            .insert(parsed.id(), HotkeyAction::PlayClip(clip_id.to_string()));
        self.registered
            .lock()
            .insert(normalized.clone(), parsed);

        info!(clip_id = %clip_id, hotkey = %normalized, id = parsed.id(), "registered clip hotkey");
        eprintln!("[buddio] registered clip={clip_id} hotkey={normalized} id={}", parsed.id());
        Ok(())
    }

    fn register_stop_all(&self, app: &AppHandle, hotkey: &str) -> Result<()> {
        let normalized = normalize_shortcut(hotkey);
        let parsed: HotKey = normalized
            .parse()
            .with_context(|| format!("invalid stop-all shortcut '{hotkey}'"))?;

        self.unregister_accelerator(app, &normalized).ok();

        let label = normalized.clone();
        self.with_os(app, move |os| {
            os.0.register(parsed).with_context(|| {
                format!(
                    "RegisterHotKey failed for stop-all '{label}' (already taken by another app, or OS rejected the key)"
                )
            })
        })?;

        self.actions
            .lock()
            .insert(parsed.id(), HotkeyAction::StopAll);
        self.registered
            .lock()
            .insert(normalized.clone(), parsed);

        info!(hotkey = %normalized, id = parsed.id(), "registered stop-all hotkey");
        eprintln!("[buddio] registered stop-all={normalized} id={}", parsed.id());
        Ok(())
    }

    fn unregister_accelerator(&self, app: &AppHandle, hotkey: &str) -> Result<()> {
        let normalized = normalize_shortcut(hotkey);
        let Some(parsed) = self.registered.lock().remove(&normalized) else {
            // Still try parse+unregister in case maps are stale.
            if let Ok(hk) = normalized.parse::<HotKey>() {
                self.actions.lock().remove(&hk.id());
                let _ = self.with_os(app, move |os| {
                    let _ = os.0.unregister(hk);
                    Ok(())
                });
            }
            return Ok(());
        };
        self.actions.lock().remove(&parsed.id());
        self.with_os(app, move |os| {
            match os.0.unregister(parsed) {
                Ok(()) => Ok(()),
                Err(err) => {
                    debug!(error = %err, "unregister ignored");
                    Ok(())
                }
            }
        })
    }

    fn unregister_all(&self, app: &AppHandle) -> Result<()> {
        let keys: Vec<String> = self.registered.lock().keys().cloned().collect();
        for key in keys {
            let _ = self.unregister_accelerator(app, &key);
        }
        self.registered.lock().clear();
        self.actions.lock().clear();
        Ok(())
    }

    /// Run `f` on the UI thread that owns the Win32 hotkey HWND.
    fn with_os<F, T>(&self, app: &AppHandle, f: F) -> Result<T>
    where
        F: FnOnce(&HotkeyOs) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        if std::thread::current().id() == *self.main_thread_id.lock() {
            let lock = self.os.lock();
            let os = lock
                .as_ref()
                .context("hotkey OS manager not initialized (init_os missing)")?;
            return f(os);
        }

        let os = self.os.clone();
        let (tx, rx) = mpsc::channel();
        app.run_on_main_thread(move || {
            let result = (|| {
                let lock = os.lock();
                let mgr = lock
                    .as_ref()
                    .context("hotkey OS manager not initialized (init_os missing)")?;
                f(mgr)
            })();
            let _ = tx.send(result);
        })
        .context("schedule hotkey work on main thread")?;

        rx.recv()
            .context("hotkey main-thread channel disconnected")?
    }
}

fn play_clip_by_id(app: &AppHandle, state: &AppState, clip_id: &str) -> Result<()> {
    let clip = state
        .library
        .get_clip(clip_id)?
        .with_context(|| format!("clip {clip_id} not found"))?;

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
        .send(crate::managers::library::play_command_for_clip(&clip))?;

    let _ = app.emit(
        "playback-event",
        crate::models::PlaybackEventPayload::Started { clip_id: clip.id },
    );
    Ok(())
}

/// Bare keys (no modifier) almost always fail or conflict on Windows (F12, Esc, …).
pub fn is_fragile_accelerator(hotkey: &str) -> bool {
    !normalize_shortcut(hotkey).contains('+')
}

/// Normalize UI / legacy chords to global-hotkey parseable form.
pub fn normalize_shortcut(raw: &str) -> String {
    raw.split('+')
        .map(|part| {
            let t = part.trim();
            match t.to_ascii_lowercase().as_str() {
                "control" | "ctrl" | "cmd" | "command" | "meta" | "super" => {
                    "CommandOrControl".to_string()
                }
                "option" => "Alt".to_string(),
                "escape" | "esc" => "Escape".to_string(),
                " " | "space" => "Space".to_string(),
                other => {
                    if other.len() == 1 {
                        other.to_ascii_uppercase()
                    } else if other.starts_with('f')
                        && other.len() <= 3
                        && other[1..].chars().all(|c| c.is_ascii_digit())
                    {
                        format!("F{}", &other[1..])
                    } else if let Some(rest) = other.strip_prefix("key") {
                        if rest.len() == 1 {
                            rest.to_ascii_uppercase()
                        } else {
                            t.to_string()
                        }
                    } else if let Some(rest) = other.strip_prefix("digit") {
                        rest.to_string()
                    } else {
                        match other {
                            "alt" => "Alt".into(),
                            "shift" => "Shift".into(),
                            "up" | "arrowup" => "Up".into(),
                            "down" | "arrowdown" => "Down".into(),
                            "left" | "arrowleft" => "Left".into(),
                            "right" | "arrowright" => "Right".into(),
                            _ => t.to_string(),
                        }
                    }
                }
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

impl Default for HotkeyManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::{is_fragile_accelerator, normalize_shortcut};

    #[test]
    fn normalizes_modifiers_and_keys() {
        assert_eq!(
            normalize_shortcut("Control+Shift+1"),
            "CommandOrControl+Shift+1"
        );
        assert_eq!(normalize_shortcut("ctrl+a"), "CommandOrControl+A");
        assert_eq!(normalize_shortcut("Esc"), "Escape");
        assert_eq!(normalize_shortcut("KeyQ"), "Q");
        assert_eq!(normalize_shortcut("Digit9"), "9");
        assert_eq!(normalize_shortcut("ArrowUp"), "Up");
    }

    #[test]
    fn detects_fragile_bare_keys() {
        assert!(is_fragile_accelerator("F12"));
        assert!(is_fragile_accelerator("Escape"));
        assert!(!is_fragile_accelerator("CommandOrControl+Shift+1"));
        assert!(!is_fragile_accelerator("Ctrl+F12"));
    }
}
