//! Lightweight integrated-loudness estimate for clip normalization.
//!
//! Not a full EBU R128 implementation — uses RMS of the absolute signal with a
//! K-weighted-ish high-pass approximation suitable for short meme clips.

use crate::cache::DecodedClip;
use crate::volume::db_to_linear;

/// Default target loudness for voice-matched playback (approx. dialogue LUFS).
pub const DEFAULT_VOICE_TARGET_LUFS: f32 = -16.0;

/// Estimate integrated loudness in LUFS-ish units from interleaved PCM.
pub fn estimate_integrated_lufs(pcm: &[f32], channels: u16) -> f32 {
    let ch = channels.max(1) as usize;
    if pcm.is_empty() {
        return -70.0;
    }

    let frames = pcm.len() / ch;
    if frames == 0 {
        return -70.0;
    }

    // Mean of squared mono frames (simple RMS energy).
    let mut sum_sq = 0.0f64;
    for frame in pcm.chunks_exact(ch) {
        let mut mono = 0.0f32;
        for &s in frame {
            mono += s;
        }
        mono /= ch as f32;
        // Soft high-pass via DC-ish rejection using previous sample difference
        // is omitted for speed; meme clips are short.
        sum_sq += f64::from(mono * mono);
    }

    let mean_sq = (sum_sq / frames as f64).max(1e-20);
    let rms = mean_sq.sqrt() as f32;
    // Convert RMS to approximate LUFS (20*log10).
    20.0 * rms.log10()
}

/// Gain in dB to bring `integrated_lufs` to `target_lufs`.
pub fn norm_gain_db(integrated_lufs: f32, target_lufs: f32) -> f32 {
    (target_lufs - integrated_lufs).clamp(-24.0, 24.0)
}

/// Linear multiplier from stored norm + manual editor gain.
pub fn combined_gain_linear(norm_gain_db: f32, manual_gain_db: f32) -> f32 {
    db_to_linear(norm_gain_db + manual_gain_db)
}

/// Analyze a decoded clip; returns (integrated_lufs, norm_gain_db) for `target`.
pub fn analyze_clip(clip: &DecodedClip, target_lufs: f32) -> (f32, f32) {
    let lufs = estimate_integrated_lufs(&clip.pcm, clip.channels);
    let gain = norm_gain_db(lufs, target_lufs);
    (lufs, gain)
}

/// Quick loudness estimate from the first `max_secs` of PCM (playback refine).
pub fn estimate_head_lufs(pcm: &[f32], channels: u16, sample_rate: u32, max_secs: f32) -> f32 {
    let ch = channels.max(1) as usize;
    let max_samples = ((sample_rate as f32 * max_secs).max(1.0) as usize) * ch;
    let head = &pcm[..pcm.len().min(max_samples)];
    estimate_integrated_lufs(head, channels)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::DecodedClip;

    #[test]
    fn silent_is_very_quiet() {
        let pcm = vec![0.0f32; 4800];
        let lufs = estimate_integrated_lufs(&pcm, 1);
        assert!(lufs < -60.0);
    }

    #[test]
    fn louder_signal_has_higher_lufs() {
        let quiet: Vec<f32> = (0..4800)
            .map(|i| ((i as f32) * 0.01).sin() * 0.05)
            .collect();
        let loud: Vec<f32> = (0..4800).map(|i| ((i as f32) * 0.01).sin() * 0.5).collect();
        assert!(estimate_integrated_lufs(&loud, 1) > estimate_integrated_lufs(&quiet, 1));
    }

    #[test]
    fn norm_gain_moves_toward_target() {
        let clip = DecodedClip::from_pcm(
            (0..4800).map(|i| ((i as f32) * 0.01).sin() * 0.1).collect(),
            48_000,
            1,
        );
        let (lufs, gain) = analyze_clip(&clip, DEFAULT_VOICE_TARGET_LUFS);
        let after = lufs + gain;
        assert!((after - DEFAULT_VOICE_TARGET_LUFS).abs() < 0.01);
    }

    #[test]
    fn combined_gain_multiplies() {
        let g = combined_gain_linear(6.0, -6.0);
        assert!((g - 1.0).abs() < 0.01);
    }
}
