//! Input device listing + live mic level meter (cpal).

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::error::{AudioError, Result};

/// Summary of an OS audio input device.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InputDeviceInfo {
    pub name: String,
    pub is_default: bool,
}

/// List available input devices and mark the system default.
pub fn list_input_devices() -> Result<Vec<InputDeviceInfo>> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());

    let devices = host
        .input_devices()
        .map_err(|e| AudioError::Device(e.to_string()))?;

    let mut out = Vec::new();
    for device in devices {
        let Ok(name) = device.name() else {
            continue;
        };
        let is_default = default_name.as_ref() == Some(&name);
        out.push(InputDeviceInfo { name, is_default });
    }
    Ok(out)
}

pub fn resolve_input_device(name: Option<&str>) -> Result<cpal::Device> {
    let host = cpal::default_host();
    if let Some(wanted) = name.filter(|n| !n.is_empty() && *n != "default") {
        let devices = host
            .input_devices()
            .map_err(|e| AudioError::Device(e.to_string()))?;
        for device in devices {
            if device.name().ok().as_deref() == Some(wanted) {
                return Ok(device);
            }
        }
        return Err(AudioError::Device(format!(
            "dispositivo de entrada não encontrado: {wanted}"
        )));
    }
    host.default_input_device()
        .ok_or_else(|| AudioError::Device("nenhum microfone padrão encontrado".into()))
}

/// True for capture endpoints that would create a digital feedback loop when
/// mixed into VB-CABLE Input (e.g. "CABLE Output", Stereo Mix).
pub fn is_loopback_capture_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    (n.contains("cable") && n.contains("output"))
        || n.contains("vb-audio virtual cable")
        || n.contains("voicemeeter out")
        || n.contains("voicemeeter vaio")
        || n.contains("voicemeeter aux")
        || n.contains("stereo mix")
        || n.contains("what u hear")
        || n.contains("wave out mix")
        || n.contains("loopback")
}

/// Resolve a **physical** mic for mic→CABLE mix. Never opens CABLE Output /
/// Stereo Mix / similar — that feeds Discord's listen path back into itself
/// and produces a maxed-out roar.
pub fn resolve_input_device_for_mic_mix(name: Option<&str>) -> Result<cpal::Device> {
    let host = cpal::default_host();
    let devices: Vec<cpal::Device> = host
        .input_devices()
        .map_err(|e| AudioError::Device(e.to_string()))?
        .collect();

    if let Some(wanted) = name.filter(|n| !n.is_empty() && *n != "default") {
        if is_loopback_capture_name(wanted) {
            return Err(AudioError::Device(
                "não use CABLE Output (nem Stereo Mix) como microfone do Buddio — isso causa feedback no Discord"
                    .into(),
            ));
        }
        for device in &devices {
            if device.name().ok().as_deref() == Some(wanted) {
                return Ok(device.clone());
            }
        }
        return Err(AudioError::Device(format!(
            "dispositivo de entrada não encontrado: {wanted}"
        )));
    }

    if let Some(default) = host.default_input_device() {
        if let Ok(n) = default.name() {
            if !is_loopback_capture_name(&n) {
                return Ok(default);
            }
            tracing::warn!(
                device = %n,
                "default input is a virtual/loopback capture — picking a physical mic for mic mix"
            );
        }
    }

    for device in devices {
        if let Ok(n) = device.name() {
            if !is_loopback_capture_name(&n) {
                tracing::info!(device = %n, "mic mix using physical input");
                return Ok(device);
            }
        }
    }

    Err(AudioError::Device(
        "nenhum microfone físico encontrado (só CABLE Output / loopback). Escolha seu mic real no Buddio"
            .into(),
    ))
}

struct MeterInner {
    level_bits: AtomicU32,
    stop: AtomicBool,
    join: Mutex<Option<JoinHandle<()>>>,
    /// Serializes start/stop so Strict Mode remounts and device switches cannot
    /// interleave and leave a dead meter while the frontend thinks it is live.
    gate: Mutex<()>,
}

