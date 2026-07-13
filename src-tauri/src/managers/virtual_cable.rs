//! Detect / download / install / pick VB-CABLE for zero-config call routing.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use specta::Type;

/// Official VB-CABLE driver pack (donationware — credit vb-cable.com in UI).
const VB_CABLE_ZIP_URL: &str =
    "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VirtualCableStatusDto {
    /// A virtual playback endpoint suitable as Buddio secondary output exists.
    pub installed: bool,
    /// Preferred playback device name (e.g. CABLE Input), if found.
    pub playback_device: Option<String>,
    /// Hint for Discord/Zoom input device.
    pub capture_hint: String,
    /// Current settings.secondary_device is a valid virtual playback device.
    pub configured: bool,
    /// Install finished but Windows still needs a reboot (or devices not visible yet).
    pub reboot_required: bool,
    /// We asked for reboot earlier; onboarding should resume auto-config.
    pub pending_after_reboot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VirtualCableEnsureResult {
    pub status: VirtualCableStatusDto,
    pub message: String,
    pub reboot_required: bool,
}

pub fn is_virtual_playback_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    (n.contains("cable") && n.contains("input"))
        || n.contains("vb-audio")
        || n.contains("voicemeeter input")
        || (n.contains("virtual") && (n.contains("cable") || n.contains("line")))
}

pub fn pick_virtual_playback(
    devices: &[(String, bool)],
    monitor: Option<&str>,
) -> Option<String> {
    let candidates: Vec<&str> = devices
        .iter()
        .map(|(n, _)| n.as_str())
        .filter(|n| Some(*n) != monitor && is_virtual_playback_name(n))
        .collect();

    candidates
        .iter()
        .find(|n| {
            let l = n.to_ascii_lowercase();
            l.contains("cable input") || l.contains("cabel input")
        })
        .or_else(|| {
            candidates
                .iter()
                .find(|n| n.to_ascii_lowercase().contains("vb-audio"))
        })
        .or_else(|| candidates.first())
        .map(|s| (*s).to_string())
}

pub fn capture_hint_for(playback: Option<&str>) -> String {
    match playback {
        Some(p) if p.to_ascii_lowercase().contains("cable") => {
            "CABLE Output (VB-Audio Virtual Cable)".into()
        }
        Some(_) => "a entrada correspondente do cabo virtual".into(),
        None => "CABLE Output (VB-Audio Virtual Cable)".into(),
    }
}

pub fn list_output_names() -> Result<Vec<(String, bool)>> {
    let devices = audio_engine::AudioEngineHandle::list_output_devices()
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(devices
        .into_iter()
        .map(|d| (d.name, d.is_default))
        .collect())
}

pub fn build_status(
    secondary: Option<&str>,
    monitor: Option<&str>,
    pending_after_reboot: bool,
) -> Result<VirtualCableStatusDto> {
    let devices = list_output_names()?;
    let playback = pick_virtual_playback(&devices, monitor);
    let installed = playback.is_some();
    let configured = secondary
        .map(|s| {
            is_virtual_playback_name(s)
                && Some(s) != monitor
                && devices.iter().any(|(n, _)| n == s)
        })
        .unwrap_or(false);

    Ok(VirtualCableStatusDto {
        installed,
        capture_hint: capture_hint_for(playback.as_deref()),
        playback_device: playback,
        configured,
        reboot_required: pending_after_reboot && !installed,
        pending_after_reboot,
    })
}

