//! Engine thread: owns streams, hot cache, and active sinks.
//!
//! Callback policy: no disk I/O, no SQLite, no long locks, no heavy logs in the
//! audio callback. All decoding happens on this command thread via [`crate::decode`].

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use crossbeam_channel::{Receiver, RecvTimeoutError, Sender};
use rodio::{OutputStream, OutputStreamHandle, Sink};
use tracing::{debug, warn};

use crate::cache::{ClipCache, DecodedClip};
use crate::command::AudioCommand;
use crate::decode;
use crate::device::resolve_output_device;
use crate::event::AudioEvent;
use crate::source::CachedSource;
use crate::volume::{clamp_gain, effective_gain};

/// One open output path (monitor or secondary).
struct OutputPath {
    /// Kept alive so the cpal stream does not tear down.
    _stream: OutputStream,
    handle: OutputStreamHandle,
}

/// Active dual-sink playback for a single `clip_id`.
struct ActivePlayback {
    clip_id: String,
    /// Per-clip volume at play time (master is applied via [`Sink::set_volume`]).
    clip_volume: f32,
    monitor: Option<Sink>,
    secondary: Option<Sink>,
}

impl ActivePlayback {
    fn stop(&self) {
        if let Some(s) = &self.monitor {
            s.stop();
        }
        if let Some(s) = &self.secondary {
            s.stop();
        }
    }

    fn apply_gain(&self, master: f32) {
        let gain = clamp_gain(effective_gain(master, self.clip_volume));
        if let Some(s) = &self.monitor {
            s.set_volume(gain);
        }
        if let Some(s) = &self.secondary {
            s.set_volume(gain);
        }
    }

    fn is_finished(&self) -> bool {
        let monitor_done = self.monitor.as_ref().map(|s| s.empty()).unwrap_or(true);
        let secondary_done = self.secondary.as_ref().map(|s| s.empty()).unwrap_or(true);
        monitor_done && secondary_done
    }
}

struct EngineState {
    event_tx: Sender<AudioEvent>,
    cache: ClipCache,
    /// Paths registered by LoadClip — used to decode on first Play if cache-missed.
    clip_paths: HashMap<String, PathBuf>,
    master_volume: f32,
    monitor: Option<OutputPath>,
    secondary: Option<OutputPath>,
    /// When false, monitor stays closed (call-only / secondary-only mode).
    monitor_enabled: bool,
    /// Desired secondary device name; `None` = disabled.
    secondary_name: Option<String>,
    /// Desired monitor device name; `None` = system default (when enabled).
    monitor_name: Option<String>,
    playing: HashMap<String, ActivePlayback>,
}

impl EngineState {
    fn new(event_tx: Sender<AudioEvent>) -> Self {
        let mut state = Self {
            event_tx,
            cache: ClipCache::new(),
            clip_paths: HashMap::new(),
            master_volume: 1.0,
            monitor: None,
            secondary: None,
            monitor_enabled: true,
            secondary_name: None,
            monitor_name: None,
            playing: HashMap::new(),
        };
        state.open_monitor(None);
        state
    }

    fn emit(&self, event: AudioEvent) {
        // Non-blocking: drop if the host is not draining events.
        let _ = self.event_tx.try_send(event);
    }

    fn close_monitor(&mut self) {
        self.monitor = None;
        self.monitor_enabled = false;
    }

    fn open_monitor(&mut self, name: Option<String>) {
        self.monitor_enabled = true;
        match open_output_path(name.as_deref()) {
            Ok(path) => {
                self.monitor_name = name;
                self.monitor = Some(path);
            }
            Err(msg) => {
                warn!(%msg, "failed to open monitor output");
                self.emit(AudioEvent::DeviceWarning {
                    message: msg.clone(),
                });
                // Last resort: try system default.
                if name.is_some() {
                    match open_output_path(None) {
                        Ok(path) => {
                            self.monitor_name = None;
                            self.monitor = Some(path);
                            self.emit(AudioEvent::DeviceWarning {
                                message: "monitor device unavailable; fell back to default".into(),
                            });
                        }
                        Err(msg2) => {
                            self.monitor = None;
                            self.emit(AudioEvent::Error { message: msg2 });
                        }
                    }
                } else {
                    self.monitor = None;
                    self.emit(AudioEvent::Error { message: msg });
                }
            }
        }
    }

