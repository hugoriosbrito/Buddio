# In-app NSIS auto-update — design

**Date:** 2026-07-14  
**Status:** Approved (awaiting implementation)  
**Approach:** B — download official NSIS setup from GitHub Releases and silent-install

## Problem

“Verify Updates” (launch check + Settings) detects a newer GitHub release but only
opens the release page. Users expect confirm → download → install → restart inside
Buddio.

## Decision

Implement **custom NSIS update install** on Windows, not `tauri-plugin-updater`.

| Chosen | Rejected (for now) |
|--------|--------------------|
| Reuse existing GitHub Releases check | Tauri updater + minisign keys / CI `.sig` |
| Download `Buddio_*_x64-setup.exe` | Open browser only |
| Silent install `/S /UPDATE /R` | Guided NSIS wizard every time |

Rationale: current release pipeline already publishes unsigned NSIS installers; no
signing secrets exist for the Tauri updater; NSIS flags `/S`, `/UPDATE`, `/R` are
supported by Tauri’s generated installer.

## User flow

1. **Detect** — Keep `checkForUpdates()` (GitHub `/releases`, includes prereleases).
2. **Prompt** — Modal + titlebar badge when `update_available` (same store rules).
3. **Confirm** — Primary CTA **Update now** (not “View on GitHub”).
4. **Download** — Progress (`bytes received` / `total` when Content-Length known).
5. **Install** — Spawn setup with `/S /UPDATE /R`, then exit Buddio so the installer
   can replace files; `/R` relaunches the new binary.
6. **Defer** — “Later” dismisses modal for the session (badge remains).
7. **Fallback** — Secondary “View on GitHub”; on failure, toast/error + GitHub link.

Settings → Verify Updates uses the same path: if available, open modal (or begin
install UX); toast no longer treats GitHub open as the main action.

## Backend (Rust / Tauri)

### Commands / events

- `start_nsis_update { tag, download_url }` (or resolve asset URL from tag server-side).
- Emits `update-download-progress` `{ received: u64, total: Option<u64> }`.
- On success: launch installer, then quit app.
- On failure: return typed error string for UI.

### Asset selection

- Prefer asset whose name matches `Buddio_*_x64-setup.exe` (case-insensitive).
- Allowlist host: only `https://github.com/` and `https://objects.githubusercontent.com/`
  (and redirects within those).
- Reject non-`.exe` / mismatched names.

### Download & install

- Stream to `%TEMP%\Buddio\updates\Buddio_<version>_x64-setup.exe` (overwrite ok).
- Use existing `ureq` + TLS; optional SHA-256 if we later publish digests (not required v1).
- Launch: `CreateProcess` / `std::process::Command` with args `/S`, `/UPDATE`, `/R`.
- Quit via Tauri after spawn succeeds (small delay so the child is running).

### Permissions

- New command registered in `lib.rs` / specta bindings.
- No need for updater plugin capability; document in `docs/release.md`.

## Frontend

### Store (`updateStore`)

Extend with install phase:

- `phase: "idle" | "downloading" | "installing" | "error"`
- `progress: { received, total } | null`
- `error: string | null`
- `startInstall()` / `resetInstall()`

Wire progress listen once at app shell.

### UI

- `UpdateAvailableModal`: primary → start install; show progress bar; disable
  dismiss while installing; secondary GitHub link.
- Settings verify: on `update_available`, open modal; remove GitHub as sole CTA
  from toast (or change action to “Update”).
- i18n `en` / `pt`: strings for Update now, Downloading…, Installing…, errors.

## Failure modes

| Case | Behavior |
|------|----------|
| Offline / GitHub error | Existing `unavailable` reason |
| No matching NSIS asset | Error + GitHub fallback |
| Download abort / HTTP fail | Error, stay on current version |
| Installer spawn fail | Error |
| UAC denied | Installer exits; user stays on current; show retry / GitHub |
| User on non-Windows | Keep GitHub-only (out of scope for install path) |

## Out of scope

- `tauri-plugin-updater` / `TAURI_SIGNING_PRIVATE_KEY`
- Authenticode signing of the setup (SmartScreen unchanged)
- macOS / Linux auto-install
- Fully silent update without user confirmation
- Download cancel mid-stream (nice-to-have; optional follow-up)

## Docs / release notes

- Update `CONTEXT.md` Updates section: confirm → download → install → restart.
- Update `docs/release.md`: describe in-app NSIS update; note updater plugin still deferred.
- README bullets already mention update checks; tweak to “download and install”.

## Success criteria

- From an older build, Verify Updates / launch prompt can install a newer RC
  without opening a browser.
- Library / profiles / settings survive (`/UPDATE`).
- App relaunches on the new version (`/R`) when UAC allows the install.
- CI / rustfmt / existing update semver tests still pass; add unit tests for
  asset-name / URL allowlist helpers.
