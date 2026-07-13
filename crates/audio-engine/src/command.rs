//! Commands sent from the host application into the audio engine thread.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::mic_route::MicRouteMode;

/// Non-blocking commands processed by the engine thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum AudioCommand {
    /// Start (or restart) playback of a cached clip.
    ///
    /// Optional editor params are applied at play time (non-destructive):
    /// - `trim_*` seek / early-stop within the cached PCM
    /// - `gain_linear` multiplies clip volume (typically `10^(gain_db/20)`)
    /// - `fade_*` apply a linear amplitude envelope in [`CachedSource`]
    /// - `play_vad_preamble` plays a short beep on secondary before the clip
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
        #[serde(default)]
        play_vad_preamble: bool,
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
    /// Mix the physical microphone into the secondary (call) output only.
    ///
    /// Prefer [`AudioCommand::SetMicRoute`]. Kept for compatibility.
    SetMicMix {
        enabled: bool,
        /// `None` = system default input.
        input_device: Option<String>,
    },
    /// Exclusive mic routing mode on the secondary path.
    SetMicRoute {
        mode: MicRouteMode,
        /// Attenuation applied to voice while a clip plays (ducking mode). Negative dB.
        ducking_db: f32,
        input_device: Option<String>,
    },
    /// Enable/disable voice-activation preamble beep before clips.
    SetVadSound { enabled: bool },
    /// Decode a file into the hot PCM cache.
    LoadClip { clip_id: String, path: PathBuf },
    /// Remove a clip from the hot cache (also stops it if playing).
    UnloadClip { clip_id: String },
}
