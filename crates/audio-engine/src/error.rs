//! Error types for the audio engine public API.

use thiserror::Error;

/// Errors returned by [`crate::AudioEngineHandle`] operations.
#[derive(Debug, Error)]
pub enum AudioError {
    #[error("audio engine command channel disconnected")]
    ChannelDisconnected,

    #[error("audio device error: {0}")]
    Device(String),

    #[error("failed to decode clip: {0}")]
    Decode(String),

    #[error("clip not found: {0}")]
    ClipNotFound(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}

/// Convenience result alias for this crate.
pub type Result<T> = std::result::Result<T, AudioError>;
