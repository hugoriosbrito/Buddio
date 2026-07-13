//! Commands sent from the host application into the audio engine thread.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Non-blocking commands processed by the engine thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum AudioCommand {
    /// Start (or restart) playback of a cached clip.
    ///
    /// Optional editor params are applied at play time (non-destructive):
    /// - `trim_*` seek / early-stop within the cached PCM
    /// - `gain_linear` multiplies clip volume (typically `10^(gain_db/20)`)
    /// - `fade_*` are accepted for forward-compat; fade envelope is TODO in the engine
    Play {
        clip_id: String,
        volume: f32,
        loop_enabled: bool,
        #[serde(default)]
        trim_start_secs: Option<f32>,
        #[serde(default)]
        trim_end_secs: Option<f32>,
        #[serde(default)]
        fade_in_secs: Option<f32>,
        #[serde(default)]
        fade_out_secs: Option<f32>,
        #[serde(default)]
        gain_linear: Option<f32>,
    },
    /// Stop a single active clip.
    Stop { clip_id: String },
    /// Stop every active clip.
    StopAll,
    /// Set master volume (multiplies each clip volume).
    SetMasterVolume(f32),
    /// Configure monitor / secondary output device names.
    ///
    /// - `monitor_enabled: false` → monitor stream closed (call-only when secondary is set)
    /// - `monitor_enabled: true` + `monitor: None` → system default output
    /// - `monitor_enabled: true` + `monitor: Some(name)` → named device
    /// - `secondary: None` → secondary output disabled
    SetOutputs {
        monitor_enabled: bool,
        monitor: Option<String>,
        secondary: Option<String>,
    },
    /// Decode a file into the hot PCM cache.
    LoadClip { clip_id: String, path: PathBuf },
    /// Remove a clip from the hot cache (also stops it if playing).
    UnloadClip { clip_id: String },
}
