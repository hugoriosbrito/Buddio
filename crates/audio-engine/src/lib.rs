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
mod loudness;
mod mic_meter;
mod mic_mix;
mod mic_route;
mod source;
mod vad;
mod volume;

pub use command::AudioCommand;
pub use device::{default_output_sample_rate, OutputDeviceInfo};
pub use error::{AudioError, Result};
pub use event::AudioEvent;
pub use handle::AudioEngineHandle;
pub use loudness::{
    analyze_clip, combined_gain_linear, estimate_head_lufs, estimate_integrated_lufs, norm_gain_db,
    DEFAULT_VOICE_TARGET_LUFS,
};
pub use mic_meter::{list_input_devices, InputDeviceInfo, MicMeter};
pub use mic_route::MicRouteMode;

// Re-exports useful for tests / advanced hosts.
pub use cache::{ClipCache, DecodedClip};
pub use decode::{compute_peaks, decode_file};
pub use volume::{clamp_gain, db_to_linear, effective_gain};
