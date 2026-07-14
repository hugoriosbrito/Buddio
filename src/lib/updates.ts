import packageJson from "../../package.json";
import { t } from "../i18n";

/** Repositório GitHub para checagem de releases. */
export const BUDDIO_GITHUB_REPO =
  (import.meta.env.VITE_BUDDIO_GITHUB_REPO as string | undefined)?.trim() ||
  "hugoriosbrito/Buddio";

/** Versão do pacote atual (mantida em sync com `package.json` / tauri.conf). */
export const APP_VERSION = packageJson.version;

export type UpdateCheckResult =
  | { status: "up_to_date"; current: string; latest: string }
  | { status: "update_available"; current: string; latest: string; url: string }
  | { status: "unavailable"; current: string; reason: string };

type ParsedVersion = {
  core: number[];
  /** Pre-release identifiers (`rc`, `1` for `1.0.0-rc.1` / `1.0.0-rc1`). Empty = final release. */
  pre: string[];
};

/** Strip leading `v` and whitespace. */
export function normalizeVersion(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

/**
 * Parse `1.2.3`, `1.2.3-rc1`, `1.2.3-rc.2`, `1.2.3-beta.1+build`.
 * Numeric cores compare numerically; pre-release tokens compare numerically
 * when both are digits, otherwise ASCII.
 */
export function parseVersion(raw: string): ParsedVersion {
  const normalized = normalizeVersion(raw).split("+")[0] ?? "";
  const [corePart, prePart] = normalized.split("-", 2);
  const core = (corePart ?? "0")
    .split(".")
    .map((p) => Number.parseInt(p, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
  while (core.length < 3) core.push(0);

  const pre: string[] = [];
  if (prePart) {
    // `rc2` → ["rc", "2"]; `rc.2` → ["rc", "2"]
    for (const token of prePart.split(".")) {
      const match = /^([a-zA-Z]+)(\d+)$/.exec(token);
      if (match) {
        pre.push(match[1]!.toLowerCase(), match[2]!);
      } else {
        pre.push(token.toLowerCase());
      }
    }
  }
  return { core, pre };
}

/** SemVer-ish compare: final > any pre-release of the same core (`1.0.0` > `1.0.0-rc2`). */
export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa.core[i] ?? 0;
    const db = pb.core[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }

  const aFinal = pa.pre.length === 0;
  const bFinal = pb.pre.length === 0;
  if (aFinal && bFinal) return 0;
  if (aFinal) return 1; // final beats pre-release
  if (bFinal) return -1;

  const preLen = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < preLen; i += 1) {
    const sa = pa.pre[i];
    const sb = pb.pre[i];
    if (sa === undefined) return -1; // fewer pre tokens → lower
    if (sb === undefined) return 1;
    const na = Number.parseInt(sa, 10);
    const nb = Number.parseInt(sb, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && sa === String(na) && sb === String(nb)) {
      if (na > nb) return 1;
      if (na < nb) return -1;
      continue;
    }
    if (sa > sb) return 1;
    if (sa < sb) return -1;
  }
  return 0;
}

type GithubRelease = {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  created_at?: string;
};

/**
 * Newest non-draft release from the Releases page.
 *
 * Uses `/releases` (not `/releases/latest`) so **prereleases** (`v1.0.0-rc1`)
 * count — GitHub's "latest" endpoint only returns full non-prerelease builds
 * and 404s when the repo only has RCs.
 */
export function pickNewestRelease(releases: GithubRelease[]): GithubRelease | null {
  const published = releases.filter((r) => !r.draft && Boolean(r.tag_name?.trim()));
  if (published.length === 0) return null;

  // GitHub usually returns newest-first; still sort defensively by date then semver.
  return [...published].sort((a, b) => {
    const ta = Date.parse(a.published_at || a.created_at || "") || 0;
    const tb = Date.parse(b.published_at || b.created_at || "") || 0;
    if (tb !== ta) return tb - ta;
    return compareSemver(b.tag_name ?? "0", a.tag_name ?? "0");
  })[0]!;
}

export async function checkForUpdates(
  currentVersion: string = APP_VERSION,
): Promise<UpdateCheckResult> {
  const repo = BUDDIO_GITHUB_REPO;
  if (!repo || !repo.includes("/")) {
    return {
      status: "unavailable",
      current: currentVersion,
      reason: t("updates.repoNotConfigured"),
    };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=30`,
      {
        headers: { Accept: "application/vnd.github+json" },
      },
    );

    if (res.status === 404) {
      return {
        status: "unavailable",
        current: currentVersion,
        reason: t("updates.noReleaseFound"),
      };
    }

    if (!res.ok) {
      return {
        status: "unavailable",
        current: currentVersion,
        reason: t("updates.githubStatus", { status: res.status }),
      };
    }

    const data = (await res.json()) as GithubRelease[];
    if (!Array.isArray(data)) {
      return {
        status: "unavailable",
        current: currentVersion,
        reason: t("updates.invalidRelease"),
      };
    }

    const newest = pickNewestRelease(data);
    if (!newest?.tag_name) {
      return {
        status: "unavailable",
        current: currentVersion,
        reason: t("updates.noPublishedRelease"),
      };
    }

    const latest = normalizeVersion(newest.tag_name);
    const current = normalizeVersion(currentVersion);
    const url =
      newest.html_url ?? `https://github.com/${repo}/releases/tag/${newest.tag_name}`;

    if (compareSemver(latest, current) > 0) {
      return {
        status: "update_available",
        current,
        latest,
        url,
      };
    }

    return {
      status: "up_to_date",
      current,
      latest,
    };
  } catch {
    return {
      status: "unavailable",
      current: currentVersion,
      reason: t("updates.noConnection"),
    };
  }
}
