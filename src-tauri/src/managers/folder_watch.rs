//! Watches folders for new audio files and imports them into the library.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Emitter, Manager};
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::managers::collections::CollectionsManager;
use crate::managers::library::{self, LibraryManager};
use crate::models::{ImportResult, WatchedFolderDto};
use crate::AppState;

const DEBOUNCE: Duration = Duration::from_millis(500);
/// Defensive fallback only — the worker normally wakes immediately on
/// `WorkerMsg::Resync` or a filesystem event, never by hitting this timeout.
const IDLE_FALLBACK: Duration = Duration::from_secs(3600);

/// Fs events and resync requests share one channel so the worker thread never
/// blocks on filesystem activity while a resync (add/remove/pause folder) waits.
enum WorkerMsg {
    Fs(notify::Result<notify::Event>),
    Resync,
}

/// Persists watched folders and runs a background `notify` watcher with 500ms debounce.
pub struct FolderWatchManager {
    conn: Arc<Mutex<Connection>>,
    library: Arc<LibraryManager>,
    collections: Arc<CollectionsManager>,
    cmd_tx: Mutex<Option<mpsc::Sender<WorkerMsg>>>,
}

impl FolderWatchManager {
    pub fn new(
        conn: Arc<Mutex<Connection>>,
        library: Arc<LibraryManager>,
        collections: Arc<CollectionsManager>,
    ) -> Self {
        Self {
            conn,
            library,
            collections,
            cmd_tx: Mutex::new(None),
        }
    }

