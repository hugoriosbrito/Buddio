# Zero-config virtual cable (VB-CABLE under the hood)

**Status:** approved for implementation  
**Date:** 2026-07-13

## Goal

Onboarding and Routing activate call routing without asking the user to understand virtual cables. Under the hood Buddio downloads/installs VB-CABLE (when missing), selects **CABLE Input** as secondary output, and tells the user to pick **CABLE Output** in Discord/Zoom.

## Non-goals

- Own branded “Buddio Virtual Mic” WDM driver
- Soundpad-style capture injection into the physical mic
- Real mic+effects mix engine (flag may exist; not this work)

## Licensing

VB-CABLE may be redistributed/silent-installed if end users can identify it as VB-Audio donationware and donate: https://vb-audio.com/Services/licensing.htm  
UI must credit `vb-cable.com`.

## Commands

- `get_virtual_cable_status`
- `ensure_virtual_cable` (detect → install if needed → configure secondary)

## UX

- Step copy: “Ativar sons nas chamadas”
- Attribution line + Discord tip for CABLE Output
- Reboot resume via `pending_virtual_setup` setting
