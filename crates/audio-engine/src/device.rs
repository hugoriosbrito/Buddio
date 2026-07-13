//! Output device enumeration helpers (cpal / rodio).

use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

use crate::error::{AudioError, Result};

/// Summary of an OS audio output device.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OutputDeviceInfo {
    pub name: String,
    pub is_default: bool,
}

/// List available output devices and mark the system default.
pub fn list_output_devices() -> Result<Vec<OutputDeviceInfo>> {
    let host = cpal::default_host();
    let default_name = host.default_output_device().and_then(|d| d.name().ok());

    let devices = host
        .output_devices()
        .map_err(|e| AudioError::Device(e.to_string()))?;

    let mut out = Vec::new();
    for device in devices {
        let Ok(name) = device.name() else {
            continue;
        };
        let is_default = default_name.as_ref() == Some(&name);
        out.push(OutputDeviceInfo { name, is_default });
    }
    Ok(out)
}

/// Default output sample rate when available.
pub fn default_output_sample_rate() -> Option<u32> {
    let host = cpal::default_host();
    host.default_output_device()
        .and_then(|d| d.default_output_config().ok())
        .map(|c| c.sample_rate().0)
}

/// Resolve a cpal output device by exact name, or the default when `name` is `None`.
pub(crate) fn resolve_output_device(name: Option<&str>) -> Result<cpal::Device> {
    let host = cpal::default_host();

    match name {
        None => host
            .default_output_device()
            .ok_or_else(|| AudioError::Device("no default output device".into())),
        Some(wanted) => {
            let devices = host
                .output_devices()
                .map_err(|e| AudioError::Device(e.to_string()))?;
            for device in devices {
                if device.name().ok().as_deref() == Some(wanted) {
                    return Ok(device);
                }
            }
            Err(AudioError::Device(format!(
                "output device not found: {wanted}"
            )))
        }
    }
}
