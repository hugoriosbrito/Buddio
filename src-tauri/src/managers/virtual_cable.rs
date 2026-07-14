//! Detect / download / install / pick VB-CABLE for zero-config call routing.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Hide console windows for helper processes (PowerShell / reg). Without this,
/// onboarding flashes several black PowerShell windows and looks broken.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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

/// Win10/11 VB-CABLE exposes **two** playback pins on the same driver:
/// the Speakers / CABLE Input pin (≤8 ch) and a Line-Out "16 Ch" pin.
/// Official manual: both pins **cannot be opened at the same time** —
/// doing so returns WASAPI `AUDCLNT_E_DEVICE_IN_USE` (`0x8889000A`).
pub fn is_vb_cable_16ch_pin(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let looks_cable = n.contains("vb-audio") || n.contains("cable");
    if !looks_cable {
        return false;
    }
    (n.contains("16") && (n.contains("ch") || n.contains("channel")))
        || n.contains("line out")
        || n.contains("lineout")
}

/// Prefer the stereo Speakers / `CABLE Input` pin; avoid the exclusive 16 Ch pin
/// unless it's the only virtual playback device present.
pub fn pick_virtual_playback(devices: &[(String, bool)], monitor: Option<&str>) -> Option<String> {
    let all: Vec<&str> = devices
        .iter()
        .map(|(n, _)| n.as_str())
        .filter(|n| Some(*n) != monitor && is_virtual_playback_name(n))
        .collect();

    let preferred: Vec<&str> = all
        .iter()
        .copied()
        // Opening Speakers + 16 Ch of the same VB-CABLE → 0x8889000A.
        .filter(|n| !is_vb_cable_16ch_pin(n))
        .collect();

    let candidates = if preferred.is_empty() { all } else { preferred };

    candidates
        .iter()
        .find(|n| {
            let l = n.to_ascii_lowercase();
            l.contains("cable input") || l.contains("cabel input")
        })
        .or_else(|| {
            // Win10/11 first pin is often "Speakers / Alto-falantes (VB-Audio…)".
            candidates.iter().find(|n| {
                let l = n.to_ascii_lowercase();
                l.contains("vb-audio")
                    && (l.contains("speakers")
                        || l.contains("alto-falantes")
                        || l.contains("haut-parleurs")
                        || l.contains("lautsprecher"))
            })
        })
        .or_else(|| {
            candidates.iter().find(|n| {
                let l = n.to_ascii_lowercase();
                l.contains("vb-audio") && l.contains("cable") && !l.contains("output")
            })
        })
        .or_else(|| {
            candidates
                .iter()
                .find(|n| n.to_ascii_lowercase().contains("vb-audio"))
        })
        .or_else(|| candidates.first())
        .map(|s| (*s).to_string())
}

/// Real speakers/headphones for the monitor path — never a VB-CABLE / Voicemeeter pin.
///
/// After install, Windows often makes VB-CABLE the *default* playback device. If
/// Buddio then opens default as monitor **and** another VB-CABLE pin as secondary,
/// WASAPI returns `0x8889000A` on every play.
pub fn pick_physical_monitor(
    devices: &[(String, bool)],
    preferred: Option<&str>,
) -> Option<String> {
    if let Some(p) = preferred {
        if !is_virtual_playback_name(p) && devices.iter().any(|(n, _)| n == p) {
            return Some(p.to_string());
        }
    }
    devices
        .iter()
        .find(|(n, is_default)| *is_default && !is_virtual_playback_name(n))
        .or_else(|| devices.iter().find(|(n, _)| !is_virtual_playback_name(n)))
        .map(|(n, _)| n.clone())
}

/// When secondary is a virtual cable, force monitor onto a physical device so
/// we never open Speakers + 16 Ch (or default-is-CABLE + secondary) together.
pub fn sanitize_monitor_for_virtual_secondary(
    devices: &[(String, bool)],
    monitor_enabled: bool,
    monitor: Option<String>,
    secondary: Option<&str>,
) -> (bool, Option<String>) {
    let Some(sec) = secondary.filter(|s| is_virtual_playback_name(s)) else {
        return (monitor_enabled, monitor);
    };
    let monitor_is_bad = match monitor.as_deref() {
        Some(m) if is_virtual_playback_name(m) || m == sec || is_vb_cable_16ch_pin(m) => true,
        Some(_) => false,
        // `None` means system default — often VB-CABLE right after install.
        None => devices
            .iter()
            .any(|(n, is_default)| *is_default && is_virtual_playback_name(n)),
    };
    if !monitor_is_bad && monitor_enabled {
        return (monitor_enabled, monitor);
    }
    let physical = pick_physical_monitor(devices, monitor.as_deref());
    (true, physical)
}

