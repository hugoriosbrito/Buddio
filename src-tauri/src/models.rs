//! Shared DTOs exchanged with the frontend (via tauri-specta).

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipDto {
    pub id: String,
    pub name: String,
    pub file_hash: String,
    pub ext: String,
    pub duration_ms: i32,
    pub volume: f32,
    pub loop_enabled: bool,
    pub hotkey: Option<String>,
    pub created_at: String,
    pub position: i32,
    pub peaks: Option<Vec<f32>>,
    pub trim_start_ms: i32,
    pub trim_end_ms: Option<i32>,
    pub fade_in_ms: i32,
    pub fade_out_ms: i32,
    pub gain_db: f32,
    pub restart_on_press: bool,
    pub stop_others: bool,
    pub emoji: Option<String>,
    pub pinned: bool,
    pub collection_ids: Vec<String>,
    /// Integrated loudness estimate (LUFS-ish); None until analyzed.
    pub integrated_lufs: Option<f32>,
    /// Auto normalization gain toward voice target (dB).
    pub norm_gain_db: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum MicRouteModeDto {
    #[default]
    Mix,
    Ducking,
    SoundOnly,
}

impl MicRouteModeDto {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Mix => "mix",
            Self::Ducking => "ducking",
            Self::SoundOnly => "sound_only",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "ducking" | "duck" => Self::Ducking,
            "sound_only" | "sound-only" | "block" | "block_voice" => Self::SoundOnly,
            _ => Self::Mix,
        }
    }

    pub fn to_engine(self) -> audio_engine::MicRouteMode {
        match self {
            Self::Mix => audio_engine::MicRouteMode::Mix,
            Self::Ducking => audio_engine::MicRouteMode::Ducking,
            Self::SoundOnly => audio_engine::MicRouteMode::SoundOnly,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipUpdate {
    pub name: Option<String>,
    pub volume: Option<f32>,
    pub loop_enabled: Option<bool>,
    pub position: Option<i32>,
    pub trim_start_ms: Option<i32>,
    pub trim_end_ms: Option<i32>,
    pub fade_in_ms: Option<i32>,
    pub fade_out_ms: Option<i32>,
    pub gain_db: Option<f32>,
    pub restart_on_press: Option<bool>,
    pub stop_others: Option<bool>,
    pub emoji: Option<String>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CollectionDto {
    pub id: String,
    pub name: String,
    pub color: String,
    pub position: i32,
    pub clip_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CollectionUpdate {
    pub name: Option<String>,
    pub color: Option<String>,
    pub position: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDto {
    pub id: String,
    pub name: String,
    pub monitor_enabled: bool,
    pub monitor_device: Option<String>,
    pub secondary_device: Option<String>,
    pub master_volume: f32,
    pub collection_id: Option<String>,
    pub is_default: bool,
    pub mic_route_mode: MicRouteModeDto,
    pub ducking_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUpdate {
    pub name: Option<String>,
    pub monitor_enabled: Option<bool>,
    pub monitor_device: Option<String>,
    pub secondary_device: Option<String>,
    pub master_volume: Option<f32>,
    pub collection_id: Option<String>,
    pub is_default: Option<bool>,
    pub mic_route_mode: Option<MicRouteModeDto>,
    pub ducking_db: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OutputDeviceDto {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InputDeviceDto {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OutputDevicesConfig {
    pub monitor_enabled: bool,
    pub monitor: Option<String>,
    pub secondary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub master_volume: f32,
    pub monitor_enabled: bool,
    pub monitor_device: Option<String>,
    pub secondary_device: Option<String>,
    pub stop_all_hotkey: Option<String>,
    pub theme: String,
    pub active_profile_id: Option<String>,
    pub onboarding_done: bool,
    /// Legacy mirror: true when mic_route_mode is Mix or Ducking (voice present when idle).
    pub mic_mix_enabled: bool,
    pub mic_route_mode: MicRouteModeDto,
    pub ducking_db: f32,
    pub vad_sound_enabled: bool,
    pub voice_target_lufs: f32,
    pub index_hotkeys_enabled: bool,
    /// Physical microphone used for mic→CABLE mix (never CABLE Output).
    pub mic_device: Option<String>,
    pub pinned_clip_ids: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            master_volume: 1.0,
            monitor_enabled: true,
            monitor_device: None,
            secondary_device: None,
            stop_all_hotkey: Some("CommandOrControl+Shift+Backspace".into()),
            theme: "dark".into(),
            active_profile_id: None,
            onboarding_done: false,
            mic_mix_enabled: true,
            mic_route_mode: MicRouteModeDto::Mix,
            ducking_db: -8.0,
            vad_sound_enabled: false,
            voice_target_lufs: -16.0,
            index_hotkeys_enabled: false,
            mic_device: None,
            pinned_clip_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WatchedFolderDto {
    pub id: String,
    pub path: String,
    pub collection_id: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsDto {
    pub devices: Vec<OutputDeviceDto>,
    pub sample_rate: Option<u32>,
    pub warnings: Vec<String>,
    pub monitor_device: Option<String>,
    pub secondary_device: Option<String>,
    pub monitor_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: Vec<ClipDto>,
    pub duplicates: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum PlaybackEventPayload {
    Started { clip_id: String },
    Stopped { clip_id: String },
    DeviceWarning { message: String },
    Error { message: String },
}
