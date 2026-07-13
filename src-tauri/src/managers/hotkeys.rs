//! Global hotkey registration via the `global-hotkey` crate (direct OS RegisterHotKey).
//!
//! We intentionally do **not** use `tauri-plugin-global-shortcut`'s `on_shortcut` path:
//! that plugin wraps every register/unregister in `run_on_main_thread` + `mpsc::recv`,
//! which surfaces opaque failures (often just our anyhow context) and is fragile during
//! Tauri setup. Buddio owns the manager on the UI thread and registers directly.
//!
//! ## Limitations
//!
//! - **Mouse chords** (`Ctrl+Mouse4`, …): captured and stored in the UI/DB, but
//!   `global-hotkey` 0.8 only supports keyboard `Code`s. Registration is skipped with a
//!   warning toast (`hotkey-event` / `unsupported`).
//! - **Alt+NN multi-digit** (e.g. `Alt+17`): not feasible — the crate registers a single
//!   key + modifiers. We register `Alt+Numpad1`..`Alt+Numpad9` / `Alt+Numpad0` for
//!   positions 1–10 instead.
//! - **Bare F1–F12**: fragile on Windows (see [`is_fragile_accelerator`]).

use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread::ThreadId;

use anyhow::{bail, Context, Result};
use global_hotkey::hotkey::HotKey;
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tracing::{debug, info, warn};

use crate::AppState;

#[derive(Debug, Clone)]
enum HotkeyAction {
    PlayClip(String),
    PlayIndex(usize),
    StopAll,
}

/// `GlobalHotKeyManager` must only be used on the thread that created it.
/// We enforce that in [`HotkeyManager::with_os`] and mark it Send for Arc storage.
struct HotkeyOs(GlobalHotKeyManager);

// SAFETY: all OS calls go through `with_os`, which runs on `main_thread_id`.
unsafe impl Send for HotkeyOs {}

/// Manages per-clip hotkeys and the global stop-all shortcut.
pub struct HotkeyManager {
    /// clip_id → normalized shortcut string
    bindings: Mutex<HashMap<String, String>>,
    stop_all: Mutex<Option<String>>,
    /// When true, registered shortcuts are temporarily unregistered (during capture UI).
    suspended: Mutex<bool>,
    /// normalized accelerator → OS hotkey (for unregister)
    registered: Mutex<HashMap<String, HotKey>>,
    /// hotkey id → action
    actions: Arc<Mutex<HashMap<u32, HotkeyAction>>>,
    /// Ordered clip ids for [`HotkeyAction::PlayIndex`] (position 0 = first pad).
    index_clip_ids: Arc<Mutex<Vec<String>>>,
    /// Last collection filter used for index hotkeys (`None` = all clips).
    index_collection_id: Mutex<Option<String>>,
    /// Accelerators owned by index / numpad bindings (subset of `registered`).
    index_accelerators: Mutex<Vec<String>>,
    os: Arc<Mutex<Option<HotkeyOs>>>,
    main_thread_id: Mutex<ThreadId>,
}

impl HotkeyManager {
    pub fn new() -> Self {
        Self {
            bindings: Mutex::new(HashMap::new()),
            stop_all: Mutex::new(None),
            suspended: Mutex::new(false),
            registered: Mutex::new(HashMap::new()),
            actions: Arc::new(Mutex::new(HashMap::new())),
            index_clip_ids: Arc::new(Mutex::new(Vec::new())),
            index_collection_id: Mutex::new(None),
            index_accelerators: Mutex::new(Vec::new()),
            os: Arc::new(Mutex::new(None)),
            main_thread_id: Mutex::new(std::thread::current().id()),
        }
    }