pub fn capture_hint_for(playback: Option<&str>) -> String {
    match playback {
        Some(p) if p.to_ascii_lowercase().contains("cable") => {
            "CABLE Output (VB-Audio Virtual Cable)".into()
        }
        Some(_) => crate::i18n::t("en", "capture.hint_generic"),
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
            is_virtual_playback_name(s) && Some(s) != monitor && devices.iter().any(|(n, _)| n == s)
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
/// When `bundled_pack` already contains `VBCABLE_Setup_x64.exe`, copies it into
/// `work_dir` first (normal path — avoids `\\?\` resource paths that break setup).
/// Returns whether a reboot is likely required.
#[cfg(windows)]
pub fn download_and_install(work_dir: &Path, bundled_pack: Option<&Path>) -> Result<bool> {
    fs::create_dir_all(work_dir).context("create virtual cable work dir")?;
    let pack_dir = work_dir.join("pack");

    if let Some(bundled) = bundled_pack.filter(|p| p.is_dir()) {
        tracing::info!(from = %bundled.display(), to = %pack_dir.display(), "copying bundled VB-CABLE pack");
        copy_dir_recursive(bundled, &pack_dir)?;
    } else if find_setup_exe(&pack_dir)?.is_none() {
        let zip_path = work_dir.join("VBCABLE_Driver_Pack.zip");
        if pack_dir.exists() {
            let _ = fs::remove_dir_all(&pack_dir);
        }
        fs::create_dir_all(&pack_dir)?;

        tracing::info!(url = VB_CABLE_ZIP_URL, "downloading VB-CABLE pack");
        download_file(VB_CABLE_ZIP_URL, &zip_path)?;

        tracing::info!(zip = %zip_path.display(), "extracting VB-CABLE pack");
        extract_zip(&zip_path, &pack_dir)?;
        flatten_single_nested_dir(&pack_dir)?;
    }

    let setup = find_setup_exe(&pack_dir)?
        .ok_or_else(|| anyhow::anyhow!("{}", crate::i18n::t("en", "err.vbcable_setup_missing")))?;

    tracing::info!(setup = %setup.display(), "running elevated VB-CABLE setup (single UAC)");
    let install = run_elevated_install(&setup, &pack_dir)?;

    // Give Windows a moment to register the driver endpoints. Only
    // `playback_present()` (the actual WASAPI endpoint) means we're done —
    // the driver *service* registry key can appear a couple seconds before
    // the endpoint is actually enumerable, so using it as an early-exit
    // condition here was giving up on the retry loop before the thing we
    // actually need existed, and reporting "reboot required" when a few
    // more seconds would have found it.
    for _ in 0..15 {
        if playback_present() {
            return Ok(false);
        }
        std::thread::sleep(Duration::from_secs(1));
    }

    match install {
        ElevatedOutcome::Cancelled => {
            bail!(crate::i18n::t("en", "err.vbcable_uac_cancelled"));
        }
        // VB-CABLE often returns odd exit codes and needs a reboot before
        // CABLE Input appears — don't treat that as a hard failure.
        ElevatedOutcome::Ok | ElevatedOutcome::Failed(_) => {
            tracing::info!(
                ?install,
                service = driver_service_present(),
                "VB-CABLE setup finished; reboot likely required before devices appear"
            );
            Ok(true)
        }
    }
}

#[cfg(not(windows))]
pub fn download_and_install(_work_dir: &Path, _bundled_pack: Option<&Path>) -> Result<bool> {
    bail!("automatic virtual cable install is only available on Windows");
}

/// Candidate folders for a VB-CABLE pack shipped inside the app resources.
pub fn bundled_pack_candidates(resource_dir: &Path) -> Vec<PathBuf> {
    vec![
        resource_dir.join("resources").join("vbcable").join("pack"),
        resource_dir.join("vbcable").join("pack"),
        resource_dir.join("resources/vbcable/pack"),
    ]
}

fn playback_present() -> bool {
    let devices = list_output_names().unwrap_or_default();
    pick_virtual_playback(&devices, None).is_some()
}

#[cfg(windows)]
fn driver_service_present() -> bool {
    let mut cmd = Command::new("reg");
    cmd.args([
        "query",
        r"HKLM\SYSTEM\CurrentControlSet\Services\VBAudioVACWDM",
        "/ve",
    ])
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null());
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(windows)]
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    if dst.exists() {
        let _ = fs::remove_dir_all(dst);
    }
    fs::create_dir_all(dst)?;
    for entry in walkdir(src)? {
        let rel = entry.strip_prefix(src).unwrap_or(&entry);
        let target = dst.join(rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&entry, &target)
            .with_context(|| format!("copy {} → {}", entry.display(), target.display()))?;
    }
    Ok(())
}

