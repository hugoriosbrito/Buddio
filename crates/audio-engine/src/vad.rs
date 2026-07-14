//! Voice-activity keep-alive for Discord / Zoom style VAD gates.
//!
//! A single short beep at clip start is not enough: Discord's VAD (especially
//! with noise suppression) closes mid-song when energy looks "non-speech".
//! This source plays a strong opening burst, then soft formant-like pulses
//! for as long as the host keeps the sink alive.

use std::f32::consts::TAU;
use std::time::Duration;

use rodio::Source;

/// Soft mid-band carrier that tends to register as voice energy better than a
/// pure 1 kHz sine (which Krisp/RNNoise often kills).
const FORMANTS_HZ: [f32; 3] = [320.0, 980.0, 1850.0];

pub struct VadKeepaliveSource {
    sample_rate: u32,
    channels: u16,
    /// Absolute sample index across the interleaved stream.
    sample_i: u64,
    initial_burst_frames: u64,
    pulse_period_frames: u64,
    pulse_on_frames: u64,
    /// Channel cursor within the current frame.
    ch: u16,
    current: f32,
}

impl VadKeepaliveSource {
    /// ~140 ms opening burst, then ~35 ms pulses every ~220 ms.
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        let rate = sample_rate.max(8_000);
        Self {
            sample_rate: rate,
            channels: channels.max(1),
            sample_i: 0,
            initial_burst_frames: ((rate as f32) * 0.14) as u64,
            pulse_period_frames: ((rate as f32) * 0.22) as u64,
            pulse_on_frames: ((rate as f32) * 0.035) as u64,
            ch: 0,
            current: 0.0,
        }
    }

    fn frame_sample(&self, frame: u64) -> f32 {
        let in_burst = frame < self.initial_burst_frames;
        let (amp, local, window) = if in_burst {
            (0.48f32, frame, self.initial_burst_frames.max(1))
        } else {
            let after = frame - self.initial_burst_frames;
            let period = self.pulse_period_frames.max(1);
            let in_period = after % period;
            if in_period >= self.pulse_on_frames {
                return 0.0;
            }
            (0.26f32, in_period, self.pulse_on_frames.max(1))
        };

        let t = frame as f32 / self.sample_rate as f32;
        // Raised-cosine edges avoid clicks that VAD can treat as glitches.
        let fade = (window as f32 * 0.15).max(1.0);
        let env = if (local as f32) < fade {
            (local as f32) / fade
        } else if (local as f32) > window as f32 - fade {
            (window as f32 - local as f32) / fade
        } else {
            1.0
        };

        let mut s = 0.0f32;
        for (i, &hz) in FORMANTS_HZ.iter().enumerate() {
            let w = match i {
                0 => 0.45,
                1 => 0.35,
                _ => 0.20,
            };
            s += (TAU * hz * t).sin() * w;
        }
        // Tiny noise so deep NS models don't classify it as a pure tone.
        let noise = {
            let x = frame.wrapping_mul(1103515245).wrapping_add(12345);
            ((x >> 16) as u16 as f32 / 65535.0) * 2.0 - 1.0
        };
        (s * 0.92 + noise * 0.08) * amp * env
    }
}

impl Iterator for VadKeepaliveSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.ch == 0 {
            let frame = self.sample_i / u64::from(self.channels);
            self.current = self.frame_sample(frame);
        }
        let sample = self.current;
        self.ch += 1;
        self.sample_i += 1;
        if self.ch >= self.channels {
            self.ch = 0;
        }
        Some(sample)
    }
}

impl Source for VadKeepaliveSource {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_burst_is_louder_than_idle_gaps() {
        let rate = 48_000u32;
        let mut src = VadKeepaliveSource::new(rate, 1);
        let mut peak_burst = 0.0f32;
        for _ in 0..2000 {
            peak_burst = peak_burst.max(src.next().unwrap().abs());
        }
        // Jump into the middle of a pulse-off window (after burst + half pulse).
        let burst = ((rate as f32) * 0.14) as u64;
        let period = ((rate as f32) * 0.22) as u64;
        let on = ((rate as f32) * 0.035) as u64;
        let skip_to_gap = burst + on + 10;
        for _ in 2000..skip_to_gap {
            let _ = src.next();
        }
        let mut peak_gap = 0.0f32;
        for _ in 0..(period - on - 20).min(500) {
            peak_gap = peak_gap.max(src.next().unwrap().abs());
        }
        assert!(peak_burst > 0.2, "burst peak={peak_burst}");
        assert!(
            peak_gap < 0.05,
            "gap should be near silence, peak={peak_gap}"
        );
    }

    #[test]
    fn pulses_keep_emitting_energy_after_burst() {
        let mut src = VadKeepaliveSource::new(48_000, 2);
        // Advance past opening burst into pulse region (~200 ms stereo).
        for _ in 0..(48_000 * 2 / 5) {
            let _ = src.next();
        }
        let mut peak = 0.0f32;
        for _ in 0..(48_000 * 2) {
            peak = peak.max(src.next().unwrap().abs());
        }
        assert!(peak > 0.1, "expected keepalive pulses, peak={peak}");
    }
}
