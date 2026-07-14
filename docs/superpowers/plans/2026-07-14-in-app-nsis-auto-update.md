# In-app NSIS Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Verify Updates / the update modal download the GitHub NSIS setup, silent-install with `/S /UPDATE /R`, and relaunch Buddio — without opening a browser.

**Architecture:** Keep the existing frontend GitHub Releases check; extend it to pick the `Buddio_*_x64-setup.exe` asset URL. A new Tauri command downloads that URL (HTTPS allowlist) with progress events, spawns the installer, then quits the app. UI drives confirm → progress → install.

**Tech Stack:** Tauri 2, Rust (`ureq`, `std::process::Command`), React + Zustand, Vitest, i18n en/pt

**Spec:** `docs/superpowers/specs/2026-07-14-in-app-nsis-auto-update-design.md`

---

## File map

| Path | Role |
|------|------|
| `src/lib/updates.ts` | Asset picker + `downloadUrl` on `update_available` |
| `src/lib/updates.test.ts` | Tests for asset name + URL allowlist helpers |
| `src-tauri/src/managers/nsis_update.rs` | Allowlist, download w/ progress, spawn installer |
| `src-tauri/src/managers/mod.rs` | `mod nsis_update` |
| `src-tauri/src/commands/mod.rs` | `start_nsis_update` command |
| `src-tauri/src/lib.rs` | Register command in specta collect |
| `src/lib/bindings.ts` | Regenerated via `bun run gen:bindings` |
| `src/lib/api.ts` | Thin wrapper `startNsisUpdate` |
| `src/stores/updateStore.ts` | Install phase + progress + `startInstall` |
| `src/components/UpdateAvailableModal.tsx` | Update now + progress + GitHub secondary |
| `src/views/Settings.tsx` | Toast CTA → open update modal / install |
| `src/App.tsx` | Listen `update-download-progress` |
| `src/i18n/en.ts` / `pt.ts` | New strings |
| `CONTEXT.md`, `docs/release.md`, `README.md`, `README.pt-BR.md` | Docs |

---

### Task 1: Frontend helpers — asset pick + URL allowlist

**Files:**
- Modify: `src/lib/updates.ts`
- Modify: `src/lib/updates.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `updates.test.ts`:

```ts
import {
  isAllowedUpdateDownloadUrl,
  pickNsisAssetUrl,
} from "./updates";

describe("pickNsisAssetUrl", () => {
  it("picks Buddio x64 setup exe case-insensitively", () => {
    expect(
      pickNsisAssetUrl([
        { name: "notes.txt", browser_download_url: "https://github.com/x/y/releases/download/v1/notes.txt" },
        {
          name: "Buddio_1.0.0-rc5_x64-setup.exe",
          browser_download_url:
            "https://github.com/hugoriosbrito/Buddio/releases/download/v1.0.0-rc5/Buddio_1.0.0-rc5_x64-setup.exe",
        },
      ]),
    ).toContain("Buddio_1.0.0-rc5_x64-setup.exe");
  });

  it("returns null when no matching asset", () => {
    expect(pickNsisAssetUrl([{ name: "foo.msi", browser_download_url: "https://github.com/a/b/x.msi" }])).toBeNull();
  });
});

describe("isAllowedUpdateDownloadUrl", () => {
  it("allows github download hosts only", () => {
    expect(
      isAllowedUpdateDownloadUrl(
        "https://github.com/hugoriosbrito/Buddio/releases/download/v1/Buddio_1_x64-setup.exe",
      ),
    ).toBe(true);
    expect(
      isAllowedUpdateDownloadUrl(
        "https://objects.githubusercontent.com/github-production-release-asset-2e65be/123/abc",
      ),
    ).toBe(true);
    expect(isAllowedUpdateDownloadUrl("https://evil.example/Buddio_x64-setup.exe")).toBe(false);
    expect(isAllowedUpdateDownloadUrl("http://github.com/x/y.exe")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test src/lib/updates.test.ts
```

- [ ] **Step 3: Implement helpers + wire `downloadUrl` into check**

In `updates.ts`:

```ts
export type GithubReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

export function isNsisSetupAssetName(name: string): boolean {
  return /^buddio_.*_x64-setup\.exe$/i.test(name.trim());
}

export function isAllowedUpdateDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "github.com" ||
      u.hostname === "objects.githubusercontent.com"
    );
  } catch {
    return false;
  }
}

export function pickNsisAssetUrl(
  assets: GithubReleaseAsset[] | undefined | null,
): string | null {
  if (!assets?.length) return null;
  for (const asset of assets) {
    const name = asset.name?.trim() ?? "";
    const url = asset.browser_download_url?.trim() ?? "";
    if (!name || !url) continue;
    if (!isNsisSetupAssetName(name)) continue;
    if (!isAllowedUpdateDownloadUrl(url)) continue;
    return url;
  }
  return null;
}
```

Extend `GithubRelease` with `assets?: GithubReleaseAsset[]`.

Extend `UpdateCheckResult` success variant:

```ts
| {
    status: "update_available";
    current: string;
    latest: string;
    url: string;
    downloadUrl: string | null;
  }
```

In `checkForUpdates`, when newer:

```ts
downloadUrl: pickNsisAssetUrl(newest.assets),
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun run test src/lib/updates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/updates.ts src/lib/updates.test.ts
git commit -m "feat(updates): pick NSIS asset URL from GitHub release"
```

---

### Task 2: Rust `nsis_update` module (helpers + download + spawn)

**Files:**
- Create: `src-tauri/src/managers/nsis_update.rs`
- Modify: `src-tauri/src/managers/mod.rs`

- [ ] **Step 1: Add unit tests in the new module**

```rust
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
        assert!(!is_allowed_download_url("https://evil.test/Buddio_x64-setup.exe"));
    }

    #[test]
    fn matches_nsis_name() {
        assert!(is_nsis_setup_name("Buddio_1.0.0-rc5_x64-setup.exe"));
        assert!(!is_nsis_setup_name("Buddio_1.0.0-rc5_x64.msi"));
    }
}
```

- [ ] **Step 2: Implement module**

```rust
//! Download + silent-launch Tauri NSIS setup for in-app updates (Windows).

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
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
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "https" {
        return false;
    }
    matches!(
        parsed.host_str(),
        Some("github.com") | Some("objects.githubusercontent.com")
    )
}