fn flatten_single_nested_dir(pack_dir: &Path) -> Result<()> {
    let mut dirs = Vec::new();
    let mut files = 0usize;
    for entry in fs::read_dir(pack_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            dirs.push(path);
        } else {
            files += 1;
        }
    }
    if files == 0 && dirs.len() == 1 {
        let nested = &dirs[0];
        for entry in walkdir(nested)? {
            let rel = entry.strip_prefix(nested).unwrap_or(&entry);
            let target = pack_dir.join(rel);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::rename(&entry, &target).or_else(|_| {
                fs::copy(&entry, &target)
                    .map(|_| ())
                    .and_then(|_| fs::remove_file(&entry))
            })?;
        }
        let _ = fs::remove_dir_all(nested);
    }
    Ok(())
}

fn download_file(url: &str, dest: &Path) -> Result<()> {
    // Pure Rust HTTP — never Spawn powershell/Invoke-WebRequest (that opens
    // visible consoles and blocks the UI thread harder than a blocking ureq call).
    let response = ureq::get(url)
        .set(
            "User-Agent",
            "Buddio/1.0 (+https://github.com/hugoriosbrito/Buddio)",
        )
        .timeout(Duration::from_secs(180))
        .call()
        .with_context(|| format!("download VB-CABLE from {url}"))?;
    if !(200..300).contains(&response.status()) {
        bail!("could not download VB-CABLE (HTTP {})", response.status());
    }
    let mut reader = response.into_reader();
    let mut file = fs::File::create(dest).with_context(|| format!("create {}", dest.display()))?;
    io::copy(&mut reader, &mut file).context("write VB-CABLE zip")?;
    file.flush()?;
    if !dest.is_file() || dest.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        bail!("VB-CABLE download was empty from {url}");
    }
    Ok(())
}

fn extract_zip(zip_path: &Path, dest: &Path) -> Result<()> {
    let file = fs::File::open(zip_path).with_context(|| format!("open {}", zip_path.display()))?;
    let mut archive = zip::ZipArchive::new(file).context("read VB-CABLE zip")?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .with_context(|| format!("zip entry {i}"))?;
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let outpath = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&outpath)?;
            continue;
        }
        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut outfile = fs::File::create(&outpath)
            .with_context(|| format!("create extracted {}", outpath.display()))?;
        io::copy(&mut entry, &mut outfile)
            .with_context(|| format!("extract {}", outpath.display()))?;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ElevatedOutcome {
    Ok,
    Cancelled,
    Failed(i32),
}

