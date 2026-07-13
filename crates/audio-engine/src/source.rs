//! Cached PCM source that streams from `Arc<[f32]>` without allocating in the callback path
//! beyond iterator state (decode already happened on LoadClip / first play).

use std::sync::Arc;
use std::time::Duration;

use rodio::Source;

use crate::cache::DecodedClip;

/// Iterator/`Source` over interleaved hot-cache PCM, optionally trimmed.
#[derive(Clone)]
pub struct CachedSource {
    data: Arc<[f32]>,
    channels: u16,
    sample_rate: u32,
    cursor: usize,
    end: usize,
    loop_enabled: bool,
    loop_start: usize,
}

impl CachedSource {
    #[allow(dead_code)]
    pub fn from_clip(clip: &DecodedClip, loop_enabled: bool) -> Self {
        Self::from_clip_region(clip, loop_enabled, 0.0, None)
    }

    /// Play a region of the clip. `trim_start_secs` / `trim_end_secs` are wall-clock offsets.
    pub fn from_clip_region(
        clip: &DecodedClip,
        loop_enabled: bool,
        trim_start_secs: f32,
        trim_end_secs: Option<f32>,
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

        Self {
            data: Arc::clone(&clip.pcm),
            channels: clip.channels,
            sample_rate: clip.sample_rate,
            cursor: start,
            end,
            loop_enabled,
            loop_start: start,
        }
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
        let sample = self.data[self.cursor];
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
        let src = CachedSource::from_clip_region(&clip, false, 0.25, Some(0.75));
        let collected: Vec<f32> = src.collect();
        assert_eq!(collected, vec![0.1, 0.2]);
    }
}
