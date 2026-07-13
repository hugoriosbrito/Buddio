//! Settings persistence (key/value in SQLite).

use std::sync::Arc;

use anyhow::{bail, Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::AppSettings;

const KEY_MASTER_VOLUME: &str = "master_volume";
const KEY_MONITOR_ENABLED: &str = "monitor_enabled";
const KEY_MONITOR: &str = "monitor_device";
const KEY_SECONDARY: &str = "secondary_device";
const KEY_STOP_ALL: &str = "stop_all_hotkey";
const KEY_THEME: &str = "theme";
const KEY_ACTIVE_PROFILE: &str = "active_profile_id";
const KEY_ONBOARDING_DONE: &str = "onboarding_done";
const KEY_MIC_MIX: &str = "mic_mix_enabled";
const KEY_PINNED_CLIPS: &str = "pinned_clip_ids";
const KEY_PENDING_VIRTUAL_SETUP: &str = "pending_virtual_setup";

pub struct SettingsManager {
    conn: Arc<Mutex<Connection>>,
}

/// Shortcuts that Windows (or our old defaults) already claim / reject.
fn is_bad_stop_all_hotkey(raw: &str) -> bool {
    let n = raw.trim().to_ascii_lowercase().replace(' ', "");
    matches!(
        n.as_str(),
        "escape"
            | "esc"
            | "commandorcontrol+shift+escape"
            | "control+shift+escape"
            | "ctrl+shift+escape"
            | "cmd+shift+escape"
            | "command+shift+escape"
    )
}

impl SettingsManager {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    pub fn load(&self) -> Result<AppSettings> {
        Ok(AppSettings {
            master_volume: self
                .get(KEY_MASTER_VOLUME)?
                .and_then(|v| v.parse().ok())
                .unwrap_or(1.0),
            monitor_enabled: self
                .get(KEY_MONITOR_ENABLED)?
                .map(|v| v != "0" && v != "false")
                .unwrap_or(true),
            monitor_device: self.get(KEY_MONITOR)?,
            secondary_device: self.get(KEY_SECONDARY)?,
            stop_all_hotkey: {
                // Ctrl+Shift+Escape = Windows Task Manager — never use as default.
                let safe_default = "CommandOrControl+Shift+Backspace";
                match self.get(KEY_STOP_ALL)?.as_deref() {
                    None => {
                        let _ = self.set(KEY_STOP_ALL, safe_default);
                        Some(safe_default.into())
                    }
                    Some(raw) if is_bad_stop_all_hotkey(raw) => {
                        let _ = self.set(KEY_STOP_ALL, safe_default);
                        Some(safe_default.into())
                    }
                    Some(other) => Some(other.to_string()),
                }
            },
            theme: self
                .get(KEY_THEME)?
                .filter(|t| t == "light" || t == "dark")
                .unwrap_or_else(|| "light".into()),
            active_profile_id: self.get(KEY_ACTIVE_PROFILE)?,
            onboarding_done: self
                .get(KEY_ONBOARDING_DONE)?
                .map(|v| v != "0" && v != "false")
                .unwrap_or(false),
            mic_mix_enabled: self
                .get(KEY_MIC_MIX)?
                .map(|v| v != "0" && v != "false")
                .unwrap_or(false),
            pinned_clip_ids: self
                .get(KEY_PINNED_CLIPS)?
                .and_then(|v| serde_json::from_str(&v).ok())
                .unwrap_or_default(),
        })
    }

    pub fn save(&self, settings: &AppSettings) -> Result<()> {
        self.set(KEY_MASTER_VOLUME, &settings.master_volume.to_string())?;
        self.set(
            KEY_MONITOR_ENABLED,
            if settings.monitor_enabled { "1" } else { "0" },
        )?;
        match &settings.monitor_device {
            Some(v) => self.set(KEY_MONITOR, v)?,
            None => self.delete(KEY_MONITOR)?,
        }
        match &settings.secondary_device {
            Some(v) => self.set(KEY_SECONDARY, v)?,
            None => self.delete(KEY_SECONDARY)?,
        }
        match &settings.stop_all_hotkey {
            Some(v) => self.set(KEY_STOP_ALL, v)?,
            None => self.delete(KEY_STOP_ALL)?,
        }
        self.set(KEY_THEME, &settings.theme)?;
        match &settings.active_profile_id {
            Some(v) => self.set(KEY_ACTIVE_PROFILE, v)?,
            None => self.delete(KEY_ACTIVE_PROFILE)?,
        }
        self.set(
            KEY_ONBOARDING_DONE,
            if settings.onboarding_done { "1" } else { "0" },
        )?;
        self.set(
            KEY_MIC_MIX,
            if settings.mic_mix_enabled { "1" } else { "0" },
        )?;
        self.set(
            KEY_PINNED_CLIPS,
            &serde_json::to_string(&settings.pinned_clip_ids)?,
        )?;
        Ok(())
    }

    pub fn set_theme(&self, theme: &str) -> Result<()> {
        if theme != "light" && theme != "dark" {
            bail!("theme must be 'light' or 'dark'");
        }
        self.set(KEY_THEME, theme)
    }

    pub fn set_active_profile_id(&self, id: Option<&str>) -> Result<()> {
        match id {
            Some(id) => self.set(KEY_ACTIVE_PROFILE, id),
            None => self.delete(KEY_ACTIVE_PROFILE),
        }
    }

    pub fn set_onboarding_done(&self, done: bool) -> Result<()> {
        self.set(KEY_ONBOARDING_DONE, if done { "1" } else { "0" })
    }

    pub fn set_mic_mix_enabled(&self, enabled: bool) -> Result<()> {
        self.set(KEY_MIC_MIX, if enabled { "1" } else { "0" })
    }

    pub fn set_pinned_clip_ids(&self, ids: &[String]) -> Result<()> {
        self.set(KEY_PINNED_CLIPS, &serde_json::to_string(ids)?)
    }

    pub fn pending_virtual_setup(&self) -> Result<bool> {
        Ok(self
            .get(KEY_PENDING_VIRTUAL_SETUP)?
            .map(|v| v != "0" && v != "false")
            .unwrap_or(false))
    }

    pub fn set_pending_virtual_setup(&self, pending: bool) -> Result<()> {
        if pending {
            self.set(KEY_PENDING_VIRTUAL_SETUP, "1")
        } else {
            self.delete(KEY_PENDING_VIRTUAL_SETUP)
        }
    }

    fn get(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock();
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()
        .with_context(|| format!("get setting {key}"))
    }

    fn set(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    fn delete(&self, key: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM settings WHERE key = ?1", [key])?;
        Ok(())
    }
}
