# Zero-config virtual cable (VB-CABLE under the hood)

**Status:** approved for implementation  
**Date:** 2026-07-13  
**Updated:** 2026-07-13 — Windows NSIS ships + uninstalls VB-CABLE

## Goal

Onboarding and Routing activate call routing without asking the user to understand virtual cables. Under the hood Buddio installs VB-CABLE (when missing), selects **CABLE Input** as secondary output, mixes the physical mic into that path when mic-mix is on, and tells the user to pick **CABLE Output** in Discord/Zoom.

## Non-goals

- Own branded “Buddio Virtual Mic” WDM driver
- Soundpad-style capture injection into the physical mic

## Licensing

VB-CABLE may be redistributed/silent-installed if end users can identify it as VB-Audio donationware and donate: https://vb-audio.com/Services/licensing.htm  
UI must credit `vb-cable.com`.

## Installer (Windows NSIS)

- `scripts/fetch-vbcable.ps1` downloads the official pack into `src-tauri/resources/vbcable/pack/` (gitignored).
- `beforeBuildCommand` + CI `fetch:vbcable` ensure the pack is present before `tauri build`.
- Bundle target: `nsis` only, `installMode: perMachine` (admin required for the driver).
- Hooks: `src-tauri/windows/hooks.nsh`
  - **POSTINSTALL:** if VB-CABLE is absent, run bundled `VBCABLE_Setup_x64.exe -h -i -H -n` and set `HKLM\Software\Buddio\VirtualCableOwned=1`.
  - **PREUNINSTALL:** if owned by Buddio, run `-h -u -H -n` and clear the marker. Pre-existing VB-CABLE installs are left alone.
- Runtime fallback: `ensure_virtual_cable` prefers the bundled pack, otherwise downloads on demand.

## Commands

- `get_virtual_cable_status`
- `ensure_virtual_cable` (detect → install if needed → configure secondary + enable mic mix)

## UX

- Step copy: “Ativar sons nas chamadas”
- Attribution line + Discord tip for CABLE Output
- Reboot resume via `pending_virtual_setup` setting
- Mic mix on by default so voice + soundboard share CABLE Output
