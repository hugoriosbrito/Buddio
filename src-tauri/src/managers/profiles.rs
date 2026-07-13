//! Audio output profiles (device + volume presets).

use std::sync::Arc;

use anyhow::{bail, Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::models::{MicRouteModeDto, ProfileDto, ProfileUpdate};

pub struct ProfilesManager {
    conn: Arc<Mutex<Connection>>,
}

impl ProfilesManager {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    pub fn list(&self) -> Result<Vec<ProfileDto>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, monitor_enabled, monitor_device, secondary_device,
                    master_volume, collection_id, is_default, mic_route_mode, ducking_db
             FROM profiles
             ORDER BY is_default DESC, created_at ASC",
        )?;
        let rows = stmt.query_map([], map_profile_row)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn get(&self, id: &str) -> Result<Option<ProfileDto>> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT id, name, monitor_enabled, monitor_device, secondary_device,
                    master_volume, collection_id, is_default, mic_route_mode, ducking_db
             FROM profiles WHERE id = ?1",
            [id],
            map_profile_row,
        )
        .optional()
        .context("get profile")
    }

    pub fn create(&self, name: &str) -> Result<ProfileDto> {
        let name = name.trim();
        if name.is_empty() {
            bail!("name cannot be empty");
        }
        let id = Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT INTO profiles (id, name, monitor_enabled, master_volume, is_default, mic_route_mode, ducking_db)
                 VALUES (?1, ?2, 1, 1.0, 0, 'mix', -8.0)",
                params![id, name],
            )?;
        }
        self.get(&id)?.context("profile missing after insert")
    }

    pub fn update(&self, id: &str, update: ProfileUpdate) -> Result<ProfileDto> {
        {
            let conn = self.conn.lock();
            let exists: Option<String> = conn
                .query_row("SELECT id FROM profiles WHERE id = ?1", [id], |r| r.get(0))
                .optional()?;
            if exists.is_none() {
                bail!("profile {id} not found");
            }

            if let Some(name) = &update.name {
                let trimmed = name.trim();
                if trimmed.is_empty() {
                    bail!("name cannot be empty");
                }
                conn.execute(
                    "UPDATE profiles SET name = ?1 WHERE id = ?2",
                    params![trimmed, id],
                )?;
            }
            if let Some(monitor_enabled) = update.monitor_enabled {
                conn.execute(
                    "UPDATE profiles SET monitor_enabled = ?1 WHERE id = ?2",
                    params![i64::from(monitor_enabled), id],
                )?;
            }
            if let Some(monitor_device) = &update.monitor_device {
                let value = empty_to_none(monitor_device);
                conn.execute(
                    "UPDATE profiles SET monitor_device = ?1 WHERE id = ?2",
                    params![value, id],
                )?;
            }
            if let Some(secondary_device) = &update.secondary_device {
                let value = empty_to_none(secondary_device);
                conn.execute(
                    "UPDATE profiles SET secondary_device = ?1 WHERE id = ?2",
                    params![value, id],
                )?;
            }
            if let Some(master_volume) = update.master_volume {
                let volume = master_volume.clamp(0.0, 1.0);
                conn.execute(
                    "UPDATE profiles SET master_volume = ?1 WHERE id = ?2",
                    params![volume, id],
                )?;
            }
            if let Some(collection_id) = &update.collection_id {
                let value = empty_to_none(collection_id);
                conn.execute(
                    "UPDATE profiles SET collection_id = ?1 WHERE id = ?2",
                    params![value, id],
                )?;
            }
            if let Some(mode) = update.mic_route_mode {
                conn.execute(
                    "UPDATE profiles SET mic_route_mode = ?1 WHERE id = ?2",
                    params![mode.as_str(), id],
                )?;
            }
            if let Some(ducking_db) = update.ducking_db {
                conn.execute(
                    "UPDATE profiles SET ducking_db = ?1 WHERE id = ?2",
                    params![ducking_db.clamp(-24.0, 0.0), id],
                )?;
            }
            if let Some(true) = update.is_default {
                conn.execute("UPDATE profiles SET is_default = 0", [])?;
                conn.execute(
                    "UPDATE profiles SET is_default = 1 WHERE id = ?1",
                    [id],
                )?;
            }
        }

        self.get(id)?
            .with_context(|| format!("profile {id} not found"))
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        let profile = conn
            .query_row(
                "SELECT is_default FROM profiles WHERE id = ?1",
                [id],
                |r| r.get::<_, i64>(0),
            )
            .optional()?;
        let Some(is_default) = profile else {
            bail!("profile {id} not found");
        };

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
        if count <= 1 {
            bail!("cannot delete the last profile");
        }

        conn.execute("DELETE FROM profiles WHERE id = ?1", [id])?;

        if is_default != 0 {
            // Promote the oldest remaining profile to default.
            conn.execute(
                "UPDATE profiles SET is_default = 1
                 WHERE id = (SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1)",
                [],
            )?;
        }
        Ok(())
    }
}

fn empty_to_none(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn map_profile_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProfileDto> {
    let monitor_enabled: i64 = row.get(2)?;
    let is_default: i64 = row.get(7)?;
    let mode_raw: String = row.get(8).unwrap_or_else(|_| "mix".into());
    Ok(ProfileDto {
        id: row.get(0)?,
        name: row.get(1)?,
        monitor_enabled: monitor_enabled != 0,
        monitor_device: row.get(3)?,
        secondary_device: row.get(4)?,
        master_volume: row.get(5)?,
        collection_id: row.get(6)?,
        is_default: is_default != 0,
        mic_route_mode: MicRouteModeDto::parse(&mode_raw),
        ducking_db: row.get::<_, Option<f32>>(9)?.unwrap_or(-8.0),
    })
}
