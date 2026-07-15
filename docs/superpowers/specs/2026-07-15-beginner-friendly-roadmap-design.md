# Buddio beginner-friendly product roadmap

**Date:** 2026-07-15
**Status:** Approved in product interview
**Primary platform:** Windows
**Product posture:** Offline-first, beginner-first, no account, no telemetry

## Summary

Buddio already has a strong first-run wizard, audio routing, diagnostics,
profiles, collections, an audio editor, global hotkeys, and a compact Mini
window. The largest usability gap is not missing audio capability. It is the
lack of one continuous recovery experience after onboarding.

This design introduces a progressive safety layer centered on a permanent
**Help and diagnostics center**. The center reuses and unifies existing route
checks, translates technical failures into recognizable symptoms, offers safe
repairs, confirms whether repairs worked, and keeps essential guidance offline.

The roadmap then adds local backup and restore, app-linked profiles, microphone
recording, automatic editable clip icons, smart collections, and local sound
packs. These features remain independent so they can ship incrementally.

## Evidence from the current product

The review found a mismatch between the documented experience and the current
implementation:

- The UX reference says diagnostics must explain why sound failed, where the
  route failed, how to fix it, and whether the fix was applied.
- The current diagnostics modal primarily lists devices, warnings, and a test
  sample.
- In Routing, both “Run diagnostics” and “Repair route” open the diagnostics
  modal, but the modal does not perform a repair.
- The onboarding contains a stronger route-error and repair experience, but
  that guidance is not available as a persistent post-onboarding journey.
- Routing exposes a search field whose query does not affect the screen.
- Search with no matching clips can show a library-empty message instead of a
  no-results message.
- The import-review UI supports an image URL for a clip icon, while the stored
  clip field already accepts either a short emoji or an image URL.
- The product has no complete backup/restore or collection-level sharing flow.

This specification is based on the repository, design references, and product
interview. It is not a claim of a completed live accessibility audit.

## Target user

The baseline user does not understand virtual cables, audio routing, LUFS, VAD,
ducking, or Windows device endpoints. Buddio should expose those terms only
when they help resolve a problem. Advanced controls remain available through
progressive disclosure.

An experienced user should still be able to reach technical details quickly,
but the default path is written around outcomes:

- “The call cannot hear my sounds.”
- “I cannot hear the sound.”
- “My microphone stopped working.”
- “Music sounds cut off.”
- “My audio device changed.”

## Goals

- Make audio-route health understandable without prior audio knowledge.
- Give every detected failure a clear consequence and next action.
- Reuse one health result across onboarding, Routing, the status bar, alerts,
  and Help.
- Verify every attempted repair before declaring success.
- Keep essential diagnostics and guidance available offline.
- Preserve privacy by default and require review before sharing diagnostics.
- Protect local libraries through portable backup and safe merge restore.
- Reduce repetitive setup through explicit, reversible app-linked profiles.
- Make clip creation and organization easier without requiring external tools.

## Non-goals

- A public sound marketplace in the first roadmap.
- Cloud sync, accounts, telemetry, or automatic diagnostic upload.
- Human support through email or a hosted form.
- Capturing another application's system audio in the first recording release.
- Silently changing Windows settings, installing software, or applying profiles
  without the user's prior consent.
- Replacing the existing design system or main information architecture.

## Chosen approach

The product will use a **progressive safety layer**:

1. Correct misleading or incomplete foundational interactions.
2. Add a permanent Help and diagnostics center.
3. Surface the same health state contextually without interrupting work.
4. Add safety and personalization features.
5. Add creation, organization, and local sharing features.

A static FAQ was rejected because it requires users to identify and search for
the right technical topic. A diagnostics-only screen was rejected because it
would remain disconnected from the affected task.

## Priority order

### Phase 0 — Foundational usability corrections

- Remove the Routing search field; the screen has too few stable searchable
  entities for it to provide a useful result set.
- Distinguish an empty library from a search with no results.
- Make “Repair route” perform a repair journey rather than only opening a
  technical modal.
- Use consistent route-health language across onboarding, Routing, and the
  status bar.
- Add concise explanations for monitor, virtual microphone, ducking, LUFS, and
  VAD at their points of use.

### Phase 1 — Help and diagnostics center

This is the first new product surface and the highest-priority feature.

### Phase 2 — Safety and personalization

- Buddio backup and safe restore.
- Preferred app.
- App-linked profiles.

### Phase 3 — Creation and organization

- Microphone recording.
- Automatic editable clip icons.
- Smart collections.

### Phase 4 — Local sharing

- Local sound packs.

## Help and diagnostics experience

### Entry points

- Add **Help** near the bottom of the sidebar, above Settings.
- Make route health in the bottom status bar clickable.
- Show a compact persistent alert when a current failure affects the user's
  task.
- Use transient toasts only for transient events.
- Never open Help automatically or steal focus.