pub fn is_nsis_setup_name(name: &str) -> bool {
    let lower = name.trim().to_ascii_lowercase();
    lower.starts_with("buddio_") && lower.ends_with("_x64-setup.exe")
}

pub fn dest_path(temp_dir: &Path, version: &str) -> PathBuf {
    let safe: String = version
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' })
        .collect();
    temp_dir
        .join("Buddio")
        .join("updates")
        .join(format!("Buddio_{safe}_x64-setup.exe"))
}

/// Stream download with progress emits. Caller supplies already-validated URL.
pub fn download_installer(
    app: &AppHandle,
    url: &str,
    dest: &Path,
) -> Result<()> {
    if !is_allowed_download_url(url) {
        bail!("download URL is not an allowed GitHub host");
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
        let _ = app.emit(
            PROGRESS_EVENT,
            DownloadProgress {
                received,
                total,
            },
        );
    }
    file.flush()?;
    if received == 0 {
        bail!("update download was empty");
    }
    Ok(())
}

#[cfg(windows)]
pub fn launch_nsis_and_prepare_exit(installer: &Path) -> Result<()> {
    Command::new(installer)
        .args(["/S", "/UPDATE", "/R"])
        .spawn()
        .with_context(|| format!("spawn installer {}", installer.display()))?;
    Ok(())
}

#[cfg(not(windows))]
pub fn launch_nsis_and_prepare_exit(_installer: &Path) -> Result<()> {
    bail!("in-app NSIS update is only supported on Windows");
}
```

**Dependency note:** Prefer parsing with `url` crate if already in workspace; otherwise use a minimal string check (starts with `https://github.com/` or `https://objects.githubusercontent.com/`) to avoid new deps. Prefer no new crate — use prefix/host checks without `url` crate.

Revised allowlist without `url` crate:

```rust
pub fn is_allowed_download_url(url: &str) -> bool {
    let lower = url.trim();
    lower.starts_with("https://github.com/")
        || lower.starts_with("https://objects.githubusercontent.com/")
}
```

- [ ] **Step 3: Export from managers/mod.rs**

```rust
pub mod nsis_update;
```

- [ ] **Step 4: Run Rust unit tests**

```bash
cd src-tauri && cargo test nsis_update -- --nocapture
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/managers/nsis_update.rs src-tauri/src/managers/mod.rs
git commit -m "feat(updates): add NSIS download/install helper module"
```

---

### Task 3: Tauri command `start_nsis_update`

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add command**

```rust
#[tauri::command]
#[specta::specta]
pub async fn start_nsis_update(
    app: AppHandle,
    version: String,
    download_url: String,
) -> CmdResult<()> {
    #[cfg(not(windows))]
    {
        let _ = (app, version, download_url);
        return Err("In-app update install is only available on Windows.".into());
    }
    #[cfg(windows)]
    {
        use crate::managers::nsis_update;

        if !nsis_update::is_allowed_download_url(&download_url) {
            return Err("Update download URL is not allowed.".into());
        }
        let version = version.trim().to_string();
        if version.is_empty() {
            return Err("Missing update version.".into());
        }

        let temp = std::env::temp_dir();
        let dest = nsis_update::dest_path(&temp, &version);
        let app_dl = app.clone();
        let url = download_url.clone();
        let dest_for_dl = dest.clone();

        tauri::async_runtime::spawn_blocking(move || {
            nsis_update::download_installer(&app_dl, &url, &dest_for_dl)
        })
        .await
        .map_err(|e| format!("Update download interrupted: {e}"))?
        .map_err(map_err)?;

        nsis_update::launch_nsis_and_prepare_exit(&dest).map_err(map_err)?;

        // Give the installer a moment to start, then quit so files can be replaced.
        let app_quit = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            app_quit.exit(0);
        });
        Ok(())
    }
}
```

Register in `lib.rs` collect_commands list: `commands::start_nsis_update`.

