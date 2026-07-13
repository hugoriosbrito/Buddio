//! Live microphone capture mixed into the secondary (call) output only.
//!
//! Captures via cpal into a lock-free-ish ring, then a persistent rodio [`Sink`]
//! on the secondary path plays a [`MicSource`] so voice + soundboard share CABLE Input.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::traits::{DeviceTrait, StreamTrait};
use parking_lot::Mutex;
use rodio::{Sink, Source};
use tracing::warn;

use crate::error::{AudioError, Result};
use crate::mic_meter::resolve_input_device_for_mic_mix;

/// Default gain for mic→CABLE mix. Full 1.0 is too hot for Discord's meter
/// after WASAPI shared-mode + virtual cable.
pub const DEFAULT_MIC_MIX_GAIN: f32 = 0.55;

/// Live-adjustable mic gain shared between the engine thread and the audio callback.
#[derive(Clone)]
pub struct SharedMicGain {
    bits: Arc<AtomicU32>,
}

impl SharedMicGain {
    pub fn new(gain: f32) -> Self {
        Self {
            bits: Arc::new(AtomicU32::new(gain.clamp(0.0, 2.0).to_bits())),
        }
    }

    pub fn set(&self, gain: f32) {
        self.bits
            .store(gain.clamp(0.0, 2.0).to_bits(), Ordering::Relaxed);
    }

    pub fn get(&self) -> f32 {
        f32::from_bits(self.bits.load(Ordering::Relaxed))
    }
}

/// Shared PCM ring (mono f32 at the capture rate).
#[derive(Clone, Default)]
pub struct MicRing {
    inner: Arc<Mutex<VecDeque<f32>>>,
    capacity: usize,
}

impl MicRing {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
            capacity: capacity.max(1024),
        }
    }

    pub fn push_samples(&self, samples: &[f32]) {
        let mut q = self.inner.lock();
        for &s in samples {
            if q.len() >= self.capacity {
                q.pop_front();
            }
            q.push_back(s.clamp(-1.0, 1.0));
        }
    }

    pub fn pop(&self) -> Option<f32> {
        self.inner.lock().pop_front()
    }

    pub fn clear(&self) {
        self.inner.lock().clear();
    }
}

/// Infinite mono/stereo source that reads from [`MicRing`], with simple rate conversion.
pub struct MicSource {
    ring: MicRing,
    channels: u16,
    out_rate: u32,
    in_rate: u32,
    /// Fractional read position in input-sample space for resampling.
    phase: f64,
    /// Last mono sample for linear interpolation.
    prev: f32,
    /// Channel cursor within the current output frame (0..channels).
    ch: u16,
    current: f32,
    gain: SharedMicGain,
}

impl MicSource {
    pub fn new(
        ring: MicRing,
        channels: u16,
        out_rate: u32,
        in_rate: u32,
        gain: SharedMicGain,
    ) -> Self {
        Self {
            ring,
            channels: channels.max(1),
            out_rate: out_rate.max(1),
            in_rate: in_rate.max(1),
            phase: 0.0,
            prev: 0.0,
            ch: 0,
            current: 0.0,
            gain,
        }
    }

    fn next_mono(&mut self) -> f32 {
        let raw = if self.in_rate == self.out_rate {
            let s = self.ring.pop().unwrap_or(0.0);
            self.prev = s;
            s
        } else {
            // Advance phase by in_rate/out_rate input samples per output sample.
            let step = f64::from(self.in_rate) / f64::from(self.out_rate);
            self.phase += step;
            while self.phase >= 1.0 {
                self.phase -= 1.0;
                if let Some(s) = self.ring.pop() {
                    self.prev = s;
                }
            }
            // Hold last sample (zero-order) — low CPU, good enough for voice.
            self.prev
        };
        // Soft-limit after gain so a hot mic or residual loop can't slam Discord.
        (raw * self.gain.get()).tanh()
    }
}

impl Iterator for MicSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.ch == 0 {
            self.current = self.next_mono();
        }
        let sample = self.current;
        self.ch += 1;
        if self.ch >= self.channels {
            self.ch = 0;
        }
        Some(sample)
    }
}

