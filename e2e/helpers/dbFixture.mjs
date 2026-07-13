import fs from "node:fs";
import path from "node:path";

const APP_DATA_DIR = path.join(process.env.APPDATA, "com.buddio.app");
const DB_PATH = path.join(APP_DATA_DIR, "database.sqlite");
const BACKUP_DIR = path.resolve("e2e/.db-backup");
const BACKUP_PATH = path.join(BACKUP_DIR, "database.sqlite.bak");

/** Backs up the real user database (if any) before the suite mutates it. */
export function backupRealDb() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, BACKUP_PATH);
  } else if (fs.existsSync(BACKUP_PATH)) {
    fs.rmSync(BACKUP_PATH);
  }
}

/** Restores the real user database after the suite finishes. */
export function restoreRealDb() {
  if (fs.existsSync(BACKUP_PATH)) {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
    fs.copyFileSync(BACKUP_PATH, DB_PATH);
  } else if (fs.existsSync(DB_PATH)) {
    fs.rmSync(DB_PATH);
  }
}

/**
 * Deletes the sqlite file so the next app launch recreates it from scratch
 * (fresh settings, onboarding_done=false). Must run while the app is closed.
 * Retries briefly: the previous session's app process can take a moment to
 * fully release its file lock after the WebDriver session ends.
 */
export async function resetOnboarding(retries = 10, delayMs = 300) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) {
        const p = DB_PATH + suffix;
        if (fs.existsSync(p)) fs.rmSync(p);
      }
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