All contextual entry points open the exact detected problem rather than the
generic Help home.

### Help home

Opening Help immediately starts a quick local health check.

When a failure is detected, the top section shows:

- a plain-language title;
- the user-visible consequence;
- the likely cause;
- one primary next action;
- secondary guidance when needed;
- a collapsed technical-details section.

When no failure is detected, the center shows a healthy state followed by
“What is happening?” symptom choices. This manual symptom path is necessary
because Buddio cannot inspect every setting inside Discord, Teams, Zoom,
Google Meet, OBS, or a game.

### Health language

The shared health summary has three user-facing levels:

- **Ready:** the configured route passed the current checks.
- **Attention needed:** Buddio can still work, but an expected capability may
  be unavailable or degraded.
- **Blocked:** a core route required for the selected outcome is unavailable.

Color is supplementary. Every level also has text and an icon.

### Problem model

Every problem presented to the user contains:

- stable problem identifier;
- severity;
- plain-language title and explanation;
- affected outcome;
- evidence from the current health snapshot;
- safe actions;
- actions requiring confirmation;
- guide references;
- verification check;
- sanitized technical details.

The first release covers:

- the call cannot hear Buddio sounds;
- the user cannot hear Buddio sounds;
- the physical microphone is unavailable;
- music is cut off or suppressed;
- a previously selected device changed or disappeared.

### Repair safety

Safe local actions may run from a direct user click without an additional
confirmation dialog:

- reconnect or reselect an available configured device;
- restart Buddio's audio route;
- rerun diagnostics;
- replay the bundled test sample;
- open the relevant Windows settings page.

Potentially disruptive actions require an explanation and explicit approval:

- install VB-CABLE;
- change Windows-level configuration;
- require a Windows restart;
- replace a user-selected device;
- enable persistent automatic profile application.

After every repair, Buddio obtains a fresh health result. The interface may say
“Resolved” only when the verification check passes.

### Preferred app and guides

The first guide set is:

- Discord;
- Microsoft Teams;
- Zoom;
- Google Meet;
- OBS Studio;
- another application or game.

The set covers social voice, work calls, browser meetings, streaming, and a
generic fallback. Official product guidance confirms that these apps expose
their own microphone, speaker, noise-processing, or audio-source controls:

