//! Download + silent-launch Tauri NSIS setup for in-app updates (Windows).

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use tauri::{AppHandle, Emitter};

pub const PROGRESS_EVENT: &str = "update-download-progress";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: Option<u64>,
}

pub fn is_allowed_download_url(url: &str) -> bool {
    let trimmed = url.trim();
    trimmed.starts_with("https://github.com/")
        || trimmed.starts_with("https://objects.githubusercontent.com/")
}

pub fn is_nsis_setup_name(name: &str) -> bool {
    let lower = name.trim().to_ascii_lowercase();
    lower.starts_with("buddio_") && lower.ends_with("_x64-setup.exe")
}

pub fn dest_path(temp_dir: &Path, version: &str) -> PathBuf {
    let safe: String = version
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    temp_dir
        .join("Buddio")
        .join("updates")
        .join(format!("Buddio_{safe}_x64-setup.exe"))
}

fn file_name_from_url(url: &str) -> Option<&str> {
    let path = url.split('?').next().unwrap_or(url);
    path.rsplit('/').next().filter(|s| !s.is_empty())
}

/// Stream download with progress emits. Caller must pass an allowlisted URL.
pub fn download_installer(app: &AppHandle, url: &str, dest: &Path) -> Result<()> {
    if !is_allowed_download_url(url) {
        bail!("download URL is not an allowed GitHub host");
    }
    let Some(name) = file_name_from_url(url) else {
        bail!("update download URL has no file name");
    };
    if !is_nsis_setup_name(name) {
        bail!("update asset is not a Buddio NSIS setup.exe");
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let response = ureq::get(url)
        .set(
            "User-Agent",
            "Buddio/1.0 (+https://github.com/hugoriosbrito/Buddio)",
        )
        .timeout(Duration::from_secs(600))
        .call()
        .with_context(|| format!("download update from {url}"))?;
    if !(200..300).contains(&response.status()) {
        bail!("update download failed (HTTP {})", response.status());
    }
    let total = response
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok());
    let mut reader = response.into_reader();
    let mut file = File::create(dest).with_context(|| format!("create {}", dest.display()))?;
    let mut buf = [0u8; 64 * 1024];
    let mut received: u64 = 0;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])?;
        received += n as u64;
        let _ = app.emit(PROGRESS_EVENT, DownloadProgress { received, total });
    }
    file.flush()?;
    if received == 0 {
        bail!("update download was empty");
    }
    Ok(())
}

#[cfg(windows)]
fn shell_execute_outcome(code: isize) -> Result<()> {
    if code > 32 {
        return Ok(());
    }
    bail!("Windows could not start the elevated installer (ShellExecute code {code})");
}

#[cfg(windows)]
pub fn launch_nsis_installer(installer: &Path) -> Result<()> {
    use windows::{
        core::{w, HSTRING},
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };

    let file = HSTRING::from(installer);
    let working_dir = HSTRING::from(installer.parent().unwrap_or_else(|| Path::new(".")));
    let params = HSTRING::from("/S /UPDATE /R");
    let result = unsafe {
        ShellExecuteW(
            None,
            w!("runas"),
            &file,
            &params,
            &working_dir,
            SW_SHOWNORMAL,
        )
    };
    shell_execute_outcome(result.0 as isize)
        .with_context(|| format!("launch elevated installer {}", installer.display()))
}

#[cfg(not(windows))]
pub fn launch_nsis_installer(_installer: &Path) -> Result<()> {
    bail!("in-app NSIS update is only supported on Windows");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_github_https_only() {
        assert!(is_allowed_download_url(
            "https://github.com/hugoriosbrito/Buddio/releases/download/v1/Buddio_1_x64-setup.exe"
        ));
        assert!(is_allowed_download_url(
            "https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/x"
        ));
        assert!(!is_allowed_download_url("http://github.com/x/y.exe"));
        assert!(!is_allowed_download_url(
            "https://evil.test/Buddio_x64-setup.exe"
        ));
    }

    #[test]
    fn matches_nsis_name() {
        assert!(is_nsis_setup_name("Buddio_1.0.0-rc5_x64-setup.exe"));
        assert!(!is_nsis_setup_name("Buddio_1.0.0-rc5_x64.msi"));
        assert!(!is_nsis_setup_name("notes.txt"));
    }

    #[test]
    fn dest_path_sanitizes_version() {
        let path = dest_path(Path::new("C:\\Temp"), "1.0.0-rc5");
        assert!(path
            .to_string_lossy()
            .contains("Buddio_1.0.0-rc5_x64-setup.exe"));
    }

    #[cfg(windows)]
    #[test]
    fn accepts_shell_execute_success_codes() {
        assert!(shell_execute_outcome(33).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn exposes_shell_execute_failure_code() {
        let error = shell_execute_outcome(5).unwrap_err();
        assert!(error.to_string().contains("code 5"));
    }
}
