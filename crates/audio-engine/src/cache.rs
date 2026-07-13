//! Hot PCM cache: decoded clips kept in memory for instant playback.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use parking_lot::RwLock;
use sha2::{Digest, Sha256};

/// Decoded, interleaved PCM ready for the audio thread (never decoded in callbacks).
#[derive(Debug, Clone)]
pub struct DecodedClip {
    pub pcm: Arc<[f32]>,
    pub sample_rate: u32,
    pub channels: u16,
    /// Fingerprint of source path + metadata (for cache freshness / debugging).
    pub fingerprint: String,
}

impl DecodedClip {
    /// Build a clip from already-decoded interleaved PCM (tests / synthetic audio).
    pub fn from_pcm(samples: Vec<f32>, sample_rate: u32, channels: u16) -> Self {
        let fingerprint = fingerprint_pcm(&samples, sample_rate, channels);
        Self {
            pcm: Arc::from(samples.into_boxed_slice()),
            sample_rate,
            channels,
            fingerprint,
        }
    }

    pub fn frame_count(&self) -> usize {
        if self.channels == 0 {
            0
        } else {
            self.pcm.len() / self.channels as usize
        }
    }

    pub fn duration_secs(&self) -> f64 {
        if self.sample_rate == 0 {
            0.0
        } else {
            self.frame_count() as f64 / f64::from(self.sample_rate)
        }
    }
}

/// Thread-safe hot cache keyed by `clip_id`.
#[derive(Debug, Default)]
pub struct ClipCache {
    inner: RwLock<HashMap<String, Arc<DecodedClip>>>,
}

impl ClipCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert(&self, clip_id: impl Into<String>, clip: DecodedClip) {
        self.inner.write().insert(clip_id.into(), Arc::new(clip));
    }

    pub fn get(&self, clip_id: &str) -> Option<Arc<DecodedClip>> {
        self.inner.read().get(clip_id).cloned()
    }

    pub fn remove(&self, clip_id: &str) -> Option<Arc<DecodedClip>> {
        self.inner.write().remove(clip_id)
    }

    pub fn contains(&self, clip_id: &str) -> bool {
        self.inner.read().contains_key(clip_id)
    }

    pub fn len(&self) -> usize {
        self.inner.read().len()
    }

    pub fn is_empty(&self) -> bool {
        self.inner.read().is_empty()
    }

    pub fn clear(&self) {
        self.inner.write().clear();
    }
}

/// Stable fingerprint from path + size + mtime (no file content read).
pub fn fingerprint_path(path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    if let Ok(meta) = std::fs::metadata(path) {
        hasher.update(meta.len().to_le_bytes());
        if let Ok(modified) = meta.modified() {
            if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                hasher.update(dur.as_secs().to_le_bytes());
                hasher.update(dur.subsec_nanos().to_le_bytes());
            }
        }
    }
    hex_digest(hasher.finalize())
}

fn fingerprint_pcm(samples: &[f32], sample_rate: u32, channels: u16) -> String {
    let mut hasher = Sha256::new();
    hasher.update(sample_rate.to_le_bytes());
    hasher.update(channels.to_le_bytes());
    hasher.update((samples.len() as u64).to_le_bytes());
    // Sample a few points so synthetic fixtures stay cheap.
    for (i, s) in samples
        .iter()
        .enumerate()
        .step_by((samples.len() / 16).max(1))
    {
        hasher.update(i.to_le_bytes());
        hasher.update(s.to_bits().to_le_bytes());
    }
    hex_digest(hasher.finalize())
}

fn hex_digest(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hot_cache_load_unload() {
        let cache = ClipCache::new();
        assert!(cache.is_empty());

        let clip = DecodedClip::from_pcm(vec![0.0, 0.25, 0.5, 0.25], 44_100, 1);
        assert_eq!(clip.frame_count(), 4);
        assert!(clip.duration_secs() > 0.0);

        cache.insert("beep", clip);
        assert!(cache.contains("beep"));
        assert_eq!(cache.len(), 1);

        let got = cache.get("beep").expect("present");
        assert_eq!(got.channels, 1);
        assert_eq!(got.pcm.len(), 4);

        let removed = cache.remove("beep");
        assert!(removed.is_some());
        assert!(!cache.contains("beep"));
        assert!(cache.is_empty());
    }

    #[test]
    fn fingerprint_path_is_stable_for_same_path() {
        let a = fingerprint_path(Path::new("C:\\sounds\\horn.wav"));
        let b = fingerprint_path(Path::new("C:\\sounds\\horn.wav"));
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
    }
}
