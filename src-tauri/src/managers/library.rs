//! Library manager: import, list, update, delete clips. Metadata in SQLite; audio in assets/.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use tracing::{debug, info};

use crate::models::{ClipDto, ClipUpdate, ImportResult};

pub const SUPPORTED_EXTS: &[&str] = &["wav", "mp3", "flac", "ogg", "m4a", "aac", "opus"];
const PEAK_BUCKETS: usize = 64;

/// True when `path` has a supported audio extension (case-insensitive).
pub fn is_supported_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let ext = e.to_ascii_lowercase();
            SUPPORTED_EXTS.contains(&ext.as_str())
        })
        .unwrap_or(false)
}

/// Recursively collect supported audio files under `dir`.
pub fn collect_audio_files(dir: &Path) -> Result<Vec<PathBuf>> {
    if !dir.is_dir() {
        bail!("not a directory: {}", dir.display());
    }
    let mut paths = Vec::new();
    for entry in walkdir::WalkDir::new(dir).follow_links(false) {
        let entry = entry.with_context(|| format!("walk {}", dir.display()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.into_path();
        if is_supported_audio(&path) {
            paths.push(path);
        }
    }
    paths.sort();
    Ok(paths)
}

const CLIP_SELECT: &str = "SELECT id, name, file_hash, ext, duration_ms, volume, loop_enabled,
    hotkey, created_at, position, peaks, trim_start_ms, trim_end_ms, fade_in_ms, fade_out_ms,
    gain_db, restart_on_press, stop_others, emoji, pinned, integrated_lufs, norm_gain_db
    FROM clips";

pub struct LibraryManager {
    conn: Arc<Mutex<Connection>>,
    assets_dir: PathBuf,
}

impl LibraryManager {
    pub fn new(conn: Arc<Mutex<Connection>>, assets_dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&assets_dir)
            .with_context(|| format!("create assets dir {}", assets_dir.display()))?;
        Ok(Self { conn, assets_dir })
    }

    pub fn assets_dir(&self) -> &Path {
        &self.assets_dir
    }

    pub fn asset_path(&self, file_hash: &str, ext: &str) -> PathBuf {
        self.assets_dir.join(format!("{file_hash}.{ext}"))
    }

    pub fn list_clips(&self) -> Result<Vec<ClipDto>> {
        let conn = self.conn.lock();
        let mut clips = {
            let mut stmt =
                conn.prepare(&format!("{CLIP_SELECT} ORDER BY position ASC, created_at ASC"))?;
            let rows = stmt.query_map([], map_clip_row)?;
            let mut clips = Vec::new();
            for row in rows {
                clips.push(row?);
            }
            clips
        };
        let membership = load_all_collection_ids(&conn)?;
        for clip in &mut clips {
            clip.collection_ids = membership.get(&clip.id).cloned().unwrap_or_default();
        }
        Ok(clips)
    }

    pub fn get_clip(&self, id: &str) -> Result<Option<ClipDto>> {
        let conn = self.conn.lock();
        let mut clip = conn
            .query_row(
                &format!("{CLIP_SELECT} WHERE id = ?1"),
                [id],
                map_clip_row,
            )
            .optional()
            .context("get clip")?;
        if let Some(ref mut c) = clip {
            c.collection_ids = load_clip_collection_ids(&conn, id)?;
        }
        Ok(clip)
    }

    /// Get a clip for playback, refining its normalization gain from a quick
    /// head-loudness estimate the first time it's played (Soundpad-style).
    pub fn get_clip_for_playback(&self, id: &str) -> Result<Option<ClipDto>> {
        let already_refined: Option<bool> = {
            let conn = self.conn.lock();
            conn.query_row(
                "SELECT loudness_refined FROM clips WHERE id = ?1",
                [id],
                |r| r.get::<_, i64>(0).map(|v| v != 0),
            )
            .optional()?
        };
        match already_refined {
            None => Ok(None),
            Some(true) => self.get_clip(id),
            Some(false) => {
                self.refine_loudness(id)?;
                self.get_clip(id)
            }
        }
    }

    fn refine_loudness(&self, id: &str) -> Result<()> {
        let (file_hash, ext): (String, String) = {
            let conn = self.conn.lock();
            conn.query_row(
                "SELECT file_hash, ext FROM clips WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?
        };
        let path = self.asset_path(&file_hash, &ext);
        let target = self.voice_target_lufs();

        let (lufs, gain) = match audio_engine::decode_file(&path) {
            Ok(clip) => {
                let head = audio_engine::estimate_head_lufs(
                    &clip.pcm,
                    clip.channels,
                    clip.sample_rate,
                    6.0,
                );
                (Some(head), audio_engine::norm_gain_db(head, target))
            }
            Err(_) => (None, 0.0),
        };

        let conn = self.conn.lock();
        conn.execute(
            "UPDATE clips SET integrated_lufs = ?1, norm_gain_db = ?2, loudness_refined = 1 WHERE id = ?3",
            params![lufs, gain, id],
        )?;
        Ok(())
    }

    fn voice_target_lufs(&self) -> f32 {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'voice_target_lufs'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(audio_engine::DEFAULT_VOICE_TARGET_LUFS)
    }

    pub fn find_by_hotkey(&self, hotkey: &str) -> Result<Option<ClipDto>> {
        let conn = self.conn.lock();
        let mut clip = conn
            .query_row(
                &format!("{CLIP_SELECT} WHERE hotkey = ?1"),
                [hotkey],
                map_clip_row,
            )
            .optional()
            .context("find by hotkey")?;
        if let Some(ref mut c) = clip {
            c.collection_ids = load_clip_collection_ids(&conn, &c.id)?;
        }
        Ok(clip)
    }

    /// Import audio files: hash → copy to assets → insert metadata. Skips duplicates by hash.
    pub fn import_paths(&self, paths: &[PathBuf]) -> Result<ImportResult> {
        let mut imported = Vec::new();
        let mut duplicates = Vec::new();
        let mut errors = Vec::new();

        for path in paths {
            match self.import_one(path) {
                Ok(ImportOutcome::Imported(clip)) => imported.push(clip),
                Ok(ImportOutcome::Duplicate(name)) => duplicates.push(name),
                Err(err) => errors.push(format!("{}: {err:#}", path.display())),
            }
        }

        Ok(ImportResult {
            imported,
            duplicates,
            errors,
        })
    }

    fn import_one(&self, path: &Path) -> Result<ImportOutcome> {
        if !path.is_file() {
            bail!("not a file");
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();

        if !SUPPORTED_EXTS.contains(&ext.as_str()) {
            bail!("unsupported format '.{ext}'");
        }

        let hash = hash_file(path)?;
        {
            let conn = self.conn.lock();
            let existing: Option<String> = conn
                .query_row(
                    "SELECT name FROM clips WHERE file_hash = ?1 LIMIT 1",
                    [&hash],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(name) = existing {
                return Ok(ImportOutcome::Duplicate(name));
            }
        }

        let dest = self.asset_path(&hash, &ext);
        if !dest.exists() {
            fs::copy(path, &dest).with_context(|| format!("copy to {}", dest.display()))?;
        }

        let (duration_ms, peaks_json) = probe_duration_and_peaks(&dest);
        let target_lufs = self.voice_target_lufs();
        let (integrated_lufs, norm_gain_db) = analyze_loudness(&dest, target_lufs);
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let id = uuid::Uuid::new_v4().to_string();
        let position = {
            let conn = self.conn.lock();
            let next: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM clips",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            conn.execute(
                "INSERT INTO clips (
                    id, name, file_hash, ext, duration_ms, volume, loop_enabled, hotkey, position, peaks,
                    integrated_lufs, norm_gain_db
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 1.0, 0, NULL, ?6, ?7, ?8, ?9)",
                params![
                    id,
                    name,
                    hash,
                    ext,
                    duration_ms,
                    next,
                    peaks_json,
                    integrated_lufs,
                    norm_gain_db
                ],
            )?;
            next
        };

        info!(%id, %name, "imported clip");
        let clip = self.get_clip(&id)?.context("clip missing after insert")?;
        debug!(position, duration_ms, "clip metadata");
        Ok(ImportOutcome::Imported(clip))
    }

    pub fn update_clip(&self, id: &str, update: ClipUpdate) -> Result<ClipDto> {
        let conn = self.conn.lock();

        if let Some(name) = &update.name {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                bail!("name cannot be empty");
            }
            conn.execute(
                "UPDATE clips SET name = ?1 WHERE id = ?2",
                params![trimmed, id],
            )?;
        }
        if let Some(volume) = update.volume {
            let volume = volume.clamp(0.0, 1.0);
            conn.execute(
                "UPDATE clips SET volume = ?1 WHERE id = ?2",
                params![volume, id],
            )?;
        }
        if let Some(loop_enabled) = update.loop_enabled {
            conn.execute(
                "UPDATE clips SET loop_enabled = ?1 WHERE id = ?2",
                params![i64::from(loop_enabled), id],
            )?;
        }
        if let Some(position) = update.position {
            conn.execute(
                "UPDATE clips SET position = ?1 WHERE id = ?2",
                params![position, id],
            )?;
        }
        if let Some(trim_start_ms) = update.trim_start_ms {
            conn.execute(
                "UPDATE clips SET trim_start_ms = ?1 WHERE id = ?2",
                params![trim_start_ms.max(0), id],
            )?;
        }
        if let Some(trim_end_ms) = update.trim_end_ms {
            // Negative sentinel clears trim end (full duration).
            if trim_end_ms < 0 {
                conn.execute(
                    "UPDATE clips SET trim_end_ms = NULL WHERE id = ?1",
                    [id],
                )?;
            } else {
                conn.execute(
                    "UPDATE clips SET trim_end_ms = ?1 WHERE id = ?2",
                    params![trim_end_ms, id],
                )?;
            }
        }
        if let Some(fade_in_ms) = update.fade_in_ms {
            conn.execute(
                "UPDATE clips SET fade_in_ms = ?1 WHERE id = ?2",
                params![fade_in_ms.max(0), id],
            )?;
        }
        if let Some(fade_out_ms) = update.fade_out_ms {
            conn.execute(
                "UPDATE clips SET fade_out_ms = ?1 WHERE id = ?2",
                params![fade_out_ms.max(0), id],
            )?;
        }
        if let Some(gain_db) = update.gain_db {
            conn.execute(
                "UPDATE clips SET gain_db = ?1 WHERE id = ?2",
                params![gain_db, id],
            )?;
        }
        if let Some(restart_on_press) = update.restart_on_press {
            conn.execute(
                "UPDATE clips SET restart_on_press = ?1 WHERE id = ?2",
                params![i64::from(restart_on_press), id],
            )?;
        }
        if let Some(stop_others) = update.stop_others {
            conn.execute(
                "UPDATE clips SET stop_others = ?1 WHERE id = ?2",
                params![i64::from(stop_others), id],
            )?;
        }
        if let Some(emoji) = &update.emoji {
            let value = if emoji.trim().is_empty() {
                None
            } else {
                Some(emoji.as_str())
            };
            conn.execute(
                "UPDATE clips SET emoji = ?1 WHERE id = ?2",
                params![value, id],
            )?;
        }
        if let Some(pinned) = update.pinned {
            conn.execute(
                "UPDATE clips SET pinned = ?1 WHERE id = ?2",
                params![i64::from(pinned), id],
            )?;
        }

        drop(conn);
        self.get_clip(id)?
            .with_context(|| format!("clip {id} not found"))
    }

    pub fn set_hotkey(&self, id: &str, hotkey: Option<String>) -> Result<ClipDto> {
        if let Some(ref key) = hotkey {
            if let Some(owner) = self.find_by_hotkey(key)? {
                if owner.id != id {
                    bail!("hotkey '{key}' is already used by clip '{}'", owner.name);
                }
            }
        }
        {
            let conn = self.conn.lock();
            conn.execute(
                "UPDATE clips SET hotkey = ?1 WHERE id = ?2",
                params![hotkey, id],
            )?;
        }
        self.get_clip(id)?
            .with_context(|| format!("clip {id} not found"))
    }

    pub fn delete_clip(&self, id: &str) -> Result<()> {
        let clip = self
            .get_clip(id)?
            .with_context(|| format!("clip {id} not found"))?;

        {
            let conn = self.conn.lock();
            conn.execute("DELETE FROM clips WHERE id = ?1", [id])?;

            let refs: i64 = conn.query_row(
                "SELECT COUNT(*) FROM clips WHERE file_hash = ?1",
                [&clip.file_hash],
                |r| r.get(0),
            )?;

            if refs == 0 {
                let asset = self.asset_path(&clip.file_hash, &clip.ext);
                if asset.exists() {
                    let _ = fs::remove_file(&asset);
                }
            }
        }

        Ok(())
    }
}

enum ImportOutcome {
    Imported(ClipDto),
    Duplicate(String),
}

fn map_clip_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipDto> {
    let loop_int: i64 = row.get(6)?;
    let peaks_json: Option<String> = row.get(10)?;
    let restart_int: i64 = row.get(16)?;
    let stop_others_int: i64 = row.get(17)?;
    let pinned_int: i64 = row.get(19)?;
    Ok(ClipDto {
        id: row.get(0)?,
        name: row.get(1)?,
        file_hash: row.get(2)?,
        ext: row.get(3)?,
        duration_ms: row.get(4)?,
        volume: row.get(5)?,
        loop_enabled: loop_int != 0,
        hotkey: row.get(7)?,
        created_at: row.get(8)?,
        position: row.get(9)?,
        peaks: peaks_json.and_then(|j| serde_json::from_str(&j).ok()),
        trim_start_ms: row.get(11)?,
        trim_end_ms: row.get(12)?,
        fade_in_ms: row.get(13)?,
        fade_out_ms: row.get(14)?,
        gain_db: row.get(15)?,
        restart_on_press: restart_int != 0,
        stop_others: stop_others_int != 0,
        emoji: row.get(18)?,
        pinned: pinned_int != 0,
        collection_ids: Vec::new(),
        integrated_lufs: row.get(20)?,
        norm_gain_db: row.get::<_, Option<f32>>(21)?.unwrap_or(0.0),
    })
}

fn load_clip_collection_ids(conn: &Connection, clip_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT collection_id FROM collection_clips WHERE clip_id = ?1 ORDER BY collection_id",
    )?;
    let rows = stmt.query_map([clip_id], |r| r.get(0))?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row?);
    }
    Ok(ids)
}