    fn open_secondary(&mut self, name: Option<String>) {
        self.secondary_name = name.clone();
        match name {
            None => {
                self.secondary = None;
            }
            Some(ref n) => match open_output_path(Some(n)) {
                Ok(path) => {
                    self.secondary = Some(path);
                }
                Err(msg) => {
                    self.secondary = None;
                    self.emit(AudioEvent::DeviceWarning { message: msg });
                }
            },
        }
    }

    /// If a sink/stream is dead, reopen on the configured (or default) device.
    fn ensure_outputs_alive(&mut self) {
        if self.monitor_enabled && self.monitor.is_none() {
            self.open_monitor(self.monitor_name.clone());
        }
        if self.secondary_name.is_some() && self.secondary.is_none() {
            self.open_secondary(self.secondary_name.clone());
        }
    }

    fn handle_command(&mut self, cmd: AudioCommand) {
        match cmd {
            AudioCommand::LoadClip { clip_id, path } => self.load_clip(clip_id, path),
            AudioCommand::UnloadClip { clip_id } => self.unload_clip(clip_id),
            AudioCommand::Play {
                clip_id,
                volume,
                loop_enabled,
                trim_start_secs,
                trim_end_secs,
                fade_in_secs,
                fade_out_secs,
                gain_linear,
            } => self.play(
                clip_id,
                volume,
                loop_enabled,
                trim_start_secs,
                trim_end_secs,
                fade_in_secs,
                fade_out_secs,
                gain_linear,
            ),
            AudioCommand::Stop { clip_id } => self.stop_clip(&clip_id, true),
            AudioCommand::StopAll => self.stop_all(),
            AudioCommand::SetMasterVolume(v) => {
                self.master_volume = v.max(0.0);
                self.apply_master_to_active();
            }
            AudioCommand::SetOutputs {
                monitor_enabled,
                monitor,
                secondary,
            } => {
                // Stop active playback before tearing down streams.
                self.stop_all();
                if monitor_enabled {
                    self.open_monitor(monitor);
                } else {
                    self.monitor_name = monitor;
                    self.close_monitor();
                }
                self.open_secondary(secondary);
            }
        }
    }

    fn apply_master_to_active(&self) {
        for pb in self.playing.values() {
            pb.apply_gain(self.master_volume);
        }
    }

    fn load_clip(&mut self, clip_id: String, path: PathBuf) {
        self.clip_paths.insert(clip_id.clone(), path.clone());
        match decode::decode_file(&path) {
            Ok(clip) => {
                debug!(%clip_id, frames = clip.frame_count(), "clip loaded into hot cache");
                self.cache.insert(clip_id, clip);
            }
            Err(e) => {
                self.emit(AudioEvent::Error {
                    message: e.to_string(),
                });
            }
        }
    }

    fn unload_clip(&mut self, clip_id: String) {
        self.stop_clip(&clip_id, true);
        self.cache.remove(&clip_id);
        self.clip_paths.remove(&clip_id);
    }

