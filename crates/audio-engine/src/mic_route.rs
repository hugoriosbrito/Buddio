//! Microphone routing modes for the secondary (call) path.

use serde::{Deserialize, Serialize};

/// How the physical microphone mixes into CABLE while soundboard plays.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MicRouteMode {
    /// Full voice + soundboard (default).
    #[default]
    Mix,
    /// Voice attenuated by `ducking_db` while a clip plays.
    Ducking,
    /// Voice muted while a clip plays (Soundpad "block voice").
    SoundOnly,
}

impl MicRouteMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Mix => "mix",
            Self::Ducking => "ducking",
            Self::SoundOnly => "sound_only",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "mix" | "misturar" => Some(Self::Mix),
            "ducking" | "duck" => Some(Self::Ducking),
            "sound_only" | "sound-only" | "block" | "block_voice" => Some(Self::SoundOnly),
            _ => None,
        }
    }
}
