import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { ZipReader, BlobReader, BlobWriter } from "@zip.js/zip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../.cache");
const BINARY_PATH = path.join(CACHE_DIR, "msedgedriver.exe");
const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function detectEdgeVersion() {
  const out = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `(Get-Item '${EDGE_PATH}').VersionInfo.ProductVersion`,
    ],
    { encoding: "utf8" },
  );
  return out.trim();
}

/**
 * Downloads (or reuses a cached) msedgedriver matching the installed
 * Edge/WebView2 version. Deliberately avoids the `edgedriver` npm package:
 * its dependency on a newer `@wdio/logger` conflicts with this suite's
 * pinned WebdriverIO v7 (see wdio.shared.mjs for why v7 is required).
 */
export async function ensureMsEdgeDriver() {
  if (fs.existsSync(BINARY_PATH)) return BINARY_PATH;

  const version = detectEdgeVersion();
  const url = `https://msedgedriver.microsoft.com/${version}/edgedriver_win64.zip`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar msedgedriver de ${url}: ${res.status}`);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const zip = new ZipReader(new BlobReader(await res.blob()));
  for (const entry of await zip.getEntries()) {
    if (entry.directory) continue;
    const content = await entry.getData(new BlobWriter());
    await fs.promises.writeFile(
      path.join(CACHE_DIR, entry.filename),
      Buffer.from(await content.arrayBuffer()),
    );
  }
  await zip.close();
  return BINARY_PATH;
}
