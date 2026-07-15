//! Decode audio files to interleaved f32 PCM outside the audio callback.

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use rodio::Source;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::cache::{fingerprint_path, DecodedClip};
use crate::error::{AudioError, Result};

/// Decode an audio file (WAV/MP3/FLAC/OGG/M4A via symphonia) into a hot-cache clip.
///
/// Performs disk I/O and decoding on the caller thread — never from the cpal callback.
pub fn decode_file(path: &Path) -> Result<DecodedClip> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("mp3"))
    {
        return decode_mp3(path);
    }

    let file = File::open(path).map_err(AudioError::Io)?;
    let reader = BufReader::new(file);

    let decoder = rodio::Decoder::new(reader)
        .map_err(|e| AudioError::Decode(format!("{}: {e}", path.display())))?;

    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();
    if sample_rate == 0 || channels == 0 {
        return Err(AudioError::Decode(format!(
            "{}: invalid format (rate={sample_rate}, channels={channels})",
            path.display()
        )));
    }

    let samples: Vec<f32> = decoder.convert_samples::<f32>().collect();
    if samples.is_empty() {
        return Err(AudioError::Decode(format!(
            "{}: decoded zero samples",
            path.display()
        )));
    }

    Ok(DecodedClip {
        pcm: std::sync::Arc::from(samples.into_boxed_slice()),
        sample_rate,
        channels,
        fingerprint: fingerprint_path(path),
    })
}

/// Decode MP3 directly with Symphonia instead of Rodio's convenience wrapper.
///
/// Rodio stops opening a stream after three invalid packets. Some otherwise playable MP3s with
/// embedded artwork or malformed metadata contain a recoverable invalid packet near the start;
/// Symphonia's recommended handling is to skip those packets and keep decoding the audio track.
fn decode_mp3(path: &Path) -> Result<DecodedClip> {
    let file = File::open(path).map_err(AudioError::Io)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    hint.with_extension("mp3");

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| AudioError::Decode(format!("{}: {error}", path.display())))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .filter(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| AudioError::Decode(format!("{}: no audio track", path.display())))?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| AudioError::Decode(format!("{}: {error}", path.display())))?;

    let mut samples = Vec::new();
    let mut sample_rate = 0;
    let mut channels = 0;
    let mut sample_buffer = None;

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => {
                return Err(AudioError::Decode(format!("{}: {error}", path.display())));
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                if sample_buffer.is_none() {
                    sample_rate = spec.rate;
                    channels = spec.channels.count() as u16;
                    sample_buffer = Some(SampleBuffer::<f32>::new(decoded.capacity() as u64, spec));
                }

                if let Some(buffer) = &mut sample_buffer {
                    buffer.copy_interleaved_ref(decoded);
                    samples.extend_from_slice(buffer.samples());
                }
            }
            Err(SymphoniaError::IoError(_) | SymphoniaError::DecodeError(_)) => continue,
            Err(error) => {
                return Err(AudioError::Decode(format!("{}: {error}", path.display())));
            }
        }
    }

    if sample_rate == 0 || channels == 0 || samples.is_empty() {
        return Err(AudioError::Decode(format!(
            "{}: decoded zero samples",
            path.display()
        )));
    }

    Ok(DecodedClip {
        pcm: std::sync::Arc::from(samples.into_boxed_slice()),
        sample_rate,
        channels,
        fingerprint: fingerprint_path(path),
    })
}

/// Downsample interleaved PCM into `n` peak buckets in `0.0..=1.0` (max abs per bucket).
pub fn compute_peaks(samples: &[f32], n: usize) -> Vec<f32> {
    if n == 0 {
        return Vec::new();
    }
    if samples.is_empty() {
        return vec![0.0; n];
    }

    let bucket_size = samples.len() as f64 / n as f64;
    let mut peaks = Vec::with_capacity(n);
    for i in 0..n {
        let start = (i as f64 * bucket_size).floor() as usize;
        let end = (((i + 1) as f64 * bucket_size).floor() as usize)
            .min(samples.len())
            .max(start + 1);
        let mut max = 0.0f32;
        for &s in &samples[start..end] {
            max = max.max(s.abs());
        }
        peaks.push(max.clamp(0.0, 1.0));
    }
    peaks
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Minimal mono 16-bit PCM WAV (synthetic — no external assets).
    fn write_tiny_wav(path: &Path, sample_rate: u32, samples: &[i16]) {
        let data_len = (samples.len() * 2) as u32;
        let mut buf = Vec::with_capacity(44 + data_len as usize);
        buf.extend_from_slice(b"RIFF");
        buf.extend_from_slice(&(36 + data_len).to_le_bytes());
        buf.extend_from_slice(b"WAVE");
        buf.extend_from_slice(b"fmt ");
        buf.extend_from_slice(&16u32.to_le_bytes()); // PCM chunk size
        buf.extend_from_slice(&1u16.to_le_bytes()); // audio format = PCM
        buf.extend_from_slice(&1u16.to_le_bytes()); // mono
        buf.extend_from_slice(&sample_rate.to_le_bytes());
        let byte_rate = sample_rate * 2;
        buf.extend_from_slice(&byte_rate.to_le_bytes());
        buf.extend_from_slice(&2u16.to_le_bytes()); // block align
        buf.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
        buf.extend_from_slice(b"data");
        buf.extend_from_slice(&data_len.to_le_bytes());
        for s in samples {
            buf.extend_from_slice(&s.to_le_bytes());
        }
        let mut f = File::create(path).unwrap();
        f.write_all(&buf).unwrap();
    }

    #[test]
    fn decode_generated_wav() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("beep.wav");

        // Short 440 Hz-ish burst at 8 kHz.
        let mut pcm = Vec::new();
        for i in 0..800 {
            let t = i as f32 / 8000.0;
            let s = (t * 440.0 * std::f32::consts::TAU).sin();
            pcm.push((s * 0.3 * i16::MAX as f32) as i16);
        }
        write_tiny_wav(&path, 8000, &pcm);

        let clip = decode_file(&path).expect("decode wav");
        assert_eq!(clip.sample_rate, 8000);
        assert_eq!(clip.channels, 1);
        assert!(clip.pcm.len() >= 700);
        assert!(!clip.fingerprint.is_empty());
    }

    #[test]
    #[ignore = "requires BUDDIO_MP3_FIXTURE to point to an MP3 with embedded cover art"]
    fn decodes_mp3_with_embedded_cover_art() {
        let path = std::env::var("BUDDIO_MP3_FIXTURE")
            .expect("set BUDDIO_MP3_FIXTURE to an MP3 file with embedded artwork");
        let clip = decode_file(Path::new(&path)).expect("decode tagged MP3");
        assert!(!clip.pcm.is_empty());
    }

    #[test]
    fn compute_peaks_buckets() {
        let samples: Vec<f32> = (0..64).map(|i| if i == 10 { 0.8 } else { 0.0 }).collect();
        let peaks = compute_peaks(&samples, 8);
        assert_eq!(peaks.len(), 8);
        assert!(peaks.iter().any(|&p| p > 0.5));
        assert!(peaks.iter().all(|&p| (0.0..=1.0).contains(&p)));
    }
}
