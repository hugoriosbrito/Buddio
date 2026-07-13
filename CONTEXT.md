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

A short beep played on the call path immediately before a clip, intended to
wake Discord (or similar) voice-activity detection so the beginning of the clip
is not clipped.

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
