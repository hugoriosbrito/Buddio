use std::io::{Cursor, Read};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use zip::ZipArchive;

pub const BACKUP_MANIFEST_PATH: &str = "manifest.json";
const BACKUP_FORMAT_VERSION: u32 = 1;
const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_EXTRACTED_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub version: u32,
    pub kind: String,
}

pub fn validate_backup_archive(bytes: &[u8]) -> Result<BackupManifest> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).context("open backup archive")?;
    if archive.len() > MAX_ARCHIVE_ENTRIES { bail!("backup contains too many files"); }
    let mut total = 0u64;
    let mut manifest = None;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).context("read backup entry")?;
        let name = entry.name();
        if name.starts_with('/') || name.contains("..") || name.contains('\\') { bail!("backup contains unsafe archive path"); }
        total = total.saturating_add(entry.size());
        if total > MAX_EXTRACTED_BYTES { bail!("backup exceeds extracted size limit"); }
        if name == BACKUP_MANIFEST_PATH {
            let mut json = String::new();
            entry.read_to_string(&mut json).context("read backup manifest")?;
            manifest = Some(serde_json::from_str(&json).context("parse backup manifest")?);
        }
    }
    let manifest: BackupManifest = manifest.context("backup manifest is missing")?;
    if manifest.kind != "buddio-backup" || manifest.version != BACKUP_FORMAT_VERSION { bail!("backup format is not supported"); }
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    use super::{validate_backup_archive, BACKUP_MANIFEST_PATH};

    fn archive(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, content) in entries {
            writer.start_file(*name, SimpleFileOptions::default()).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn accepts_versioned_buddio_backup() {
        let bytes = archive(&[(BACKUP_MANIFEST_PATH, r#"{"version":1,"kind":"buddio-backup"}"#)]);
        assert_eq!(validate_backup_archive(&bytes).unwrap().version, 1);
    }

    #[test]
    fn rejects_archive_path_traversal() {
        let bytes = archive(&[(BACKUP_MANIFEST_PATH, r#"{"version":1,"kind":"buddio-backup"}"#), ("../escape", "no")]);
        assert!(validate_backup_archive(&bytes).is_err());
    }
}
