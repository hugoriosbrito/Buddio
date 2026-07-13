//! Cached PCM source that streams from `Arc<[f32]>` without allocating in the callback path
//! beyond iterator state (decode already happened on LoadClip / first play).

use std::sync::Arc;
use std::time::Duration;

use rodio::Source;

use crate::cache::DecodedClip;

/// Iterator/`Source` over interleaved hot-cache PCM, optionally trimmed with fade envelope.
#[derive(Clone)]
pub struct CachedSource {
    data: Arc<[f32]>,
    channels: u16,
    sample_rate: u32,
    cursor: usize,
    end: usize,
    loop_enabled: bool,
    loop_start: usize,
    /// Samples (interleaved) for fade-in from region start.
    fade_in_samples: usize,
    /// Samples (interleaved) for fade-out before region end.
    fade_out_samples: usize,
}

impl CachedSource {
    #[allow(dead_code)]
    pub fn from_clip(clip: &DecodedClip, loop_enabled: bool) -> Self {
        Self::from_clip_region(clip, loop_enabled, 0.0, None, None, None)
    }

    /// Play a region of the clip. `trim_start_secs` / `trim_end_secs` are wall-clock offsets.
    /// Optional `fade_in_secs` / `fade_out_secs` apply a linear amplitude envelope.
    pub fn from_clip_region(
        clip: &DecodedClip,
        loop_enabled: bool,
        trim_start_secs: f32,
        trim_end_secs: Option<f32>,
        fade_in_secs: Option<f32>,
        fade_out_secs: Option<f32>,
    ) -> Self {
        let channels = clip.channels.max(1) as usize;
        let rate = clip.sample_rate.max(1) as f32;
        let total = clip.pcm.len();

        let start_frame = (trim_start_secs.max(0.0) * rate) as usize;
        let start = (start_frame * channels).min(total);

        let end = match trim_end_secs {
            Some(end_secs) if end_secs > trim_start_secs => {
                let end_frame = (end_secs.max(0.0) * rate) as usize;
                (end_frame * channels).min(total).max(start)
            }
            _ => total,
        };

        let region_len = end.saturating_sub(start);
        let fade_in = ((fade_in_secs.unwrap_or(0.0).max(0.0) * rate) as usize)
            .saturating_mul(channels)
            .min(region_len / 2);
        let fade_out = ((fade_out_secs.unwrap_or(0.0).max(0.0) * rate) as usize)
            .saturating_mul(channels)
            .min(region_len / 2);

        Self {
            data: Arc::clone(&clip.pcm),
            channels: clip.channels,
            sample_rate: clip.sample_rate,
            cursor: start,
            end,
            loop_enabled,
            loop_start: start,
            fade_in_samples: fade_in,
            fade_out_samples: fade_out,
        }
    }

    #[inline]
    fn envelope(&self) -> f32 {
        let pos = self.cursor.saturating_sub(self.loop_start);
        let mut mul = 1.0f32;
        if self.fade_in_samples > 0 && pos < self.fade_in_samples {
            mul = pos as f32 / self.fade_in_samples as f32;
        }
        if self.fade_out_samples > 0 {
            let remaining = self.end.saturating_sub(self.cursor);
            if remaining < self.fade_out_samples {
                let out_mul = remaining as f32 / self.fade_out_samples as f32;
                mul = mul.min(out_mul);
            }
        }
        mul.clamp(0.0, 1.0)
    }
}

impl Iterator for CachedSource {
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        if self.data.is_empty() || self.loop_start >= self.end {
            return None;
        }
        if self.cursor >= self.end {
            if self.loop_enabled {
                self.cursor = self.loop_start;
            } else {
                return None;
            }
        }
        let sample = self.data[self.cursor] * self.envelope();
        self.cursor += 1;
        Some(sample)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        if self.loop_enabled {
            (usize::MAX, None)
        } else {
            let remaining = self.end.saturating_sub(self.cursor);
            (remaining, Some(remaining))
        }
    }
}

impl Source for CachedSource {
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
        if self.loop_enabled || self.sample_rate == 0 || self.channels == 0 {
            return None;
        }
        let frames = self.end.saturating_sub(self.loop_start) as u64 / u64::from(self.channels);
        let secs = frames as f64 / f64::from(self.sample_rate);
        Some(Duration::from_secs_f64(secs))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cached_source_plays_then_ends() {
        let clip = DecodedClip::from_pcm(vec![0.1, 0.2, 0.3], 48_000, 1);
        let src = CachedSource::from_clip(&clip, false);
        let collected: Vec<f32> = src.collect();
        assert_eq!(collected, vec![0.1, 0.2, 0.3]);
    }

    #[test]
    fn cached_source_loops() {
        let clip = DecodedClip::from_pcm(vec![1.0, 2.0], 48_000, 1);
        let mut src = CachedSource::from_clip(&clip, true);
        let mut out = Vec::new();
        for _ in 0..5 {
            out.push(src.next().unwrap());
        }
        assert_eq!(out, vec![1.0, 2.0, 1.0, 2.0, 1.0]);
    }

    #[test]
    fn cached_source_trim_region() {
        // 4 samples at 4 Hz → 1 second total; trim 0.25..0.75 → samples index 1..3
        let clip = DecodedClip::from_pcm(vec![0.0, 0.1, 0.2, 0.3], 4, 1);
        let src = CachedSource::from_clip_region(&clip, false, 0.25, Some(0.75), None, None);
        let collected: Vec<f32> = src.collect();
        assert_eq!(collected, vec![0.1, 0.2]);
    }

    #[test]
    fn fade_in_ramps_from_zero() {
        let clip = DecodedClip::from_pcm(vec![1.0; 10], 10, 1);
        let src = CachedSource::from_clip_region(&clip, false, 0.0, None, Some(0.5), None);
        let collected: Vec<f32> = src.collect();
        assert!(collected[0] < 0.15);
        assert!((collected[4] - 0.8).abs() < 0.15 || collected[4] > collected[0]);
        assert!((collected[9] - 1.0).abs() < 0.01);
    }

    #[test]
    fn fade_out_ramps_to_zero() {
        let clip = DecodedClip::from_pcm(vec![1.0; 10], 10, 1);
        let src = CachedSource::from_clip_region(&clip, false, 0.0, None, None, Some(0.5));
        let collected: Vec<f32> = src.collect();
        assert!((collected[0] - 1.0).abs() < 0.01);
        assert!(collected[9] < 0.25);
    }
}