    /// Create the Win32 hotkey HWND + event handler. Must run on the UI/main thread.
    pub fn init_os(&self, app: &AppHandle) -> Result<()> {
        *self.main_thread_id.lock() = std::thread::current().id();

        let manager = GlobalHotKeyManager::new().context("create GlobalHotKeyManager")?;
        *self.os.lock() = Some(HotkeyOs(manager));

        let actions = self.actions.clone();
        let index_clip_ids = self.index_clip_ids.clone();
        let app_handle = app.clone();
        // OnceCell — only one handler for the process. Do not also init the Tauri plugin.
        GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
            if event.state != HotKeyState::Pressed {
                return;
            }
            let action = actions.lock().get(&event.id).cloned();
            let Some(action) = action else {
                eprintln!("[buddio] hotkey id={} pressed but no action mapped", event.id);
                return;
            };
            match action {
                HotkeyAction::PlayClip(clip_id) => {
                    eprintln!("[buddio] HOTKEY FIRED clip={clip_id}");
                    info!(clip_id = %clip_id, "global hotkey pressed");
                    let state = app_handle.state::<AppState>();
                    if let Err(err) = play_clip_by_id(&app_handle, &state, &clip_id) {
                        warn!(error = %err, "hotkey play failed");
                        eprintln!("[buddio] HOTKEY PLAY FAILED clip={clip_id}: {err:#}");
                    }
                }
                HotkeyAction::PlayIndex(index) => {
                    let clip_id = index_clip_ids.lock().get(index).cloned();
                    let Some(clip_id) = clip_id else {
                        eprintln!("[buddio] index hotkey {index} — no clip at position");
                        return;
                    };
                    eprintln!("[buddio] HOTKEY FIRED index={index} clip={clip_id}");
                    info!(index, clip_id = %clip_id, "index hotkey pressed");
                    let state = app_handle.state::<AppState>();
                    if let Err(err) = play_clip_by_id(&app_handle, &state, &clip_id) {
                        warn!(error = %err, "index hotkey play failed");
                    }
                }
                HotkeyAction::StopAll => {
                    eprintln!("[buddio] STOP-ALL hotkey fired");
                    let state = app_handle.state::<AppState>();
                    let _ = state.audio.send(audio_engine::AudioCommand::StopAll);
                    let _ = app_handle.emit(
                        "playback-event",
                        crate::models::PlaybackEventPayload::Stopped {
                            clip_id: "*".into(),
                        },
                    );
                }
            }
        }));

        info!("hotkey OS manager ready");
        eprintln!("[buddio] hotkey OS manager ready");
        Ok(())
    }

    pub fn is_suspended(&self) -> bool {
        *self.suspended.lock()
    }

    /// Register all clip hotkeys + stop-all + index hotkeys from current library/settings.
    pub fn sync_from_library(&self, app: &AppHandle) -> Result<()> {
        let state = app.state::<AppState>();
        let clips = state.library.list_clips()?;
        let settings = state.settings.load()?;

        self.unregister_all(app)?;

        let mut bindings = HashMap::new();
        for clip in clips {
            if let Some(hotkey) = clip.hotkey {
                if !hotkey.is_empty() {
                    bindings.insert(clip.id, normalize_shortcut(&hotkey));
                }
            }
        }

        let stop_all = settings
            .stop_all_hotkey
            .as_ref()
            .filter(|s| !s.is_empty())
            .map(|s| normalize_shortcut(s));

        *self.bindings.lock() = bindings.clone();
        *self.stop_all.lock() = stop_all.clone();

        if self.is_suspended() {
            debug!("hotkey sync skipped (suspended)");
            return Ok(());
        }

        self.register_all_current(app, &bindings, stop_all.as_deref());

        let collection_id = self.index_collection_id.lock().clone();
        self.sync_index_hotkeys(app, collection_id)?;
        Ok(())
    }

    pub fn ensure_active(&self, app: &AppHandle) -> Result<()> {
        if self.is_suspended() {
            warn!("hotkeys were still suspended — forcing resume");
            *self.suspended.lock() = false;
        }
        self.sync_from_library(app)
    }

    /// Rebuild Ctrl+Alt+N / Alt+NumpadN → pad position bindings.
    ///
    /// `collection_id`: when `Some`, only clips in that collection (ordered by position);
    /// when `None`, all clips ordered by position.
    pub fn sync_index_hotkeys(
        &self,
        app: &AppHandle,
        collection_id: Option<String>,
    ) -> Result<()> {
        *self.index_collection_id.lock() = collection_id.clone();

        // Drop previous index-only accelerators (leave clip / stop-all bindings).
        let previous = std::mem::take(&mut *self.index_accelerators.lock());
        for key in previous {
            let _ = self.unregister_accelerator(app, &key);
        }
        *self.index_clip_ids.lock() = Vec::new();

        let state = app.state::<AppState>();
        let settings = state.settings.load()?;
        if !settings.index_hotkeys_enabled {
            return Ok(());
        }
        if self.is_suspended() {
            debug!("index hotkey sync deferred (suspended)");
            return Ok(());
        }

        let mut clips = state.library.list_clips()?;
        if let Some(ref cid) = collection_id {
            clips.retain(|c| c.collection_ids.iter().any(|id| id == cid));
        }
        clips.sort_by_key(|c| (c.position, c.created_at.clone()));

        let ids: Vec<String> = clips.into_iter().map(|c| c.id).collect();
        *self.index_clip_ids.lock() = ids.clone();

        let mut registered_index = Vec::new();
        for (index, _) in ids.iter().enumerate().take(10) {
            let n = if index == 9 { 0 } else { index + 1 };
            let chords = [
                normalize_shortcut(&format!("CommandOrControl+Alt+{n}")),
                normalize_shortcut(&format!("Alt+Numpad{n}")),
            ];
            for chord in chords {
                if self.registered.lock().contains_key(&chord) {
                    warn!(
                        hotkey = %chord,
                        index,
                        "index hotkey skipped — already registered"
                    );
                    continue;
                }
                match self.register_action(app, &chord, HotkeyAction::PlayIndex(index)) {
                    Ok(()) => registered_index.push(chord),
                    Err(err) => {
                        warn!(
                            error = %err,
                            hotkey = %chord,
                            index,
                            "failed to register index hotkey"
                        );
                    }
                }
            }
        }
        *self.index_accelerators.lock() = registered_index;
        Ok(())
    }

    pub fn set_clip_hotkey(
        &self,
        app: &AppHandle,
        clip_id: &str,
        hotkey: Option<String>,
    ) -> Result<()> {
        if let Some(old) = self.bindings.lock().get(clip_id).cloned() {
            let _ = self.unregister_accelerator(app, &old);
        }

        match hotkey {
            Some(key) if !key.is_empty() => {
                let key = normalize_shortcut(&key);

                if is_fragile_accelerator(&key) {
                    bail!(
                        "Atalhos sem Ctrl/Alt/Shift não funcionam bem no Windows (ex.: F12). Use Ctrl+Shift+1."
                    );
                }

                if let Some(stop) = self.stop_all.lock().clone() {
                    if stop == key {
                        bail!("hotkey '{key}' is reserved for stop-all");
                    }
                }
                for (other_id, other_key) in self.bindings.lock().iter() {
                    if other_id != clip_id && other_key == &key {
                        bail!("hotkey '{key}' is already assigned to another clip");
                    }
                }

                self.bindings
                    .lock()
                    .insert(clip_id.to_string(), key.clone());
                if !self.is_suspended() {
                    if is_mouse_accelerator(&key) {
                        emit_unsupported_mouse(app, Some(clip_id), &key);
                    } else {
                        self.register_clip(app, clip_id, &key)?;
                    }
                } else {
                    debug!(
                        clip_id = %clip_id,
                        hotkey = %key,
                        "clip hotkey saved (deferred while suspended)"
                    );
                }
            }
            _ => {
                self.bindings.lock().remove(clip_id);
            }
        }
        Ok(())
    }

    pub fn set_stop_all_hotkey(&self, app: &AppHandle, hotkey: Option<String>) -> Result<()> {
        if let Some(old) = self.stop_all.lock().clone() {
            let _ = self.unregister_accelerator(app, &old);
        }
        let normalized = hotkey
            .filter(|s| !s.is_empty())
            .map(|s| normalize_shortcut(&s));
        *self.stop_all.lock() = normalized.clone();
        if let Some(key) = normalized {
            if is_mouse_accelerator(&key) {
                emit_unsupported_mouse(app, None, &key);
                return Ok(());
            }
            if !self.is_suspended() {
                self.register_stop_all(app, &key)?;
            }
        }
        Ok(())
    }

    pub fn suspend(&self, app: &AppHandle) -> Result<()> {
        if self.is_suspended() {
            return Ok(());
        }
        self.unregister_all(app)?;
        *self.suspended.lock() = true;
        info!("hotkeys suspended for capture");
        Ok(())
    }

    pub fn resume(&self, app: &AppHandle) -> Result<()> {
        if !self.is_suspended() {
            return Ok(());
        }
        *self.suspended.lock() = false;
        self.sync_from_library(app)?;
        info!("hotkeys resumed");
        Ok(())
    }

    /// Currently used accelerators (clips + stop-all), normalized.
    pub fn used_accelerators(&self) -> Vec<String> {
        let mut used: Vec<String> = self.bindings.lock().values().cloned().collect();
        if let Some(stop) = self.stop_all.lock().clone() {
            used.push(stop);
        }
        used
    }

    /// Last collection filter for index hotkeys (`None` = all clips).
    pub fn index_collection_filter(&self) -> Option<String> {
        self.index_collection_id.lock().clone()
    }

    fn register_all_current(
        &self,
        app: &AppHandle,
        bindings: &HashMap<String, String>,
        stop_all: Option<&str>,
    ) {
        let state = app.state::<AppState>();
        for (clip_id, hotkey) in bindings {
            // Drop known-bad bare keys before even hitting the OS.
            if is_fragile_accelerator(hotkey) {
                eprintln!(
                    "[buddio] clearing fragile hotkey clip={clip_id} hotkey={hotkey} (needs Ctrl/Alt/Shift)"
                );
                let _ = state.library.set_hotkey(clip_id, None);
                self.bindings.lock().remove(clip_id);
                let _ = app.emit(
                    "hotkey-event",
                    serde_json::json!({
                        "type": "clearedFragile",
                        "clipId": clip_id,
                        "hotkey": hotkey,
                        "message": format!(
                            "Atalho '{hotkey}' foi removido: teclas sozinhas não registram no Windows. Capture Ctrl+Shift+1 (ou similar)."
                        ),
                    }),
                );
                continue;
            }

            if is_mouse_accelerator(hotkey) {
                emit_unsupported_mouse(app, Some(clip_id), hotkey);
                continue;
            }

            if let Err(err) = self.register_clip(app, clip_id, hotkey) {
                warn!(
                    error = %err,
                    clip_id = %clip_id,
                    hotkey = %hotkey,
                    "failed to register clip hotkey"
                );
                eprintln!("[buddio] FAILED register clip={clip_id} hotkey={hotkey}: {err:#}");
                // Persist clear so the UI doesn't keep showing a dead binding.
                let _ = state.library.set_hotkey(clip_id, None);
                self.bindings.lock().remove(clip_id);
                let _ = app.emit(
                    "hotkey-event",
                    serde_json::json!({
                        "type": "registerFailed",
                        "clipId": clip_id,
                        "hotkey": hotkey,
                        "message": format!(
                            "Atalho '{hotkey}' indisponível (outro app já usa). Foi limpo — capture outro com Ctrl/Alt/Shift."
                        ),
                    }),
                );
            }
        }
        if let Some(stop) = stop_all {
            if is_mouse_accelerator(stop) {
                emit_unsupported_mouse(app, None, stop);
            } else if let Err(err) = self.register_stop_all(app, stop) {
                warn!(error = %err, hotkey = %stop, "failed to register stop-all hotkey");
                eprintln!("[buddio] FAILED register stop-all={stop}: {err:#}");
                let _ = app.emit(
                    "hotkey-event",
                    serde_json::json!({
                        "type": "registerFailed",
                        "clipId": null,
                        "hotkey": stop,
                        "message": format!(
                            "Atalho de Parar tudo '{stop}' indisponível. Vá em Configurações e escolha outro (ex.: Ctrl+Shift+Backspace)."
                        ),
                    }),
                );
            }
        }
    }

    fn register_clip(&self, app: &AppHandle, clip_id: &str, hotkey: &str) -> Result<()> {
        self.register_action(app, hotkey, HotkeyAction::PlayClip(clip_id.to_string()))?;
        info!(clip_id = %clip_id, hotkey = %normalize_shortcut(hotkey), "registered clip hotkey");
        eprintln!(
            "[buddio] registered clip={clip_id} hotkey={}",
            normalize_shortcut(hotkey)
        );
        Ok(())
    }

    fn register_stop_all(&self, app: &AppHandle, hotkey: &str) -> Result<()> {
        self.register_action(app, hotkey, HotkeyAction::StopAll)?;
        info!(hotkey = %normalize_shortcut(hotkey), "registered stop-all hotkey");
        eprintln!(
            "[buddio] registered stop-all={} id=…",
            normalize_shortcut(hotkey)
        );
        Ok(())
    }

    fn register_action(&self, app: &AppHandle, hotkey: &str, action: HotkeyAction) -> Result<()> {
        let normalized = normalize_shortcut(hotkey);
        if is_mouse_accelerator(&normalized) {
            bail!("mouse accelerators are not supported by global-hotkey: '{normalized}'");
        }

        let parsed: HotKey = match normalized.parse() {
            Ok(hk) => hk,
            Err(err) => {
                warn!(
                    error = %err,
                    hotkey = %normalized,
                    "hotkey parse failed — skipping registration"
                );
                let _ = app.emit(
                    "hotkey-event",
                    serde_json::json!({
                        "type": "unsupported",
                        "clipId": null,
                        "hotkey": normalized,
                        "message": format!(
                            "Atalho '{normalized}' não é suportado pelo sistema e não foi registrado."
                        ),
                    }),
                );
                bail!("invalid shortcut '{hotkey}' (normalized: '{normalized}'): {err}");
            }
        };

        self.unregister_accelerator(app, &normalized).ok();

        let label = normalized.clone();
        self.with_os(app, move |os| {
            os.0.register(parsed).with_context(|| {
                format!(
                    "RegisterHotKey failed for '{label}' (already taken by another app, or OS rejected the key)"
                )
            })
        })?;

        self.actions.lock().insert(parsed.id(), action);
        self.registered.lock().insert(normalized, parsed);
        Ok(())
    }

    fn unregister_accelerator(&self, app: &AppHandle, hotkey: &str) -> Result<()> {
        let normalized = normalize_shortcut(hotkey);
        let Some(parsed) = self.registered.lock().remove(&normalized) else {
            // Still try parse+unregister in case maps are stale.
            if let Ok(hk) = normalized.parse::<HotKey>() {
                self.actions.lock().remove(&hk.id());
                let _ = self.with_os(app, move |os| {
                    let _ = os.0.unregister(hk);
                    Ok(())
                });
            }
            return Ok(());
        };
        self.actions.lock().remove(&parsed.id());
        self.with_os(app, move |os| match os.0.unregister(parsed) {
            Ok(()) => Ok(()),
            Err(err) => {
                debug!(error = %err, "unregister ignored");
                Ok(())
            }
        })
    }

    fn unregister_all(&self, app: &AppHandle) -> Result<()> {
        let keys: Vec<String> = self.registered.lock().keys().cloned().collect();
        for key in keys {
            let _ = self.unregister_accelerator(app, &key);
        }
        self.registered.lock().clear();
        self.actions.lock().clear();
        self.index_accelerators.lock().clear();
        self.index_clip_ids.lock().clear();
        Ok(())
    }

    /// Run `f` on the UI thread that owns the Win32 hotkey HWND.
    fn with_os<F, T>(&self, app: &AppHandle, f: F) -> Result<T>
    where
        F: FnOnce(&HotkeyOs) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        if std::thread::current().id() == *self.main_thread_id.lock() {
            let lock = self.os.lock();
            let os = lock
                .as_ref()
                .context("hotkey OS manager not initialized (init_os missing)")?;
            return f(os);
        }

        let os = self.os.clone();
        let (tx, rx) = mpsc::channel();
        app.run_on_main_thread(move || {
            let result = (|| {
                let lock = os.lock();
                let mgr = lock
                    .as_ref()
                    .context("hotkey OS manager not initialized (init_os missing)")?;
                f(mgr)
            })();
            let _ = tx.send(result);
        })
        .context("schedule hotkey work on main thread")?;

        rx.recv()
            .context("hotkey main-thread channel disconnected")?
    }
}

