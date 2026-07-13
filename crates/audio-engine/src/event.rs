//! Events emitted by the audio engine thread to the host application.

use serde::{Deserialize, Serialize};

/// Notifications produced by the engine (playback lifecycle, warnings, errors).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum AudioEvent {
    PlaybackStarted { clip_id: String },
    PlaybackStopped { clip_id: String },
    DeviceWarning { message: String },
    Error { message: String },
}