- [ ] **Step 2: Regenerate bindings**

```bash
bun run gen:bindings
```

Confirm `startNsisUpdate` exists in `src/lib/bindings.ts`.

- [ ] **Step 3: Wrap in api.ts**

```ts
export async function startNsisUpdate(
  version: string,
  downloadUrl: string,
): Promise<void> {
  const result = await commands.startNsisUpdate(version, downloadUrl);
  if (result.status === "error") throw new Error(result.error);
}
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/lib/bindings.ts src/lib/api.ts
git commit -m "feat(updates): expose start_nsis_update command"
```

---

### Task 4: Update store + App progress listener

**Files:**
- Modify: `src/stores/updateStore.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend store**

```ts
export type UpdateInstallPhase = "idle" | "downloading" | "installing" | "error";

// AvailableUpdate gains:
downloadUrl: string | null;

// State adds:
phase: UpdateInstallPhase;
progress: { received: number; total: number | null } | null;
error: string | null;
startInstall: () => Promise<void>;
resetInstall: () => void;
setProgress: (p: { received: number; total: number | null }) => void;
```

`startInstall`:

```ts
startInstall: async () => {
  const available = get().available;
  if (!available?.downloadUrl) {
    set({ phase: "error", error: "No installer asset on this release." });
    return;
  }
  set({ phase: "downloading", error: null, progress: { received: 0, total: null } });
  try {
    await api.startNsisUpdate(available.latest, available.downloadUrl);
    set({ phase: "installing" });
    // App should exit shortly after; if not, user sees installing state.
  } catch (e) {
    set({
      phase: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }
},
```

Wire `downloadUrl` in `applyCheckResult` from result.

- [ ] **Step 2: Listen in App.tsx**

```ts
void listen<{ received: number; total: number | null }>(
  "update-download-progress",
  (event) => {
    useUpdateStore.getState().setProgress({
      received: event.payload.received,
      total: event.payload.total ?? null,
    });
  },
).then((u) => unlistens.push(u));
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/updateStore.ts src/App.tsx
git commit -m "feat(updates): store install phase and progress events"
```

---

### Task 5: Modal + Settings + i18n

**Files:**
- Modify: `src/components/UpdateAvailableModal.tsx`
- Modify: `src/views/Settings.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/pt.ts`

- [ ] **Step 1: i18n keys**

EN:

```ts
"update.modalBody":
  "Download and install this build to get fixes and improvements. Your library stays on this PC.",
"update.now": "Update now",
"update.downloading": "Downloading… {percent}",
"update.installing": "Installing… Buddio will restart.",
"update.retry": "Try again",
"update.openGithubFallback": "Open on GitHub",
"update.noInstaller":
  "No Windows installer was found for this release. Open GitHub to update manually.",
"settings.update.openUpdate": "Update",
```

PT equivalents in `pt.ts`.

- [ ] **Step 2: Modal UX**

- Primary: `Update now` → `startInstall()` when `downloadUrl` present; else open GitHub.
- While `downloading` / `installing`: show progress bar (`received/total` or indeterminate); disable Later / close.
- On `error`: show message + Retry + Open on GitHub.
- Secondary ghost/link: View on GitHub always available when idle/error.

- [ ] **Step 3: Settings verifyUpdates**

On `update_available`: toast with `actionLabel: t("settings.update.openUpdate")` and `onAction` → `setModalOpen(true)` (not openExternal). Primary path remains the modal.

- [ ] **Step 4: Commit**

```bash
git add src/components/UpdateAvailableModal.tsx src/views/Settings.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat(updates): in-app install UX for Verify Updates"
```

---

### Task 6: Docs

**Files:**
- Modify: `CONTEXT.md`
- Modify: `docs/release.md`
- Modify: `README.md`
- Modify: `README.pt-BR.md`

- [ ] **Step 1: Update copy**

- CONTEXT Updates: confirm → download NSIS → `/S /UPDATE /R` → restart.
- release.md: document in-app NSIS path; keep Authenticode / Tauri updater notes as deferred.
- README EN/PT: tweak update bullet to “download and install”.

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md docs/release.md README.md README.pt-BR.md
git commit -m "docs: describe in-app NSIS auto-update"
```

---

### Task 7: Verify

- [ ] **Step 1: Frontend tests**

```bash
bun run test src/lib/updates.test.ts
```

- [ ] **Step 2: Rust fmt + nsis_update tests**

```bash
cargo fmt --all
cd src-tauri && cargo test nsis_update
```

- [ ] **Step 3: Manual smoke (Windows release build preferred)**

1. Install older RC, run app, trigger Verify Updates against a newer tag on GitHub.
2. Confirm → watch progress → UAC if needed → app restarts on new version.
3. Confirm library/settings intact.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Keep GitHub check | 1 |
| Pick NSIS asset + allowlist | 1, 2 |
| Progress events | 2, 3, 4 |
| `/S /UPDATE /R` + quit | 2, 3 |
| Modal Update now + progress | 5 |
| Settings toast not GitHub-primary | 5 |
| Non-Windows fallback | 3, 5 |
| Docs | 6 |
| Unit tests asset/URL | 1, 2 |