fn emit_unsupported_mouse(app: &AppHandle, clip_id: Option<&str>, hotkey: &str) {
    warn!(hotkey = %hotkey, "mouse hotkey stored but not registered (global-hotkey keyboard-only)");
    eprintln!(
        "[buddio] mouse hotkey '{hotkey}' stored but not registered (global-hotkey has no mouse support)"
    );
    let _ = app.emit(
        "hotkey-event",
        serde_json::json!({
            "type": "unsupported",
            "clipId": clip_id,
            "hotkey": hotkey,
            "message": format!(
                "Atalho '{hotkey}' usa botão do mouse — salvo, mas o SO não registra mouse via global-hotkey. Use teclado para atalho global."
            ),
        }),
    );
}

fn play_clip_by_id(app: &AppHandle, state: &AppState, clip_id: &str) -> Result<()> {
    let clip = state
        .library
        .get_clip(clip_id)?
        .with_context(|| format!("clip {clip_id} not found"))?;

    if clip.stop_others {
        let _ = state.audio.send(audio_engine::AudioCommand::StopAll);
    }

    let path = state.library.asset_path(&clip.file_hash, &clip.ext);

    let _ = state.audio.send(audio_engine::AudioCommand::LoadClip {
        clip_id: clip.id.clone(),
        path,
    });
    state
        .audio
        .send(crate::managers::library::play_command_for_clip(&clip))?;

    let _ = app.emit(
        "playback-event",
        crate::models::PlaybackEventPayload::Started { clip_id: clip.id },
    );
    Ok(())
}