- [Discord voice troubleshooting](https://support.discord.com/hc/en-us/articles/360045138471-Discord-Voice-and-Video-Troubleshooting-Guide)
- [Teams device settings](https://support.microsoft.com/en-us/teams/notifications-settings/manage-your-device-settings-in-microsoft-teams)
- [Zoom audio testing](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062765)
- [Google Meet audio setup](https://support.google.com/meet/answer/10409699?hl=en)
- [OBS audio sources](https://obsproject.com/kb/audio-sources)

The user selects a preferred app. Buddio remembers it locally and prioritizes
that guide in later diagnostics. Essential guide content ships with the app;
official links are optional supplements.

### No human-support promise

The center is self-service. When Buddio cannot resolve a problem, it provides:

- the unresolved state;
- the next recommended test;
- a relevant Windows destination or official guide;
- copy and save actions for a diagnostic report;
- a discreet optional link to open a GitHub issue.

GitHub is presented as a technical community channel, not guaranteed support.

### Diagnostic privacy

A shareable diagnostic may contain only:

- Buddio version;
- Windows version;
- audio-device names;
- configured route and route mode;
- tests attempted;
- warnings and test results.

It must exclude:

- user names;
- file-system paths;
- clip names and library contents;
- credentials, tokens, and unrelated logs;
- data not required to understand the route problem.

The complete sanitized text is shown before copying, saving, or opening GitHub.
Nothing is sent automatically.

## Product architecture

The health experience has one source of truth and five bounded units.

### Health engine

Collects devices, selected route, virtual-cable state, current settings, and
test results into a single fresh snapshot. It does not render copy or choose UI
components.

### Problem classifier

Maps a health snapshot and the user's intended outcome to stable problems. It
owns severity, affected outcome, available actions, and the verification rule.

### Repair executor

Runs one explicit repair action and returns an action result. Risk metadata
determines whether confirmation is required. The caller always requests a new
health snapshot after completion.

### Offline guide library

Stores localized guide steps by symptom and app. It contains no executable
repair logic and does not require a network connection.

### Help UI

Presents health, symptoms, guides, actions, and technical details. Onboarding,
Routing, the status bar, and contextual alerts consume the same shared health
result instead of implementing their own interpretation.

### Core data flow

```text
check -> classify -> explain -> repair -> check again
```

The app persists only explicit preferences such as preferred app, dismissed
guidance, and consent for automatic profile application. It does not persist or
upload a diagnostic history by default.

## Complementary features

### Buddio backup

A backup is a versioned portable local package containing:

- audio assets;
- clip metadata and edits;
- collections;
- profiles;
- hotkeys;
- app settings.

Restore always begins with a preview and uses safe merge semantics:

- identical audio is ignored by content hash;
- different sounds with the same name are both kept;
- conflicting collections and profiles receive adjusted names;
- conflicting hotkeys remain pending for review;
- unavailable devices are not applied;
- watched folders whose paths do not exist are restored disabled and flagged;
- the current library is never deleted silently.

Before export or restore, Buddio checks the required disk space and reports the
package size in the review.

The first release provides manual export and restore. Cloud storage and
scheduled backup are outside scope.

### App-linked profiles

A profile may be associated with an installed preferred app. When Buddio
detects that app opening, it first suggests applying the profile. The user may
then grant persistent “always apply” consent for that association.

Automatic application is local, reversible, visible, and disabled by default.
The profile editor provides a clear way to revoke consent.

### Microphone recording

Add **Record sound** beside Import audio. The first release records only from a
selected microphone and provides:

- countdown;
- live input meter;
- stop and cancel;
- preview;
- trim;
- normalization;
- name, collection, hotkey, and clip icon before saving.

Interrupted recordings and temporary files are cleaned up safely. Capturing
another application's system audio is deferred.

### Clip icons

The product term **Clip icon** replaces the import UI's image-only wording. A
clip icon may be an emoji or custom image.

Resolution priority:

1. user-selected emoji;
2. user-provided image;
3. offline emoji suggestion based on the clip name;
4. generic speaker fallback.

Suggestions are deterministic, local, editable, and never overwrite a user
choice. Both import review and the inspector expose the same editor.

### Smart collections

Smart collections are locally derived, hideable views that do not change manual
collection membership:

- Recent;
- Most used;
- Without hotkey;
- Unorganized.

Recent and Most used require local play metadata. The user may clear this usage
history without deleting clips.

### Sound packs

A sound pack is a versioned local package containing selected clips and
reusable metadata. It excludes personal devices, profiles, and application
settings.

Import always uses a review step and applies the same duplicate and hotkey
conflict rules as normal import. Imported packages are treated as untrusted:
Buddio validates the manifest version, file types, declared sizes, archive
paths, and total extracted size before writing into app data. Custom image URLs
remain visible references in the review and are never fetched as part of the
package import without an explicit user action. The first release has no public
catalog, server, moderation system, or automatic upload.

## UX and accessibility requirements

- Help follows the current Buddio design system and visual hierarchy.
- The primary action on each problem is singular and specific.
- Raw errors appear only in technical details.
- Loading states have a clear timeout, retry, and exit path.
- Cancelled installation, denied permission, disconnected devices, and pending
  restart preserve progress and offer a safe continuation.
- Text and icon accompany every health color.
- Diagnostic state changes use an appropriate live region.
- The full journey works by keyboard.
- Focus moves to the resulting status after a check or repair.
- Repeated actions use specific accessible names rather than indistinguishable
  “Try again” labels.
- Motion respects the existing reduce-motion setting.
- A failed repair is never styled or announced as success.

## Validation strategy

### Unit coverage

- problem-classification rules;
- repair risk and confirmation rules;
- verification rules;
- diagnostic sanitization;
- offline emoji suggestions and precedence;
- backup and sound-pack manifest versions;
- merge and conflict resolution;
- archive path and size validation;
- smart-collection derivation.

### Backend and integration coverage

- healthy route;
- missing virtual cable;
- disconnected and replaced devices;
- cancelled install and denied elevation;
- pending restart;
- successful and unsuccessful repair;
- diagnostics that do not interrupt real-time playback;
- corrupted, incomplete, oversized, and incompatible packages;
- interrupted recording and temporary-file cleanup.

### End-to-end coverage

- open Help from the sidebar, status bar, and a contextual alert;
- detected problem to verified repair;
- healthy diagnosis to manual symptom and app guide;
- complete guide use while offline;
- keyboard-only journey and focus restoration;
- diagnostic preview before copy, save, and GitHub;
- backup export and safe restore round trip;
- profile suggestion, consent, automatic application, and revocation;
- recording through review into a playable clip;
- emoji suggestion without overwriting user input;
- sound-pack export and reviewed import.

## Acceptance criteria

- Every supported error offers a useful next action.
- No repair reports success before a fresh verification passes.
- Essential Help content works without internet.
- The same health state appears across onboarding, Routing, status, and Help.
- No shareable diagnostic contains excluded personal data.
- No restore or pack import silently deletes existing data.
- No app-linked profile applies automatically without saved consent.
- Help and repair remain usable by keyboard and assistive technology.
- Health checks do not degrade playback or the audio callback path.

## Delivery decomposition

This roadmap is intentionally larger than one implementation plan. After this
document is approved, implementation planning starts with **Phase 0 and Phase
1 only**. Each later phase receives its own implementation plan and verification
gate. This keeps the Help center focused and prevents backup, recording, or
sharing work from delaying the highest-impact usability improvements.