impl Source for MicSource {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.out_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

struct CaptureInner {
    stop: AtomicBool,
    join: Mutex<Option<JoinHandle<()>>>,
    /// Input stream kept on the capture thread (via JoinHandle lifetime).
    _marker: (),
}

/// Owns the mic capture thread + ring buffer written by the cpal callback.
pub struct MicCapture {
    ring: MicRing,
    inner: Arc<CaptureInner>,
    pub in_rate: u32,
}

impl MicCapture {
    /// Start capturing `input_device` (None = system default) into a ring.
    pub fn start(input_device: Option<String>) -> Result<Self> {
        let device = resolve_input_device_for_mic_mix(input_device.as_deref())?;
        let device_name = device.name().unwrap_or_else(|_| "<unknown>".into());
        tracing::info!(%device_name, "mic mix capture device");
        let config = device
            .default_input_config()
            .map_err(|e| AudioError::Device(e.to_string()))?;
        let in_rate = config.sample_rate().0;
        let in_channels = config.channels();
        // ~250 ms of mono at input rate.
        let capacity = (in_rate as usize / 4).max(4096);
        let ring = MicRing::new(capacity);
        let ring_cb = ring.clone();

        let inner = Arc::new(CaptureInner {
            stop: AtomicBool::new(false),
            join: Mutex::new(None),
            _marker: (),
        });
        let stop_flag = Arc::clone(&inner);

        let sample_format = config.sample_format();
        let stream_config: cpal::StreamConfig = config.clone().into();

        let handle = thread::Builder::new()
            .name("buddio-mic-mix".into())
            .spawn(move || {
                let err_fn = |err| warn!(error = %err, "mic mix callback error");
                let stream = match sample_format {
                    cpal::SampleFormat::F32 => device.build_input_stream(
                        &stream_config,
                        move |data: &[f32], _| {
                            push_downmix_f32(data, in_channels, &ring_cb);
                        },
                        err_fn,
                        None,
                    ),
                    cpal::SampleFormat::I16 => device.build_input_stream(
                        &stream_config,
                        move |data: &[i16], _| {
                            let mut tmp = Vec::with_capacity(data.len());
                            for &s in data {
                                tmp.push(s as f32 / i16::MAX as f32);
                            }
                            push_downmix_f32(&tmp, in_channels, &ring_cb);
                        },
                        err_fn,
                        None,
                    ),
                    cpal::SampleFormat::U16 => device.build_input_stream(
                        &stream_config,
                        move |data: &[u16], _| {
                            let mut tmp = Vec::with_capacity(data.len());
                            for &s in data {
                                tmp.push((s as f32 / u16::MAX as f32) * 2.0 - 1.0);
                            }
                            push_downmix_f32(&tmp, in_channels, &ring_cb);
                        },
                        err_fn,
                        None,
                    ),
                    other => {
                        warn!(?other, "unsupported mic mix sample format");
                        return;
                    }
                };

                let stream = match stream {
                    Ok(s) => s,
                    Err(err) => {
                        warn!(error = %err, "mic mix stream build failed");
                        return;
                    }
                };
                if let Err(err) = stream.play() {
                    warn!(error = %err, "mic mix stream play failed");
                    return;
                }
                while !stop_flag.stop.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(40));
                }
                drop(stream);
            })
            .map_err(|e| AudioError::Device(e.to_string()))?;

        *inner.join.lock() = Some(handle);

        Ok(Self {
            ring,
            inner,
            in_rate,
        })
    }

    pub fn ring(&self) -> MicRing {
        self.ring.clone()
    }

    pub fn stop(&self) {
        self.inner.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.inner.join.lock().take() {
            let _ = handle.join();
        }
        self.ring.clear();
    }
}

impl Drop for MicCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

fn push_downmix_f32(data: &[f32], channels: u16, ring: &MicRing) {
    let ch = channels.max(1) as usize;
    if ch == 1 {
        ring.push_samples(data);
        return;
    }
    let mut mono = Vec::with_capacity(data.len() / ch + 1);
    for frame in data.chunks_exact(ch) {
        let mut sum = 0.0f32;
        for &s in frame {
            sum += s;
        }
        mono.push(sum / ch as f32);
    }
    ring.push_samples(&mono);
}

/// Attach a persistent mic sink on the secondary output handle.
pub fn start_mic_sink(
    handle: &rodio::OutputStreamHandle,
    ring: MicRing,
    out_channels: u16,
    out_rate: u32,
    in_rate: u32,
    gain: SharedMicGain,
) -> Option<Sink> {
    let sink = Sink::try_new(handle).ok()?;
    sink.set_volume(1.0);
    let source = MicSource::new(ring, out_channels, out_rate, in_rate, gain);
    sink.append(source);
    sink.play();
    Some(sink)
}
