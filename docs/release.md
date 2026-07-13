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

Without a certificate, Windows SmartScreen may warn on first install. This is
about signing the `.exe`/NSIS installer itself — unrelated to
`TAURI_SIGNING_PRIVATE_KEY`, which is for the Tauri in-app updater (out of
scope for 1.0; see the plan's "Fora de escopo" section — we only do a manual
GitHub-releases check).

### What you need

1. A Windows code-signing certificate as a `.pfx` file (private key + cert
   bundled together, password-protected). Either:
   - **OV (Organization Validation)**: cheaper, but since June 2023 CA/Browser
     Forum rules require the private key on a hardware token/HSM — you can no
     longer just download a `.pfx` from most CAs. Check your issuer's current
     process before assuming a plain file works.
   - **EV (Extended Validation)**: pricier and requires business vetting, but
     gets immediate Microsoft SmartScreen reputation — no warning on day one.
     Also requires a hardware token/HSM.
2. If the key lives on a hardware token, base64-encoding a `.pfx` (see below)
   isn't possible — CI signing then needs a self-hosted runner with the token
   attached, or a cloud HSM signing service (e.g. Azure Trusted Signing/DigiCert
   KeyLocker) instead of the `WINDOWS_CERTIFICATE` secret flow.

### CI secrets (when the key is a plain `.pfx`)

| Secret | Purpose |
|--------|---------|
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` (`certutil -encode cert.pfx cert.b64` on Windows, or `base64 -w0 cert.pfx` on Linux/macOS) |
| `WINDOWS_CERTIFICATE_PASSWORD` | The `.pfx` export password |
| `GITHUB_TOKEN` | Auto (release upload) |

`tauri-apps/tauri-action` (already used by `.github/workflows/release.yml`)
picks these up automatically when set — no extra step needed, just add the
secrets in the repo's Settings → Secrets and re-run the release workflow.

Until these secrets exist, releases publish **unsigned** NSIS installers and
SmartScreen will warn on first run.

## GitHub Releases

- Workflow uses `releaseDraft: false` — tags create a public release.
- Check-for-updates in-app queries `https://api.github.com/repos/hugoriosbrito/Buddio/releases/latest`
  (override with `VITE_BUDDIO_GITHUB_REPO`).

## VB-CABLE

- `fetch:vbcable` must run before build (local + CI).
- NSIS hooks install/uninstall VB-CABLE only when Buddio owns the install.