    /// Return cached PCM, decoding from the registered path on first play if needed.
    fn ensure_cached(&mut self, clip_id: &str) -> Option<Arc<DecodedClip>> {
        if let Some(clip) = self.cache.get(clip_id) {
            return Some(clip);
        }
        let path = self.clip_paths.get(clip_id)?.clone();
        match decode::decode_file(&path) {
            Ok(clip) => {
                debug!(%clip_id, frames = clip.frame_count(), "clip decoded on first play");
                self.cache.insert(clip_id.to_string(), clip);
                self.cache.get(clip_id)
            }
            Err(e) => {
                self.emit(AudioEvent::Error {
                    message: e.to_string(),
                });
                None
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn play(
        &mut self,
        clip_id: String,
        volume: f32,
        loop_enabled: bool,
        trim_start_secs: Option<f32>,
        trim_end_secs: Option<f32>,
        fade_in_secs: Option<f32>,
        fade_out_secs: Option<f32>,
        gain_linear: Option<f32>,
    ) {
        // TODO: apply fade_in_secs / fade_out_secs envelope in CachedSource.
        let _ = (fade_in_secs, fade_out_secs);

        // Restart if already playing.
        self.stop_clip(&clip_id, false);

        let Some(clip) = self.ensure_cached(&clip_id) else {
            self.emit(AudioEvent::Error {
                message: format!("clip not loaded: {clip_id}"),
            });
            return;
        };

        self.ensure_outputs_alive();
        let clip_volume = volume.max(0.0) * gain_linear.unwrap_or(1.0).max(0.0);
        let gain = clamp_gain(effective_gain(self.master_volume, clip_volume));
        let trim_start = trim_start_secs.unwrap_or(0.0).max(0.0);

        let monitor_sink = self.monitor.as_ref().and_then(|out| {
            try_start_sink(
                &out.handle,
                &clip,
                loop_enabled,
                gain,
                trim_start,
                trim_end_secs,
            )
        });

        // If monitor sink failed while enabled, attempt reopen on default and retry once.
        let monitor_sink =
            if monitor_sink.is_none() && self.monitor_enabled && self.monitor.is_some() {
                self.emit(AudioEvent::DeviceWarning {
                    message: "monitor output failed; reopening on default".into(),
                });
                self.open_monitor(None);
                self.monitor.as_ref().and_then(|out| {
                    try_start_sink(
                        &out.handle,
                        &clip,
                        loop_enabled,
                        gain,
                        trim_start,
                        trim_end_secs,
                    )
                })
            } else {
                monitor_sink
            };

        let secondary_sink = self.secondary.as_ref().and_then(|out| {
            try_start_sink(
                &out.handle,
                &clip,
                loop_enabled,
                gain,
                trim_start,
                trim_end_secs,
            )
        });

        if monitor_sink.is_none() && secondary_sink.is_none() {
            self.emit(AudioEvent::Error {
                message: format!("no output available to play clip {clip_id}"),
            });
            return;
        }

        self.playing.insert(
            clip_id.clone(),
            ActivePlayback {
                clip_id: clip_id.clone(),
                clip_volume,
                monitor: monitor_sink,
                secondary: secondary_sink,
            },
        );
        self.emit(AudioEvent::PlaybackStarted { clip_id });
    }

    fn stop_clip(&mut self, clip_id: &str, emit_stopped: bool) {
        if let Some(pb) = self.playing.remove(clip_id) {
            pb.stop();
            if emit_stopped {
                self.emit(AudioEvent::PlaybackStopped {
                    clip_id: clip_id.to_string(),
                });
            }
        }
    }

    fn stop_all(&mut self) {
        let ids: Vec<String> = self.playing.keys().cloned().collect();
        for id in ids {
            self.stop_clip(&id, true);
        }
    }

    fn poll_finished(&mut self) {
        let finished: Vec<String> = self
            .playing
            .iter()
            .filter(|(_, pb)| pb.is_finished())
            .map(|(id, _)| id.clone())
            .collect();

        for id in finished {
            if let Some(pb) = self.playing.remove(&id) {
                // Ensure sinks are dropped/stopped.
                pb.stop();
                self.emit(AudioEvent::PlaybackStopped {
                    clip_id: pb.clip_id,
                });
            }
        }
    }
}

fn open_output_path(name: Option<&str>) -> Result<OutputPath, String> {
    let device = resolve_output_device(name).map_err(|e| e.to_string())?;
    let (stream, handle) =
        OutputStream::try_from_device(&device).map_err(|e| format!("open stream: {e}"))?;
    Ok(OutputPath {
        _stream: stream,
        handle,
    })
}

fn try_start_sink(
    handle: &OutputStreamHandle,
    clip: &DecodedClip,
    loop_enabled: bool,
    gain: f32,
    trim_start_secs: f32,
    trim_end_secs: Option<f32>,
) -> Option<Sink> {
    let sink = Sink::try_new(handle).ok()?;
    // Volume lives on the Sink so SetMasterVolume can update live playback.
    sink.set_volume(gain);
    let source =
        CachedSource::from_clip_region(clip, loop_enabled, trim_start_secs, trim_end_secs);
    sink.append(source);
    sink.play();
    Some(sink)
}

/// Blocking engine loop — runs on a dedicated OS thread.
pub fn run(cmd_rx: Receiver<AudioCommand>, event_tx: Sender<AudioEvent>) {
    let mut state = EngineState::new(event_tx);
    debug!("audio engine thread started");

    loop {
        state.poll_finished();

        match cmd_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(cmd) => state.handle_command(cmd),
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }

    state.stop_all();
    debug!("audio engine thread stopped");
}
