//! Public handle: spawns the engine thread and forwards non-blocking commands.

use crossbeam_channel::{unbounded, Receiver, Sender};

use crate::command::AudioCommand;
use crate::device::{self, OutputDeviceInfo};
use crate::engine;
use crate::error::{AudioError, Result};
use crate::event::AudioEvent;

/// Cloneable handle used by the host (e.g. Tauri commands) to drive the engine.
#[derive(Clone)]
pub struct AudioEngineHandle {
    cmd_tx: Sender<AudioCommand>,
}

impl AudioEngineHandle {
    /// Spawn the audio engine on a background thread.
    ///
    /// Returns the handle plus a receiver for [`AudioEvent`]s.
    pub fn start() -> (Self, Receiver<AudioEvent>) {
        let (cmd_tx, cmd_rx) = unbounded::<AudioCommand>();
        let (event_tx, event_rx) = unbounded::<AudioEvent>();

        std::thread::Builder::new()
            .name("buddio-audio-engine".into())
            .spawn(move || engine::run(cmd_rx, event_tx))
            .expect("failed to spawn audio engine thread");

        (Self { cmd_tx }, event_rx)
    }

    /// Enqueue a command (non-blocking). Fails only if the engine thread has exited.
    pub fn send(&self, cmd: AudioCommand) -> Result<()> {
        self.cmd_tx
            .send(cmd)
            .map_err(|_| AudioError::ChannelDisconnected)
    }

    /// Enumerate OS output devices (safe to call from any thread).
    pub fn list_output_devices() -> Result<Vec<OutputDeviceInfo>> {
        device::list_output_devices()
    }
}
