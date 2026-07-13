# Architecture overview

Buddio splits UI, persistence, and realtime audio so the hot path stays short.

## Layers

```text
React (Zustand)  --invoke/events-->  Tauri commands
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
              LibraryManager      HotkeyManager         AudioEngine
              (SQLite meta)   (global-shortcut)     (crates/audio-engine)
                    |                                      |
               app-data/assets/                     cpal / rodio sinks
```

## Audio engine callback policy

The cpal / rodio audio callback must stay cheap:

- **No** disk I/O
- **No** SQLite
- **No** long mutex holds
- **No** heavy logging

Decoding always happens on the engine command thread (or import task) into an in-memory PCM hot cache (`Arc<[f32]>` + sample rate + channels). Playback only pulls from that cache and mixes into open `Sink`s.

## Dual outputs

The engine keeps up to two open output streams:

1. **Monitor** — what you hear locally (system default if unset)
2. **Secondary** — virtual cable playback endpoint for calls (typically **CABLE Input** from VB-CABLE)

Onboarding/Routing can **ensure** the cable: detect → download/install VB-CABLE (UAC) → select CABLE Input → tip user to pick **CABLE Output** in Discord/Zoom. See `docs/superpowers/specs/2026-07-13-zero-config-virtual-cable-design.md`.

Each `Play` fans out to every enabled stream. Modes:

- **monitor only** — monitor on, secondary off
- **call only** — monitor off (`monitor_enabled = false`), secondary on (VB-CABLE)
- **both** — monitor and secondary enabled

## Data model

SQLite stores clip metadata and settings only. Audio blobs live as files under `app-data/assets/<sha256>.<ext>`. Duplicate imports are rejected by content hash.

## Hotkeys

`tauri-plugin-global-shortcut` registers per-clip shortcuts plus a global stop-all. While the UI records a new chord, registrations are suspended so the capture does not fire playback.
