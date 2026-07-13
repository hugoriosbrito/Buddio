/**
 * Ensures `%USERPROFILE%\.cargo\bin` is on PATH before invoking the Tauri CLI.
 * Cursor/VS Code terminals sometimes start without the User PATH refresh that
 * rustup added, which makes `bun run tauri` fail with "cargo … program not found".
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const cargoExe = path.join(cargoBin, process.platform === "win32" ? "cargo.exe" : "cargo");

if (!fs.existsSync(cargoExe)) {
  console.error(
    `cargo not found at ${cargoExe}\nInstall Rust from https://rustup.rs and reopen the terminal.`,
  );
  process.exit(1);
}

process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH ?? ""}`;

// Parallel rustc on Windows sometimes dies with 0xc0000409 (STATUS_STACK_BUFFER_OVERRUN)
// when AV/memory pressure kills a compiler mid-flight and corrupts the target cache.
if (!process.env.CARGO_BUILD_JOBS) {
  process.env.CARGO_BUILD_JOBS = "2";
}

const tauriBin =
  process.platform === "win32"
    ? path.join(root, "node_modules", ".bin", "tauri.exe")
    : path.join(root, "node_modules", ".bin", "tauri");

const args = process.argv.slice(2);
const child = spawn(tauriBin, args, {
  stdio: "inherit",
  env: process.env,
  cwd: root,
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