    pub fn list(&self) -> Result<Vec<WatchedFolderDto>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, path, collection_id, enabled FROM watched_folders
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(WatchedFolderDto {
                id: row.get(0)?,
                path: row.get(1)?,
                collection_id: row.get(2)?,
                enabled: row.get::<_, i64>(3)? != 0,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    fn list_enabled_roots(&self) -> Result<Vec<(PathBuf, Option<String>)>> {
        Ok(self
            .list()?
            .into_iter()
            .filter(|f| f.enabled)
            .map(|f| (PathBuf::from(f.path), f.collection_id))
            .collect())
    }

    pub fn add(
        &self,
        path: &Path,
        collection_id: Option<String>,
    ) -> Result<(WatchedFolderDto, ImportResult)> {
        if !path.is_dir() {
            bail!("not a directory: {}", path.display());
        }
        let path_str = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .to_string();

        if let Some(ref cid) = collection_id {
            let conn = self.conn.lock();
            let exists: Option<String> = conn
                .query_row("SELECT id FROM collections WHERE id = ?1", [cid], |r| {
                    r.get(0)
                })
                .optional()?;
            if exists.is_none() {
                bail!("collection {cid} not found");
            }
        }

        let id = Uuid::new_v4().to_string();
        {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT INTO watched_folders (id, path, collection_id, enabled)
                 VALUES (?1, ?2, ?3, 1)",
                params![id, path_str, collection_id],
            )
            .with_context(|| format!("insert watched folder {path_str}"))?;
        }

        let folder = self
            .get(&id)?
            .context("watched folder missing after insert")?;

        // Initial scan of existing files, then start/resync watcher.
        let import =
            self.import_under(&PathBuf::from(&folder.path), folder.collection_id.clone())?;
        self.request_resync();
        info!(path = %folder.path, "watched folder added");
        Ok((folder, import))
    }

    pub fn remove(&self, id: &str) -> Result<()> {
        let n = {
            let conn = self.conn.lock();
            conn.execute("DELETE FROM watched_folders WHERE id = ?1", [id])?
        };
        if n == 0 {
            bail!("watched folder {id} not found");
        }
        self.request_resync();
        Ok(())
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<WatchedFolderDto> {
        {
            let conn = self.conn.lock();
            let n = conn.execute(
                "UPDATE watched_folders SET enabled = ?1 WHERE id = ?2",
                params![if enabled { 1 } else { 0 }, id],
            )?;
            if n == 0 {
                bail!("watched folder {id} not found");
            }
        }
        let folder = self
            .get(id)?
            .with_context(|| format!("watched folder {id} not found"))?;
        self.request_resync();
        Ok(folder)
    }

    fn get(&self, id: &str) -> Result<Option<WatchedFolderDto>> {
        let conn = self.conn.lock();
        conn.query_row(
            "SELECT id, path, collection_id, enabled FROM watched_folders WHERE id = ?1",
            [id],
            |row| {
                Ok(WatchedFolderDto {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    collection_id: row.get(2)?,
                    enabled: row.get::<_, i64>(3)? != 0,
                })
            },
        )
        .optional()
        .context("get watched folder")
    }

    fn request_resync(&self) {
        if let Some(tx) = self.cmd_tx.lock().as_ref() {
            let _ = tx.send(WorkerMsg::Resync);
        }
    }

    /// Spawn the notify + debounce worker. Safe to call once at app setup.
    pub fn start(&self, app: AppHandle) -> Result<()> {
        if self.cmd_tx.lock().is_some() {
            return Ok(());
        }

        let (tx, rx) = mpsc::channel::<WorkerMsg>();
        let event_tx = tx.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res| {
                let _ = event_tx.send(WorkerMsg::Fs(res));
            },
            notify::Config::default(),
        )
        .context("create folder watcher")?;

        let mut roots = self.list_enabled_roots()?;
        let mut watching: HashSet<PathBuf> = HashSet::new();
        apply_watches(&mut watcher, &roots, &mut watching);

        *self.cmd_tx.lock() = Some(tx);

        let library = self.library.clone();
        let collections = self.collections.clone();
        let manager_conn = self.conn.clone();

        thread::Builder::new()
            .name("buddio-folder-watch".into())
            .spawn(move || {
                let mut pending: HashSet<PathBuf> = HashSet::new();
                let mut watcher = Some(watcher);
                let mut watching = watching;

                loop {
                    let timeout = if pending.is_empty() {
                        IDLE_FALLBACK
                    } else {
                        DEBOUNCE
                    };

                    match rx.recv_timeout(timeout) {
                        Ok(WorkerMsg::Fs(Ok(event))) => {
                            if matches!(
                                event.kind,
                                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Any
                            ) {
                                for path in event.paths {
                                    if library::is_supported_audio(&path) && path.is_file() {
                                        pending.insert(path);
                                    }
                                }
                            }
                        }
                        Ok(WorkerMsg::Fs(Err(err))) => {
                            warn!(error = %err, "folder watch notify error");
                        }
                        Ok(WorkerMsg::Resync) => {
                            let next = {
                                let conn = manager_conn.lock();
                                load_enabled_roots_locked(&conn)
                            };
                            match next {
                                Ok(next_roots) => {
                                    if let Some(w) = watcher.as_mut() {
                                        apply_watches(w, &next_roots, &mut watching);
                                    }
                                    roots = next_roots;
                                    debug!(count = roots.len(), "folder watches resynced");
                                }
                                Err(err) => {
                                    warn!(error = %err, "failed to resync watched folders");
                                }
                            }
                        }
                        Err(RecvTimeoutError::Timeout) => {
                            if !pending.is_empty() {
                                let paths: Vec<PathBuf> = pending.drain().collect();
                                flush_pending(&app, &library, &collections, &roots, &paths);
                            }
                        }
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
            })?;

        info!("folder watch manager started");
        Ok(())
    }

    /// Import audio under a path and assign collection / load into the audio engine when `app` is set.
    pub fn import_under(&self, dir: &Path, collection_id: Option<String>) -> Result<ImportResult> {
        let paths = library::collect_audio_files(dir)?;
        let result = self.library.import_paths(&paths)?;
        if let Some(ref cid) = collection_id {
            for clip in &result.imported {
                let _ = self
                    .collections
                    .set_clip_collections(&clip.id, std::slice::from_ref(cid));
            }
        }
        Ok(result)
    }
}

fn load_enabled_roots_locked(conn: &Connection) -> Result<Vec<(PathBuf, Option<String>)>> {
    let mut stmt =
        conn.prepare("SELECT path, collection_id FROM watched_folders WHERE enabled = 1")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            PathBuf::from(row.get::<_, String>(0)?),
            row.get::<_, Option<String>>(1)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn apply_watches(
    watcher: &mut RecommendedWatcher,
    roots: &[(PathBuf, Option<String>)],
    watching: &mut HashSet<PathBuf>,
) {
    let next: HashSet<PathBuf> = roots
        .iter()
        .filter(|(p, _)| p.is_dir())
        .map(|(p, _)| p.clone())
        .collect();

    for old in watching.difference(&next) {
        if let Err(err) = watcher.unwatch(old) {
            debug!(path = %old.display(), error = %err, "unwatch folder");
        }
    }
    for path in next.difference(watching) {
        if let Err(err) = watcher.watch(path, RecursiveMode::Recursive) {
            warn!(path = %path.display(), error = %err, "failed to watch folder");
        }
    }
    *watching = next;
}

fn collection_for_path(roots: &[(PathBuf, Option<String>)], path: &Path) -> Option<String> {
    let mut best: Option<(usize, Option<String>)> = None;
    for (root, cid) in roots {
        if path.starts_with(root) {
            let len = root.components().count();
            if best.as_ref().map(|(l, _)| len >= *l).unwrap_or(true) {
                best = Some((len, cid.clone()));
            }
        }
    }
    best.and_then(|(_, cid)| cid)
}

fn flush_pending(
    app: &AppHandle,
    library: &LibraryManager,
    collections: &CollectionsManager,
    roots: &[(PathBuf, Option<String>)],
    paths: &[PathBuf],
) {
    if paths.is_empty() {
        return;
    }

    let mut imported_total = 0usize;
    let mut duplicates_total = 0usize;
    let mut errors_total = 0usize;

    for path in paths {
        let result = match library.import_paths(std::slice::from_ref(path)) {
            Ok(r) => r,
            Err(err) => {
                warn!(path = %path.display(), error = %err, "folder watch import failed");
                errors_total += 1;
                continue;
            }
        };
        duplicates_total += result.duplicates.len();
        errors_total += result.errors.len();

        for clip in &result.imported {
            imported_total += 1;
            if let Some(cid) = collection_for_path(roots, path) {
                let _ = collections.set_clip_collections(&clip.id, &[cid]);
            }
            if let Some(state) = app.try_state::<AppState>() {
                let asset = library.asset_path(&clip.file_hash, &clip.ext);
                let _ = state.audio.send(audio_engine::AudioCommand::LoadClip {
                    clip_id: clip.id.clone(),
                    path: asset,
                });
            }
        }
    }

    if imported_total > 0 {
        info!(count = imported_total, "folder watch imported clips");
        let _ = app.emit(
            "library-updated",
            serde_json::json!({
                "imported": imported_total,
                "duplicates": duplicates_total,
                "errors": errors_total,
            }),
        );
    }
}
