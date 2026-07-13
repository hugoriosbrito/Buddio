//! Deterministic device lists for the E2E test suite.
//!
//! Real audio devices (and whether a virtual-cable-style device is present)
//! vary per machine, which makes the onboarding `virtual`/`routing` steps
//! non-deterministic in automated tests. When `BUDDIO_TEST_FAKE_DEVICES` is
//! set, these functions short-circuit the real device enumeration with a
//! fixed list instead.

use crate::models::{InputDeviceDto, OutputDeviceDto};

const ENV_VAR: &str = "BUDDIO_TEST_FAKE_DEVICES";

/// `full`: includes a virtual-named output device (routes cleanly).
/// `novirtual`: no virtual-named device (forces the route-error path).
/// unset/anything else: fall through to real device enumeration.
pub fn fake_output_devices() -> Option<Vec<OutputDeviceDto>> {
    match std::env::var(ENV_VAR).ok()?.as_str() {
        "full" => Some(vec![
            OutputDeviceDto {
                name: "Speakers (Test Default)".into(),
                is_default: true,
            },
            OutputDeviceDto {
                name: "Buddio Virtual Mic".into(),
                is_default: false,
            },
        ]),
        "novirtual" => Some(vec![OutputDeviceDto {
            name: "Speakers (Test Default)".into(),
            is_default: true,
        }]),
        _ => None,
    }
}

pub fn fake_input_devices() -> Option<Vec<InputDeviceDto>> {
    std::env::var(ENV_VAR).ok()?;
    Some(vec![InputDeviceDto {
        name: "Test Microphone".into(),
        is_default: true,
    }])
}
