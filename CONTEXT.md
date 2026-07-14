# Buddio — domain glossary

This file is a glossary of product language. It is not a technical spec.

## Clip

A single sound in the library: metadata (name, hotkey, trim, fade, gain,
normalization) plus an audio file stored locally under app data. The original
import path is not required after import.

## Collection

A named group of clips used for organization and for the active soundboard
filter (e.g. Streaming, Jogos). A clip may belong to zero or more collections.

## Profile

A named preset of monitor/secondary devices, master volume, preferred
collection, and microphone route mode. Applying a profile switches the live
audio route without re-importing sounds.

## Mic route mode

How the physical microphone shares the virtual cable (CABLE) with the
soundboard while a clip plays:

- **Mix** — voice and soundboard together at normal voice level.
- **Ducking** — voice stays present but is attenuated by a configured dB amount
  while a clip plays.
- **Sound only** — voice is muted on the cable while a clip plays (block voice);
  voice returns when playback stops.

These modes are exclusive.

## Normalization

Automatic loudness matching so clips play near the user’s calibrated voice
level. Analyzed on import (baseline), refined lightly on first playback, with
optional manual gain as an override.

## VAD sound

A keep-alive on the call path while a clip plays: strong opening burst, then soft
formant-like pulses for the whole duration. Intended to hold Discord/Zoom
voice-activity detection open — a one-shot beep only wakes the gate for ~1s.
Discord **noise suppression** (especially Krisp) still often destroys music;
users should disable NS/echo cancellation for soundboard use.

## Locale

UI language defaults to **English** (`en`). Switch in **Settings → Appearance →
Language** (`en` / `pt`). Catalogs live in `src/i18n/{en,pt}.ts`; `useT()` /
`translate()` interpolate `{var}` placeholders.

## Updates

On launch (after onboarding), Buddio checks GitHub releases quietly. If a newer
build exists, an in-app modal prompts the user and a bell + red badge stays in
the titlebar until updated. “Later” dismisses the modal for that version this
session; the badge remains so the release can be reopened.

## Secondary / virtual mic

The playback endpoint Buddio uses for calls (typically VB-CABLE **CABLE Input**).
Discord/Zoom should select **CABLE Output** as the microphone input.

## Monitor

The local listening device so the user hears what is sent to the call path.

## Buddio Mini

A compact always-on-top tray companion for pinned clips and quick search,
without opening the full window.

## Watched folder

An external directory Buddio monitors; new supported audio files are imported
automatically into the library (optionally into a collection).

## Index hotkey

A global shortcut keyed by position (`Ctrl+Alt+N` or `Alt+NumpadN`) that plays
the N-th clip in the active collection (or full library), without binding a
per-clip hotkey.
