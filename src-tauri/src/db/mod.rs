//! Buddio database schema and migrations.

use anyhow::{Context, Result};
use rusqlite::Connection;
use uuid::Uuid;

#[allow(dead_code)]
pub const SCHEMA_VERSION: i32 = 5;

const MIGRATION_V1: &str = r#"
CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    ext TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    volume REAL NOT NULL DEFAULT 1.0,
    loop_enabled INTEGER NOT NULL DEFAULT 0,
    hotkey TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_clips_file_hash ON clips(file_hash);
CREATE INDEX IF NOT EXISTS idx_clips_position ON clips(position);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
"#;

const MIGRATION_V2: &str = r#"
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#5B4DFF',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_clips (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, clip_id)
);

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    monitor_enabled INTEGER NOT NULL DEFAULT 1,
    monitor_device TEXT,
    secondary_device TEXT,
    master_volume REAL NOT NULL DEFAULT 1.0,
    collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE clips ADD COLUMN peaks TEXT;
ALTER TABLE clips ADD COLUMN trim_start_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN trim_end_ms INTEGER;
ALTER TABLE clips ADD COLUMN fade_in_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN fade_out_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN gain_db REAL NOT NULL DEFAULT 0.0;
ALTER TABLE clips ADD COLUMN restart_on_press INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clips ADD COLUMN stop_others INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clips ADD COLUMN emoji TEXT;
ALTER TABLE clips ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
"#;

const MIGRATION_V3: &str = r#"
ALTER TABLE clips ADD COLUMN integrated_lufs REAL;
ALTER TABLE clips ADD COLUMN norm_gain_db REAL NOT NULL DEFAULT 0.0;

ALTER TABLE profiles ADD COLUMN mic_route_mode TEXT NOT NULL DEFAULT 'mix';
ALTER TABLE profiles ADD COLUMN ducking_db REAL NOT NULL DEFAULT -8.0;

CREATE TABLE IF NOT EXISTS watched_folders (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

const MIGRATION_V4: &str = r#"
ALTER TABLE clips ADD COLUMN loudness_refined INTEGER NOT NULL DEFAULT 0;
"#;

/// One-shot rename of Portuguese seed labels to English canonical names.
/// (Display layer still localizes these for the active UI language.)
const MIGRATION_V5: &str = r#"
UPDATE collections SET name = 'Favorites' WHERE name = 'Favoritos';
UPDATE collections SET name = 'Calls' WHERE name = 'Chamadas';
UPDATE collections SET name = 'Games' WHERE name = 'Jogos';
UPDATE profiles SET name = 'Default' WHERE name = 'Padrão';
"#;

/// Open (or create) the SQLite database and apply pending migrations.
pub fn open_and_migrate(db_path: &std::path::Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create db dir {}", parent.display()))?;
    }

    let conn =
        Connection::open(db_path).with_context(|| format!("open sqlite {}", db_path.display()))?;

    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    let current: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current < 1 {
        conn.execute_batch(MIGRATION_V1)?;
        conn.execute("INSERT OR IGNORE INTO migrations (version) VALUES (1)", [])?;
    }

    if current < 2 {
        conn.execute_batch(MIGRATION_V2)?;
        seed_defaults(conn)?;
        conn.execute("INSERT OR IGNORE INTO migrations (version) VALUES (2)", [])?;
    }

    if current < 3 {
        conn.execute_batch(MIGRATION_V3)?;
        conn.execute("INSERT OR IGNORE INTO migrations (version) VALUES (3)", [])?;
    }

    if current < 4 {
        conn.execute_batch(MIGRATION_V4)?;
        conn.execute("INSERT OR IGNORE INTO migrations (version) VALUES (4)", [])?;
    }

    if current < 5 {
        conn.execute_batch(MIGRATION_V5)?;
        conn.execute("INSERT OR IGNORE INTO migrations (version) VALUES (5)", [])?;
    }

    Ok(())
}

fn seed_defaults(conn: &Connection) -> Result<()> {
    let collection_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM collections", [], |r| r.get(0))?;
    if collection_count == 0 {
        let defaults = [
            ("Favorites", "#f2c95c", 0),
            ("Calls", "#5b4dff", 1),
            ("Streaming", "#7bc7b1", 2),
            ("Games", "#d7a174", 3),
        ];
        for (name, color, position) in defaults {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO collections (id, name, color, position) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, name, color, position],
            )?;
        }
    }

    let profile_count: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
    if profile_count == 0 {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO profiles (id, name, monitor_enabled, master_volume, is_default)
             VALUES (?1, 'Default', 1, 1.0, 1)",
            [&id],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn migrates_fresh_db_to_v2() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.sqlite");
        let conn = open_and_migrate(&path).unwrap();
        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);

        let collections: i64 = conn
            .query_row("SELECT COUNT(*) FROM collections", [], |r| r.get(0))
            .unwrap();
        assert_eq!(collections, 4);

        let profiles: i64 = conn
            .query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(profiles, 1);
    }

    #[test]
    fn migrates_v1_to_v2() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("v1.sqlite");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATION_V1).unwrap();
            conn.execute("INSERT INTO migrations (version) VALUES (1)", [])
                .unwrap();
            conn.execute(
                "INSERT INTO clips (id, name, file_hash, ext, duration_ms, volume, loop_enabled, position)
                 VALUES ('c1', 'Beep', 'abc', 'wav', 100, 1.0, 0, 0)",
                [],
            )
            .unwrap();
        }

        let conn = open_and_migrate(&path).unwrap();
        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);

        let name: String = conn
            .query_row("SELECT name FROM clips WHERE id = 'c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, "Beep");

        let trim: i32 = conn
            .query_row("SELECT trim_start_ms FROM clips WHERE id = 'c1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(trim, 0);
    }
}