/// Bare keys (no modifier) almost always fail or conflict on Windows (F12, Esc, …).
pub fn is_fragile_accelerator(hotkey: &str) -> bool {
    !normalize_shortcut(hotkey).contains('+')
}

/// Mouse buttons are not supported by `global-hotkey` (keyboard `Code` only).
pub fn is_mouse_accelerator(hotkey: &str) -> bool {
    normalize_shortcut(hotkey)
        .split('+')
        .any(|part| part.trim().to_ascii_lowercase().starts_with("mouse"))
}

/// Normalize UI / legacy chords to global-hotkey parseable form.
pub fn normalize_shortcut(raw: &str) -> String {
    raw.split('+')
        .map(|part| {
            let t = part.trim();
            match t.to_ascii_lowercase().as_str() {
                "control" | "ctrl" | "cmd" | "command" | "meta" | "super" => {
                    "CommandOrControl".to_string()
                }
                "option" => "Alt".to_string(),
                "escape" | "esc" => "Escape".to_string(),
                " " | "space" => "Space".to_string(),
                other => {
                    if other.len() == 1 {
                        other.to_ascii_uppercase()
                    } else if other.starts_with('f')
                        && other.len() <= 3
                        && other[1..].chars().all(|c| c.is_ascii_digit())
                    {
                        format!("F{}", &other[1..])
                    } else if let Some(rest) = other.strip_prefix("key") {
                        if rest.len() == 1 {
                            rest.to_ascii_uppercase()
                        } else {
                            t.to_string()
                        }
                    } else if let Some(rest) = other.strip_prefix("digit") {
                        rest.to_string()
                    } else if let Some(rest) = other.strip_prefix("mouse") {
                        // Mouse4 / Mouse5 / button3 → Mouse4
                        let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
                        if digits.is_empty() {
                            t.to_string()
                        } else {
                            format!("Mouse{digits}")
                        }
                    } else if other.starts_with("numpad") {
                        // Keep Numpad1 style for global-hotkey parse_key.
                        let rest = &other["numpad".len()..];
                        if rest.chars().all(|c| c.is_ascii_digit()) && !rest.is_empty() {
                            format!("Numpad{rest}")
                        } else {
                            // NumpadAdd, etc. — title-case first letter of each camel segment
                            format!(
                                "Numpad{}",
                                {
                                    let mut chars = rest.chars();
                                    match chars.next() {
                                        Some(c) => {
                                            format!("{}{}", c.to_ascii_uppercase(), chars.as_str())
                                        }
                                        None => String::new(),
                                    }
                                }
                            )
                        }
                    } else {
                        match other {
                            "alt" => "Alt".into(),
                            "shift" => "Shift".into(),
                            "up" | "arrowup" => "Up".into(),
                            "down" | "arrowdown" => "Down".into(),
                            "left" | "arrowleft" => "Left".into(),
                            "right" | "arrowright" => "Right".into(),
                            _ => t.to_string(),
                        }
                    }
                }
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

impl Default for HotkeyManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::{is_fragile_accelerator, is_mouse_accelerator, normalize_shortcut};

    #[test]
    fn normalizes_modifiers_and_keys() {
        assert_eq!(
            normalize_shortcut("Control+Shift+1"),
            "CommandOrControl+Shift+1"
        );
        assert_eq!(normalize_shortcut("ctrl+a"), "CommandOrControl+A");
        assert_eq!(normalize_shortcut("Esc"), "Escape");
        assert_eq!(normalize_shortcut("KeyQ"), "Q");
        assert_eq!(normalize_shortcut("Digit9"), "9");
        assert_eq!(normalize_shortcut("ArrowUp"), "Up");
        assert_eq!(normalize_shortcut("Ctrl+Mouse4"), "CommandOrControl+Mouse4");
        assert_eq!(normalize_shortcut("alt+numpad7"), "Alt+Numpad7");
    }

    #[test]
    fn detects_fragile_bare_keys() {
        assert!(is_fragile_accelerator("F12"));
        assert!(is_fragile_accelerator("Escape"));
        assert!(!is_fragile_accelerator("CommandOrControl+Shift+1"));
        assert!(!is_fragile_accelerator("Ctrl+F12"));
    }

    #[test]
    fn detects_mouse_accelerators() {
        assert!(is_mouse_accelerator("Ctrl+Mouse4"));
        assert!(is_mouse_accelerator("CommandOrControl+Mouse5"));
        assert!(!is_mouse_accelerator("CommandOrControl+Alt+1"));
    }
}
