//! Collections CRUD and clip membership.

use std::sync::Arc;

use anyhow::{bail, Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::models::{CollectionDto, CollectionUpdate};

pub struct CollectionsManager {
    conn: Arc<Mutex<Connection>>,
}

impl CollectionsManager {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    pub fn list(&self) -> Result<Vec<CollectionDto>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name, c.color, c.position,
                    (SELECT COUNT(*) FROM collection_clips cc WHERE cc.collection_id = c.id) AS clip_count
             FROM collections c
             ORDER BY c.position ASC, c.created_at ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CollectionDto {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                position: row.get(3)?,
                clip_count: row.get(4)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn create(&self, name: &str, color: Option<String>) -> Result<CollectionDto> {
        let name = name.trim();
        if name.is_empty() {
            bail!("name cannot be empty");
        }
        let color = color
            .as_deref()
            .map(str::trim)
            .filter(|c| !c.is_empty())
            .unwrap_or("#5B4DFF")
            .to_string();
        let id = Uuid::new_v4().to_string();

        {
            let conn = self.conn.lock();
            let position: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM collections",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            conn.execute(
                "INSERT INTO collections (id, name, color, position) VALUES (?1, ?2, ?3, ?4)",
                params![id, name, color, position],
            )?;
        }

        self.get(&id)?.context("collection missing after insert")
    }

    pub fn update(&self, id: &str, update: CollectionUpdate) -> Result<CollectionDto> {
        let conn = self.conn.lock();
        let exists: Option<String> = conn
            .query_row("SELECT id FROM collections WHERE id = ?1", [id], |r| {
                r.get(0)
            })
            .optional()?;
        if exists.is_none() {
            bail!("collection {id} not found");
        }

        if let Some(name) = &update.name {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                bail!("name cannot be empty");
            }
            conn.execute(
                "UPDATE collections SET name = ?1 WHERE id = ?2",
                params![trimmed, id],
            )?;
        }
        if let Some(color) = &update.color {
            let color = color.trim();
            if color.is_empty() {
                bail!("color cannot be empty");
            }
            conn.execute(
                "UPDATE collections SET color = ?1 WHERE id = ?2",
                params![color, id],
            )?;
        }
        if let Some(position) = update.position {
            conn.execute(
                "UPDATE collections SET position = ?1 WHERE id = ?2",
                params![position, id],
            )?;
        }

        drop(conn);
        self.get(id)?
            .with_context(|| format!("collection {id} not found"))
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        let n = conn.execute("DELETE FROM collections WHERE id = ?1", [id])?;
        if n == 0 {
            bail!("collection {id} not found");
        }
        Ok(())
    }

    /// Replace all collection memberships for a clip.
    pub fn set_clip_collections(&self, clip_id: &str, collection_ids: &[String]) -> Result<()> {
        let conn = self.conn.lock();
        let clip_exists: Option<String> = conn
            .query_row("SELECT id FROM clips WHERE id = ?1", [clip_id], |r| {
                r.get(0)
            })
            .optional()?;
        if clip_exists.is_none() {
            bail!("clip {clip_id} not found");
        }

        for collection_id in collection_ids {
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM collections WHERE id = ?1",
                    [collection_id],
                    |r| r.get(0),
                )
                .optional()?;
            if exists.is_none() {
                bail!("collection {collection_id} not found");
            }
        }

        conn.execute("DELETE FROM collection_clips WHERE clip_id = ?1", [clip_id])?;
        for collection_id in collection_ids {
            conn.execute(
                "INSERT INTO collection_clips (collection_id, clip_id) VALUES (?1, ?2)",
                params![collection_id, clip_id],
            )?;
        }
        Ok(())
    }

    fn get(&self, id: &str) -> Result<Option<CollectionDto>> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT c.id, c.name, c.color, c.position,
                    (SELECT COUNT(*) FROM collection_clips cc WHERE cc.collection_id = c.id) AS clip_count
             FROM collections c WHERE c.id = ?1",
            [id],
            |row| {
                Ok(CollectionDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    position: row.get(3)?,
                    clip_count: row.get(4)?,
                })
            },
        )
        .optional()
        .context("get collection")
    }
}
