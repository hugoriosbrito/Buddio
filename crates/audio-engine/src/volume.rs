//! Volume / gain helpers (pure math — safe to unit-test offline).

/// Convert decibels to linear gain (`10^(db/20)`).
#[inline]
pub fn db_to_linear(db: f32) -> f32 {
    10f32.powf(db / 20.0)
}

/// Combine master and per-clip volume into a single linear gain.
///
/// Negative inputs are clamped to `0.0`. Values above `1.0` are allowed so the
/// host can intentionally boost a clip.
#[inline]
pub fn effective_gain(master: f32, clip_volume: f32) -> f32 {
    master.max(0.0) * clip_volume.max(0.0)
}

/// Soft-clamp a gain into a practical playback range without hard distortion gating.
#[inline]
pub fn clamp_gain(gain: f32) -> f32 {
    gain.clamp(0.0, 4.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn master_multiplies_clip_volume() {
        assert!((effective_gain(0.5, 0.5) - 0.25).abs() < f32::EPSILON);
        assert!((effective_gain(1.0, 0.8) - 0.8).abs() < f32::EPSILON);
        assert!((effective_gain(0.0, 1.0) - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn db_to_linear_unity_at_zero() {
        assert!((db_to_linear(0.0) - 1.0).abs() < 1e-6);
        assert!((db_to_linear(6.0) - 2.0).abs() < 0.01);
    }

    #[test]
    fn negative_volumes_clamp_to_zero() {
        assert_eq!(effective_gain(-1.0, 0.5), 0.0);
        assert_eq!(effective_gain(0.5, -2.0), 0.0);
    }

    #[test]
    fn clamp_gain_bounds() {
        assert_eq!(clamp_gain(-1.0), 0.0);
        assert_eq!(clamp_gain(0.75), 0.75);
        assert_eq!(clamp_gain(10.0), 4.0);
    }
}