/// Download VB-CABLE pack into `work_dir` and run elevated silent installer.
/// Returns whether a reboot is likely required.
#[cfg(windows)]
pub fn download_and_install(work_dir: &Path) -> Result<bool> {
    fs::create_dir_all(work_dir).context("create virtual cable work dir")?;
    let zip_path = work_dir.join("VBCABLE_Driver_Pack.zip");
    let extract_dir = work_dir.join("pack");

    if extract_dir.exists() {
        let _ = fs::remove_dir_all(&extract_dir);
    }
    fs::create_dir_all(&extract_dir)?;

    tracing::info!(url = VB_CABLE_ZIP_URL, "downloading VB-CABLE pack");
    download_file(VB_CABLE_ZIP_URL, &zip_path)?;

    let expand = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                ps_escape(&zip_path),
                ps_escape(&extract_dir)
            ),
        ])
        .status()
        .context("expand VB-CABLE zip")?;
    if !expand.success() {
        bail!("falha ao extrair o pacote VB-CABLE");
    }

    let setup = find_setup_exe(&extract_dir)?
        .ok_or_else(|| anyhow::anyhow!("VBCABLE_Setup_x64.exe não encontrado no pacote"))?;

    // Pre-trust publisher cert when possible (reduces Windows Security prompt).
    let _ = trust_publisher_cert(&extract_dir);

    tracing::info!(setup = %setup.display(), "running elevated VB-CABLE setup");
    let install = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "Start-Process -FilePath '{}' -ArgumentList '-h','-i','-H','-n' -Verb RunAs -Wait",
                ps_escape(&setup)
            ),
        ])
        .status()
        .context("elevated VB-CABLE install")?;

    // User may cancel UAC — treat non-success as failure unless devices appear.
    std::thread::sleep(Duration::from_secs(2));
    let devices = list_output_names().unwrap_or_default();
    let appeared = pick_virtual_playback(&devices, None).is_some();
    if appeared {
        return Ok(false);
    }

    if !install.success() {
        bail!(
            "instalação do VB-CABLE cancelada ou falhou (código {:?}). Aceite o UAC e tente de novo.",
            install.code()
        );
    }

    // Installer often requires reboot before endpoints show up.
    Ok(true)
}

#[cfg(not(windows))]
pub fn download_and_install(_work_dir: &Path) -> Result<bool> {
    bail!("instalação automática de cabo virtual só está disponível no Windows");
}

fn download_file(url: &str, dest: &Path) -> Result<()> {
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '{}' -OutFile '{}'",
                url.replace('\'', "''"),
                ps_escape(dest)
            ),
        ])
        .status()
        .context("download VB-CABLE")?;
    if !status.success() || !dest.is_file() {
        bail!("não foi possível baixar o VB-CABLE de {url}");
    }
    Ok(())
}

fn find_setup_exe(root: &Path) -> Result<Option<PathBuf>> {
    let mut preferred = None;
    let mut fallback = None;
    for entry in walkdir(root)? {
        let Some(fname) = entry.file_name() else {
            continue;
        };
        let name = fname.to_string_lossy().to_ascii_lowercase();
        if name == "vbcable_setup_x64.exe" {
            preferred = Some(entry);
            break;
        }
        if name == "vbcable_setup.exe" {
            fallback = Some(entry);
        }
    }
    Ok(preferred.or(fallback))
}

fn walkdir(root: &Path) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    fn rec(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                rec(&path, out)?;
            } else {
                out.push(path);
            }
        }
        Ok(())
    }
    rec(root, &mut out)?;
    Ok(out)
}

fn trust_publisher_cert(extract_dir: &Path) -> Result<()> {
    let cat = walkdir(extract_dir)?
        .into_iter()
        .find(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("cat"))
                .unwrap_or(false)
        });
    let Some(cat) = cat else {
        return Ok(());
    };
    let cer = extract_dir.join("vbcable-publisher.cer");
    let export = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "(Get-AuthenticodeSignature -FilePath '{}').SignerCertificate | Export-Certificate -Type CERT -FilePath '{}' | Out-Null",
                ps_escape(&cat),
                ps_escape(&cer)
            ),
        ])
        .status();
    if export.ok().filter(|s| s.success()).is_none() || !cer.is_file() {
        return Ok(());
    }
    let _ = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "Start-Process certutil.exe -ArgumentList '-addstore','TrustedPublisher','{}' -Verb RunAs -Wait",
                ps_escape(&cer)
            ),
        ])
        .status();
    Ok(())
}

fn ps_escape(path: &Path) -> String {
    path.display().to_string().replace('\'', "''")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_cable_input() {
        let devices = vec![
            ("Alto-falantes".into(), true),
            ("CABLE Input (VB-Audio Virtual Cable)".into(), false),
            ("CABLE Output (VB-Audio Virtual Cable)".into(), false),
        ];
        let picked = pick_virtual_playback(&devices, Some("Alto-falantes"));
        assert_eq!(
            picked.as_deref(),
            Some("CABLE Input (VB-Audio Virtual Cable)")
        );
    }

    #[test]
    fn rejects_speakers() {
        assert!(!is_virtual_playback_name("Alto-falantes (Realtek(R) Audio)"));
    }
}
