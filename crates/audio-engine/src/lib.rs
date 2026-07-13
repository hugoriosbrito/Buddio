//! Buddio soundboard audio engine.
//!
//! Independent of Tauri: the host talks to [`AudioEngineHandle`] via
//! [`AudioCommand`] / [`AudioEvent`] channels. Clips are decoded into an in-memory
//! PCM hot cache; playback can fan out to a monitor device and an optional secondary
//! output (e.g. VB-CABLE) at the same time.

mod cache;
mod command;
mod decode;
mod device;
mod engine;
mod error;
mod event;
mod handle;
mod mic_meter;
mod source;
mod volume;

pub use command::AudioCommand;
pub use device::{default_output_sample_rate, OutputDeviceInfo};
pub use error::{AudioError, Result};
pub use event::AudioEvent;
pub use handle::AudioEngineHandle;
pub use mic_meter::{list_input_devices, InputDeviceInfo, MicMeter};

// Re-exports useful for tests / advanced hosts.
pub use cache::{ClipCache, DecodedClip};
pub use decode::{compute_peaks, decode_file};
pub use volume::{clamp_gain, db_to_linear, effective_gain};
