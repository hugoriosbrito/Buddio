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

use crate::cache::{fingerprint_path, ClipCache, DecodedClip};
use crate::command::AudioCommand;
use crate::decode;
use crate::device::resolve_output_device;
use crate::event::AudioEvent;
use crate::mic_mix::{self, MicCapture, SharedMicGain};
use crate::mic_route::MicRouteMode;
use crate::source::CachedSource;
use crate::vad::VadKeepaliveSource;
use crate::volume::{clamp_gain, db_to_linear, effective_gain};

const VAD_KEEPALIVE_ID: &str = "__vad_keepalive__";

fn is_vad_clip_id(id: &str) -> bool {
    id.starts_with("__vad")
}

/// One open output path (monitor or secondary).
struct OutputPath {
    /// Kept alive so the cpal stream does not tear down.
    _stream: OutputStream,
    handle: OutputStreamHandle,
    sample_rate: u32,
    channels: u16,
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
    /// Exclusive mic routing on secondary.
    mic_route_mode: MicRouteMode,
    ducking_db: f32,
    mic_input_name: Option<String>,
    /// Whether mic capture should run at all (false only when mode is unused
    /// without secondary — capture always runs when secondary is open and mode
    /// needs voice).
    mic_capture: Option<MicCapture>,
    /// Persistent sink on secondary carrying live mic PCM.
    mic_sink: Option<Sink>,
    mic_gain: SharedMicGain,
    vad_sound_enabled: bool,
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
            mic_route_mode: MicRouteMode::Mix,
            ducking_db: -8.0,
            mic_input_name: None,
            mic_capture: None,
            mic_sink: None,
            mic_gain: SharedMicGain::new(mic_mix::DEFAULT_MIC_MIX_GAIN),
            vad_sound_enabled: true,
        };
        state.open_monitor(None);
        state
    }

    fn emit(&self, event: AudioEvent) {
        // Non-blocking: drop if the host is not draining events.
        let _ = self.event_tx.try_send(event);
    }

    fn active_playback_count(&self) -> usize {
        self.playing
            .keys()
            .filter(|id| !is_vad_clip_id(id))
            .count()
    }

    fn has_secondary_user_playback(&self) -> bool {
        self.playing.iter().any(|(id, pb)| {
            !is_vad_clip_id(id) && pb.secondary.as_ref().is_some_and(|s| !s.empty())
        })
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
        self.stop_mic_mix_io();
        self.secondary_name = name.clone();
        match name {
            None => {
                self.secondary = None;
            }
            Some(ref n) => match open_output_path(Some(n)) {
                Ok(path) => {
                    self.secondary = Some(path);
                    self.sync_mic_mix();
                }
                Err(msg) => {
                    self.secondary = None;
                    self.emit(AudioEvent::DeviceWarning { message: msg });
                }
            },
        }
    }

    fn stop_mic_mix_io(&mut self) {
        if let Some(sink) = self.mic_sink.take() {
            sink.stop();
        }
        if let Some(capture) = self.mic_capture.take() {
            capture.stop();
        }
    }

    /// Desired base mic gain when no clip is playing (or mix mode).
    fn resting_mic_gain(&self) -> f32 {
        match self.mic_route_mode {
            MicRouteMode::Mix | MicRouteMode::Ducking | MicRouteMode::SoundOnly => {
                mic_mix::DEFAULT_MIC_MIX_GAIN
            }
        }
    }

    /// Apply ducking / block-voice gain based on active playback.
    fn refresh_mic_gain_for_playback(&self) {
        let playing = self.active_playback_count() > 0;
        let gain = match self.mic_route_mode {
            MicRouteMode::Mix => self.resting_mic_gain(),
            MicRouteMode::Ducking => {
                if playing {
                    self.resting_mic_gain() * db_to_linear(self.ducking_db)
                } else {
                    self.resting_mic_gain()
                }
            }
            MicRouteMode::SoundOnly => {
                if playing {
                    0.0
                } else {
                    self.resting_mic_gain()
                }
            }
        };
        self.mic_gain.set(gain);
    }

    /// Start/stop mic capture + secondary mic sink according to flags.
    fn sync_mic_mix(&mut self) {
        self.stop_mic_mix_io();
        // All three modes need mic on CABLE when idle (so Discord hears voice).
        // sound_only/ducking only mute/attenuate during playback.
        let Some(secondary) = self.secondary.as_ref() else {
            return;
        };
        self.mic_gain.set(self.resting_mic_gain());
        match MicCapture::start(self.mic_input_name.clone()) {
            Ok(capture) => {
                let ring = capture.ring();
                let in_rate = capture.in_rate;
                let sink = mic_mix::start_mic_sink(
                    &secondary.handle,
                    ring,
                    secondary.channels,
                    secondary.sample_rate,
                    in_rate,
                    self.mic_gain.clone(),
                );
                if sink.is_none() {
                    warn!("failed to attach mic mix sink on secondary");
                    capture.stop();
                    self.emit(AudioEvent::DeviceWarning {
                        message: "não foi possível misturar o microfone na saída virtual".into(),
                    });
                    return;
                }
                self.mic_capture = Some(capture);
                self.mic_sink = sink;
                self.refresh_mic_gain_for_playback();
                debug!(
                    in_rate,
                    out_rate = secondary.sample_rate,
                    mode = ?self.mic_route_mode,
                    "mic route active on secondary"
                );
            }
            Err(err) => {
                warn!(error = %err, "mic mix capture failed");
                self.emit(AudioEvent::DeviceWarning {
                    message: format!("microfone para mix: {err}"),
                });
            }
        }
    }

    fn set_mic_mix(&mut self, enabled: bool, input_device: Option<String>) {
        // Legacy: enabled=true → Mix, enabled=false → SoundOnly always muted voice path off.
        self.mic_route_mode = if enabled {
            MicRouteMode::Mix
        } else {
            // Disable mic capture entirely (pre-route-mode behavior).
            self.mic_input_name = input_device;
            self.stop_mic_mix_io();
            return;
        };
        self.mic_input_name = input_device;
        self.sync_mic_mix();
    }

    fn set_mic_route(&mut self, mode: MicRouteMode, ducking_db: f32, input_device: Option<String>) {
        self.mic_route_mode = mode;
        self.ducking_db = ducking_db.clamp(-24.0, 0.0);
        self.mic_input_name = input_device;
        self.sync_mic_mix();
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
                play_vad_preamble,
            } => self.play(
                clip_id,
                volume,
                loop_enabled,
                trim_start_secs,
                trim_end_secs,
                fade_in_secs,
                fade_out_secs,
                gain_linear,
                play_vad_preamble,
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
            AudioCommand::SetMicMix {
                enabled,
                input_device,
            } => self.set_mic_mix(enabled, input_device),
            AudioCommand::SetMicRoute {
                mode,
                ducking_db,
                input_device,
            } => self.set_mic_route(mode, ducking_db, input_device),
            AudioCommand::SetVadSound { enabled } => {
                self.vad_sound_enabled = enabled;
                self.sync_vad_keepalive();
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
        // Hotkey path always sends LoadClip+Play; skip re-decode when already cached
        // for the same file (avoids symphonia WARN spam and latency on every press).
        if let Some(existing) = self.cache.get(&clip_id) {
            if existing.fingerprint == fingerprint_path(&path) {
                return;
            }
        }
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

    /// Strong opening burst + soft formant pulses on secondary for the whole
    /// clip — keeps Discord/Zoom VAD open past the first second (music).
    fn start_vad_keepalive(&mut self) {
        let Some((sample_rate, channels, handle)) = self.secondary.as_ref().map(|s| {
            (s.sample_rate, s.channels, s.handle.clone())
        }) else {
            return;
        };
        // Replace any previous keepalive rather than stacking sinks.
        self.stop_clip(VAD_KEEPALIVE_ID, false);

        let source = VadKeepaliveSource::new(sample_rate, channels);
        let Ok(sink) = Sink::try_new(&handle) else {
            return;
        };
        sink.set_volume(1.0);
        sink.append(source);
        sink.play();
        self.playing.insert(
            VAD_KEEPALIVE_ID.into(),
            ActivePlayback {
                clip_id: VAD_KEEPALIVE_ID.into(),
                clip_volume: 1.0,
                monitor: None,
                secondary: Some(sink),
            },
        );
    }

    fn sync_vad_keepalive(&mut self) {
        if !self.vad_sound_enabled || self.secondary.is_none() {
            self.stop_clip(VAD_KEEPALIVE_ID, false);
            return;
        }
        if self.has_secondary_user_playback() {
            if !self.playing.contains_key(VAD_KEEPALIVE_ID) {
                self.start_vad_keepalive();
            }
        } else {
            self.stop_clip(VAD_KEEPALIVE_ID, false);
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
        play_vad_preamble: bool,
    ) {
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
                fade_in_secs,
                fade_out_secs,
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
                        fade_in_secs,
                        fade_out_secs,
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
                fade_in_secs,
                fade_out_secs,
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
        // Keepalive must start (or keep running) for the whole secondary play —
        // a one-shot beep is not enough for Discord VAD on longer music.
        if play_vad_preamble && self.vad_sound_enabled {
            self.sync_vad_keepalive();
        }
        self.refresh_mic_gain_for_playback();
        self.emit(AudioEvent::PlaybackStarted { clip_id });
    }

    fn stop_clip(&mut self, clip_id: &str, emit_stopped: bool) {
        if let Some(pb) = self.playing.remove(clip_id) {
            pb.stop();
            if emit_stopped && !is_vad_clip_id(clip_id) {
                self.emit(AudioEvent::PlaybackStopped {
                    clip_id: clip_id.to_string(),
                });
            }
            if !is_vad_clip_id(clip_id) {
                self.sync_vad_keepalive();
            }
            self.refresh_mic_gain_for_playback();
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
            .filter(|(id, pb)| {
                // Keepalive is infinite — never treat it as finished by emptiness
                // alone while user clips are still going; sync handles teardown.
                if is_vad_clip_id(id) {
                    return false;
                }
                pb.is_finished()
            })
            .map(|(id, _)| id.clone())
            .collect();

        for id in finished.iter() {
            if let Some(pb) = self.playing.remove(id) {
                pb.stop();
                self.emit(AudioEvent::PlaybackStopped {
                    clip_id: pb.clip_id,
                });
            }
        }
        if !finished.is_empty() {
            self.sync_vad_keepalive();
            self.refresh_mic_gain_for_playback();
        }
    }
}

fn open_output_path(name: Option<&str>) -> Result<OutputPath, String> {
    use cpal::traits::DeviceTrait;

    let device = resolve_output_device(name).map_err(|e| e.to_string())?;
    let (sample_rate, channels) = device
        .default_output_config()
        .map(|c| (c.sample_rate().0, c.channels()))
        .unwrap_or((48_000, 2));
    let (stream, handle) = OutputStream::try_from_device(&device)
        .map_err(|e| map_open_stream_error(&e.to_string()))?;
    Ok(OutputPath {
        _stream: stream,
        handle,
        sample_rate,
        channels,
    })
}

fn map_open_stream_error(raw: &str) -> String {
    // WASAPI AUDCLNT_E_DEVICE_IN_USE — classic when both VB-CABLE pins are open.
    if raw.contains("0x8889000A") || raw.to_ascii_lowercase().contains("device_in_use") {
        return "open stream: dispositivo de áudio em uso (0x8889000A). No Windows 10/11 o VB-CABLE tem dois pins (Alto-falantes e CABLE In 16 Ch) que não podem abrir ao mesmo tempo — deixe o monitor nos fones/caixas reais e a saída da call só no CABLE Input.".into();
    }
    format!("open stream: {raw}")
}

#[allow(clippy::too_many_arguments)]
fn try_start_sink(
    handle: &OutputStreamHandle,
    clip: &DecodedClip,
    loop_enabled: bool,
    gain: f32,
    trim_start_secs: f32,
    trim_end_secs: Option<f32>,
    fade_in_secs: Option<f32>,
    fade_out_secs: Option<f32>,
) -> Option<Sink> {
    let sink = Sink::try_new(handle).ok()?;
    // Volume lives on the Sink so SetMasterVolume can update live playback.
    sink.set_volume(gain);
    let source = CachedSource::from_clip_region(
        clip,
        loop_enabled,
        trim_start_secs,
        trim_end_secs,
        fade_in_secs,
        fade_out_secs,
    );
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