fn load_all_collection_ids(conn: &Connection) -> Result<HashMap<String, Vec<String>>> {
    let mut stmt = conn.prepare(
        "SELECT clip_id, collection_id FROM collection_clips ORDER BY clip_id, collection_id",
    )?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (clip_id, collection_id) = row?;
        map.entry(clip_id).or_default().push(collection_id);
    }
    Ok(map)
}

pub fn hash_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Duration + waveform peaks via full decode (MVP).
fn probe_duration_and_peaks(path: &Path) -> (i32, Option<String>) {
    match audio_engine::decode_file(path) {
        Ok(clip) => {
            let duration_ms = (clip.duration_secs() * 1000.0).round() as i32;
            let peaks = audio_engine::compute_peaks(&clip.pcm, PEAK_BUCKETS);
            let peaks_json = serde_json::to_string(&peaks).ok();
            (duration_ms, peaks_json)
        }
        Err(_) => (0, None),
    }
}

fn analyze_loudness(path: &Path, target_lufs: f32) -> (Option<f32>, f32) {
    match audio_engine::decode_file(path) {
        Ok(clip) => {
            let (lufs, gain) = audio_engine::analyze_clip(&clip, target_lufs);
            (Some(lufs), gain)
        }
        Err(_) => (None, 0.0),
    }
}

