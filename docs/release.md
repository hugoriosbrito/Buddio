# Buddio release process (Windows)

## Versioning

- Bump `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and
  `src/lib/updates.ts` (`APP_VERSION`) together.
- Tag as `v1.0.0` (leading `v`). Pushing the tag runs `.github/workflows/release.yml`.

## Build locally

```bash
bun install
bun run fetch:vbcable
bun run tauri build
```

Installer: `target/release/bundle/nsis/Buddio_*_x64-setup.exe`.

## Code signing (Authenticode)

Without a certificate, Windows SmartScreen may warn on first install.

### Local (optional)

Set before `tauri build`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "..."   # or path via TAURI_SIGNING_PRIVATE_KEY_PATH
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "..."
```

For Authenticode on the NSIS installer, configure a Windows code-signing cert in CI
secrets and pass `certificateThumbprint` / related `tauri-action` inputs when available.

### CI secrets (recommended)

| Secret | Purpose |
|--------|---------|
| `WINDOWS_CERTIFICATE` | Base64 PFX |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |
| `GITHUB_TOKEN` | Auto (release upload) |

When secrets are present, add a signing step before publishing the release artifact.
Until then, releases publish unsigned NSIS installers.

## GitHub Releases

- Workflow uses `releaseDraft: false` — tags create a public release.
- Check-for-updates in-app queries `https://api.github.com/repos/hugoriosbrito/Buddio/releases/latest`
  (override with `VITE_BUDDIO_GITHUB_REPO`).

## VB-CABLE

- `fetch:vbcable` must run before build (local + CI).
- NSIS hooks install/uninstall VB-CABLE only when Buddio owns the install.
