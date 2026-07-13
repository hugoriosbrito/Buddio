import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { backupRealDb, restoreRealDb, resetOnboarding } from "./helpers/dbFixture.mjs";

// Dynamic (not static) import: the `edgedriver` package has a conditional
// top-level `await` in its module graph, which makes @wdio/cli v7's
// synchronous `require()` of this ESM config file fail with
// ERR_REQUIRE_ASYNC_MODULE. A dynamic import inside onPrepare (which runs
// after config loading, not during it) sidesteps that entirely.
async function ensureMsEdgeDriver() {
  const mod = await import("./helpers/ensureMsEdgeDriver.mjs");
  return mod.ensureMsEdgeDriver();
}

const TAURI_DRIVER_PORT = 4444;
const APP_PATH = resolveAppBinary();

function resolveTauriDriver() {
  const cargoBin = path.join(os.homedir(), ".cargo", "bin", "tauri-driver.exe");
  if (fs.existsSync(cargoBin)) return cargoBin;
  return "tauri-driver";
}

function resolveAppBinary() {
  // Cargo.toml at the repo root defines a workspace (src-tauri + crates/audio-engine),
  // so build output lands in the workspace-root `target/`, not `src-tauri/target/`.
  const debug = path.resolve("target/debug/buddio.exe");
  const release = path.resolve("target/release/buddio.exe");
  if (fs.existsSync(debug)) return debug;
  if (fs.existsSync(release)) return release;
  throw new Error(
    "Nenhum binario do Buddio encontrado. Rode `bun run e2e:build` antes da suite E2E.",
  );
}

function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`tauri-driver nao respondeu na porta ${port} a tempo`));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

let tauriDriverProcess;

/**
 * @param {object} opts
 * @param {string[]} opts.specs
 * @param {"full"|"novirtual"|undefined} opts.fakeDevices
 */
export function createConfig({ specs, fakeDevices }) {
  return {
    runner: "local",
    hostname: "127.0.0.1",
    port: TAURI_DRIVER_PORT,
    path: "/",
    specs,
    maxInstances: 1,
    // WebdriverIO v8/v9 default to WebDriver BiDi, which tauri-driver (a
    // classic-HTTP-only proxy) can't forward — connecting to msedgedriver's
    // BiDi WebSocket directly fails Origin validation. WDIO v7 never
    // attempts BiDi, which is why this suite is pinned to v7 (matches the
    // combination documented as working for Tauri v2 + tauri-driver).
    capabilities: [
      {
        maxInstances: 1,
        "tauri:options": {
          application: APP_PATH,
        },
      },
    ],
    reporters: ["spec"],
    framework: "mocha",
    mochaOpts: {
      ui: "bdd",
      timeout: 120000,
    },
    logLevel: "warn",

    onPrepare: async function () {
      if (fakeDevices) {
        process.env.BUDDIO_TEST_FAKE_DEVICES = fakeDevices;
      } else {
        delete process.env.BUDDIO_TEST_FAKE_DEVICES;
      }
      backupRealDb();
      await resetOnboarding();

      const msedgedriverPath = await ensureMsEdgeDriver();

      tauriDriverProcess = spawn(
        resolveTauriDriver(),
        ["--port", String(TAURI_DRIVER_PORT), "--native-driver", msedgedriverPath],
        {
          stdio: "pipe",
          env: process.env,
        },
      );
      tauriDriverProcess.stderr.on("data", (d) => process.stderr.write(`[tauri-driver] ${d}`));
      await waitForPort(TAURI_DRIVER_PORT);
    },

    beforeSession: async function () {
      await resetOnboarding();
    },

    onComplete: function () {
      restoreRealDb();
      if (tauriDriverProcess) tauriDriverProcess.kill();
    },
  };
}