/// Build an [`audio_engine::AudioCommand::Play`] from clip editor metadata.
pub fn play_command_for_clip(clip: &ClipDto) -> audio_engine::AudioCommand {
    play_command_for_clip_with_vad(clip, true)
}

pub fn play_command_for_clip_with_vad(
    clip: &ClipDto,
    play_vad_preamble: bool,
) -> audio_engine::AudioCommand {
    let gain_linear = audio_engine::combined_gain_linear(clip.norm_gain_db, clip.gain_db);
    audio_engine::AudioCommand::Play {
        clip_id: clip.id.clone(),
        volume: clip.volume,
        loop_enabled: clip.loop_enabled,
        trim_start_secs: Some(clip.trim_start_ms as f32 / 1000.0),
        trim_end_secs: clip.trim_end_ms.map(|ms| ms as f32 / 1000.0),
        fade_in_secs: Some(clip.fade_in_ms as f32 / 1000.0),
        fade_out_secs: Some(clip.fade_out_ms as f32 / 1000.0),
        gain_linear: Some(gain_linear),
        play_vad_preamble,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_and_migrate;
    use std::io::Write;
    use tempfile::tempdir;

    fn write_minimal_wav(path: &Path) {
        // Mono 16-bit PCM WAV @ 8 kHz, 16 samples of silence
        let samples: [i16; 16] = [0; 16];
        let data_len = (samples.len() * 2) as u32;
        let mut data = Vec::with_capacity(44 + data_len as usize);
        data.extend_from_slice(b"RIFF");
        data.extend_from_slice(&(36 + data_len).to_le_bytes());
        data.extend_from_slice(b"WAVE");
        data.extend_from_slice(b"fmt ");
        data.extend_from_slice(&16u32.to_le_bytes());
        data.extend_from_slice(&1u16.to_le_bytes()); // PCM
        data.extend_from_slice(&1u16.to_le_bytes()); // mono
        data.extend_from_slice(&8000u32.to_le_bytes());
        data.extend_from_slice(&(16000u32).to_le_bytes());
        data.extend_from_slice(&2u16.to_le_bytes());
        data.extend_from_slice(&16u16.to_le_bytes());
        data.extend_from_slice(b"data");
        data.extend_from_slice(&data_len.to_le_bytes());
        for s in samples {
            data.extend_from_slice(&s.to_le_bytes());
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(&data).unwrap();
    }

    #[test]
    fn hash_and_duplicate_detection() {
        let dir = tempdir().unwrap();
        let db = open_and_migrate(&dir.path().join("db.sqlite")).unwrap();
        let lib = LibraryManager::new(Arc::new(Mutex::new(db)), dir.path().join("assets")).unwrap();

        let wav = dir.path().join("beep.wav");
        write_minimal_wav(&wav);

        let first = lib.import_paths(&[wav.clone()]).unwrap();
        assert_eq!(first.imported.len(), 1);
        assert!(first.duplicates.is_empty());
        assert!(first.imported[0].peaks.is_some());

        let second = lib.import_paths(&[wav]).unwrap();
        assert!(second.imported.is_empty());
        assert_eq!(second.duplicates.len(), 1);
    }

    #[test]
    fn refines_loudness_on_first_playback() {
        let dir = tempdir().unwrap();
        let db = open_and_migrate(&dir.path().join("db.sqlite")).unwrap();
        let conn = Arc::new(Mutex::new(db));
        let lib = LibraryManager::new(conn.clone(), dir.path().join("assets")).unwrap();

        let wav = dir.path().join("beep.wav");
        write_minimal_wav(&wav);
        let imported = lib.import_paths(&[wav]).unwrap();
        let clip_id = imported.imported[0].id.clone();

        let refined_once = lib.get_clip_for_playback(&clip_id).unwrap().unwrap();
        let refined_flag: i64 = conn
            .lock()
            .query_row(
                "SELECT loudness_refined FROM clips WHERE id = ?1",
                [&clip_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(refined_flag, 1);

        // Second call reads the persisted value instead of recomputing.
        let refined_twice = lib.get_clip_for_playback(&clip_id).unwrap().unwrap();
        assert_eq!(refined_once.norm_gain_db, refined_twice.norm_gain_db);
    }

    #[test]
    fn hash_file_stable() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("a.wav");
        write_minimal_wav(&path);
        let a = hash_file(&path).unwrap();
        let b = hash_file(&path).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
    }
}