/// One UAC prompt: elevated PowerShell runs certutil (optional) then VB-CABLE setup.
///
/// Every helper `powershell.exe` is started with `CREATE_NO_WINDOW` + `-WindowStyle Hidden`
/// so onboarding only shows the UAC consent dialog — never a stack of black consoles.
#[cfg(windows)]
fn run_elevated_install(setup: &Path, pack_dir: &Path) -> Result<ElevatedOutcome> {
    let setup_s = native_path(setup);
    let pack_s = native_path(pack_dir);
    let cer = pack_dir.join("vbcable-publisher.cer");
    let cat = walkdir(pack_dir)?.into_iter().find(|p| {
        p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("cat"))
            .unwrap_or(false)
    });

    // Export publisher cert without elevation (read-only) — hidden console.
    if let Some(cat) = cat {
        let mut export = Command::new("powershell");
        export
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &format!(
                    "try {{ (Get-AuthenticodeSignature -FilePath '{}').SignerCertificate | Export-Certificate -Type CERT -FilePath '{}' | Out-Null }} catch {{ }}",
                    ps_escape(&cat),
                    ps_escape(&cer)
                ),
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        export.creation_flags(CREATE_NO_WINDOW);
        let _ = export.status();
    }

    let cer_s = native_path(&cer);
    let script_path = pack_dir.join("_buddio_install_vbcable.ps1");
    let script_body = format!(
        "$ErrorActionPreference = 'Continue'\n\
         Set-Location -LiteralPath '{pack}'\n\
         if (Test-Path -LiteralPath '{cer}') {{\n\
           & certutil.exe -addstore -f TrustedPublisher '{cer}' | Out-Null\n\
         }}\n\
         $p = Start-Process -FilePath '{setup}' -ArgumentList '-h','-i','-H','-n' -WorkingDirectory '{pack}' -WindowStyle Hidden -Wait -PassThru\n\
         if ($null -eq $p) {{ exit 1 }}\n\
         if ($null -eq $p.ExitCode) {{ exit 0 }}\n\
         exit [int]$p.ExitCode\n",
        pack = ps_escape_str(&pack_s),
        cer = ps_escape_str(&cer_s),
        setup = ps_escape_str(&setup_s),
    );
    fs::write(&script_path, script_body).context("write VB-CABLE install script")?;

    let script_s = native_path(&script_path);
    // Outer launcher stays hidden; elevated child also gets -WindowStyle Hidden.
    // The *only* visible OS UI should be the UAC consent prompt.
    let launcher = format!(
        "$ErrorActionPreference='Stop'; \
         try {{ \
           $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden \
             -ArgumentList '-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File','{script}'; \
           if ($null -eq $p) {{ exit 1223 }}; \
           if ($null -eq $p.ExitCode) {{ exit 0 }}; \
           exit [int]$p.ExitCode \
         }} catch {{ \
           $msg = [string]$_.Exception.Message; \
           if ($msg -match 'cancel|cancelad|denied|recusad|1223|cancelada|canceled') {{ exit 1223 }}; \
           exit 1 \
         }}",
        script = ps_escape_str(&script_s),
    );

    let mut status_cmd = Command::new("powershell");
    status_cmd
        .args([
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &launcher,
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    status_cmd.creation_flags(CREATE_NO_WINDOW);
    let status = status_cmd.status().context("elevated VB-CABLE install")?;

    let _ = fs::remove_file(&script_path);

    let code = status.code();
    tracing::info!(?code, "VB-CABLE elevated install finished");
    Ok(match code {
        Some(0) | Some(3010) | Some(1641) => ElevatedOutcome::Ok,
        Some(1223) => ElevatedOutcome::Cancelled,
        Some(code) => ElevatedOutcome::Failed(code),
        None => ElevatedOutcome::Ok,
    })
}

/// Strip Windows extended-length prefix (`\\?\`) that breaks many installers.
fn native_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

fn ps_escape(path: &Path) -> String {
    ps_escape_str(&native_path(path))
}

fn ps_escape_str(s: &str) -> String {
    s.replace('\'', "''")
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
        assert!(!is_virtual_playback_name(
            "Alto-falantes (Realtek(R) Audio)"
        ));
    }

    #[test]
    fn prefers_speakers_pin_over_16ch() {
        // Win10/11 VB-CABLE: Speakers pin + Line-Out 16 Ch — only one may be open.
        let devices = vec![
            ("Alto-falantes (Realtek(R) Audio)".into(), true),
            ("Alto-falantes (VB-Audio Virtual Cable)".into(), false),
            ("CABLE In 16 Ch (VB-Audio Virtual Cable)".into(), false),
        ];
        let picked = pick_virtual_playback(&devices, Some("Alto-falantes (Realtek(R) Audio)"));
        assert_eq!(
            picked.as_deref(),
            Some("Alto-falantes (VB-Audio Virtual Cable)")
        );
        assert!(is_vb_cable_16ch_pin(
            "CABLE In 16 Ch (VB-Audio Virtual Cable)"
        ));
    }

    #[test]
    fn falls_back_to_16ch_only_when_no_stereo_pin() {
        let devices = vec![
            ("Alto-falantes (Realtek(R) Audio)".into(), true),
            ("CABLE In 16 Ch (VB-Audio Virtual Cable)".into(), false),
        ];
        assert_eq!(
            pick_virtual_playback(&devices, None).as_deref(),
            Some("CABLE In 16 Ch (VB-Audio Virtual Cable)")
        );
    }

    #[test]
    fn sanitizes_monitor_when_default_is_vb_cable() {
        let devices = vec![
            ("Alto-falantes (VB-Audio Virtual Cable)".into(), true),
            ("CABLE Input (VB-Audio Virtual Cable)".into(), false),
            ("Fones de ouvido (Realtek(R) Audio)".into(), false),
        ];
        let (enabled, monitor) = sanitize_monitor_for_virtual_secondary(
            &devices,
            true,
            None, // "system default" — which is VB-CABLE after install
            Some("CABLE Input (VB-Audio Virtual Cable)"),
        );
        assert!(enabled);
        assert_eq!(
            monitor.as_deref(),
            Some("Fones de ouvido (Realtek(R) Audio)")
        );
    }

    #[test]
    fn sanitizes_monitor_when_explicitly_on_other_cable_pin() {
        let devices = vec![
            ("Alto-falantes (Realtek(R) Audio)".into(), true),
            ("Alto-falantes (VB-Audio Virtual Cable)".into(), false),
            ("CABLE In 16 Ch (VB-Audio Virtual Cable)".into(), false),
        ];
        let (enabled, monitor) = sanitize_monitor_for_virtual_secondary(
            &devices,
            true,
            Some("Alto-falantes (VB-Audio Virtual Cable)".into()),
            Some("CABLE In 16 Ch (VB-Audio Virtual Cable)"),
        );
        assert!(enabled);
        assert_eq!(monitor.as_deref(), Some("Alto-falantes (Realtek(R) Audio)"));
    }
}