impl Default for MeterInner {
    fn default() -> Self {
        Self {
            level_bits: AtomicU32::new(0),
            stop: AtomicBool::new(true),
            join: Mutex::new(None),
            gate: Mutex::new(()),
        }
    }
}

/// Process-wide mic meter used by onboarding / diagnostics.
#[derive(Clone, Default)]
pub struct MicMeter {
    inner: Arc<MeterInner>,
}

impl MicMeter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Start (or restart) metering the given input device name (`None` = default).
    pub fn start(&self, device_name: Option<String>) -> Result<()> {
        let _gate = self.inner.gate.lock();
        self.stop_unlocked();

        let device = resolve_input_device(device_name.as_deref())?;
        let config = device
            .default_input_config()
            .map_err(|e| AudioError::Device(e.to_string()))?;

        self.inner.stop.store(false, Ordering::SeqCst);
        self.inner.level_bits.store(0, Ordering::SeqCst);

        let meter = Arc::clone(&self.inner);

        let handle = thread::Builder::new()
            .name("buddio-mic-meter".into())
            .spawn(move || {
                let stream = match build_input_stream(&device, &config, Arc::clone(&meter)) {
                    Ok(s) => s,
                    Err(err) => {
                        tracing::warn!(error = %err, "mic meter stream failed");
                        meter.stop.store(true, Ordering::SeqCst);
                        return;
                    }
                };
                if let Err(err) = stream.play() {
                    tracing::warn!(error = %err, "mic meter play failed");
                    meter.stop.store(true, Ordering::SeqCst);
                    return;
                }
                while !meter.stop.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(40));
                }
                drop(stream);
            })
            .map_err(|e| AudioError::Device(e.to_string()))?;

        *self.inner.join.lock() = Some(handle);
        Ok(())
    }

    pub fn stop(&self) {
        let _gate = self.inner.gate.lock();
        self.stop_unlocked();
    }

    fn stop_unlocked(&self) {
        self.inner.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.inner.join.lock().take() {
            let _ = handle.join();
        }
        self.inner.level_bits.store(0, Ordering::SeqCst);
    }

    /// Peak level in 0.0..=1.0
    pub fn level(&self) -> f32 {
        f32::from_bits(self.inner.level_bits.load(Ordering::Relaxed)).clamp(0.0, 1.0)
    }
}

fn build_input_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    meter: Arc<MeterInner>,
) -> Result<cpal::Stream> {
    let sample_format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.clone().into();
    let err_fn = |err| tracing::warn!(error = %err, "mic meter callback error");

    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _| write_peak_f32(data, &meter),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _| {
                let mut peak = 0.0f32;
                for s in data {
                    peak = peak.max((*s as f32 / i16::MAX as f32).abs());
                }
                store_peak(&meter, peak);
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _| {
                let mut peak = 0.0f32;
                for s in data {
                    let v = (*s as f32 / u16::MAX as f32) * 2.0 - 1.0;
                    peak = peak.max(v.abs());
                }
                store_peak(&meter, peak);
            },
            err_fn,
            None,
        ),
        other => {
            return Err(AudioError::Device(format!(
                "formato de amostra não suportado: {other:?}"
            )));
        }
    }
    .map_err(|e| AudioError::Device(e.to_string()))?;

    Ok(stream)
}

fn write_peak_f32(data: &[f32], meter: &MeterInner) {
    let mut peak = 0.0f32;
    for s in data {
        peak = peak.max(s.abs());
    }
    store_peak(meter, peak);
}

fn store_peak(meter: &MeterInner, peak: f32) {
    let prev = f32::from_bits(meter.level_bits.load(Ordering::Relaxed));
    let next = (prev * 0.72).max(peak.min(1.0));
    meter.level_bits.store(next.to_bits(), Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_cable_output_as_loopback() {
        assert!(is_loopback_capture_name(
            "CABLE Output (VB-Audio Virtual Cable)"
        ));
        assert!(is_loopback_capture_name("Stereo Mix (Realtek)"));
        assert!(!is_loopback_capture_name("Microphone (Realtek(R) Audio)"));
        assert!(!is_loopback_capture_name("Headset Microphone"));
    }
}
