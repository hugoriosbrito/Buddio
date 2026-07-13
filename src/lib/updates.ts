/** Repositório GitHub para checagem de releases.
 * Atualize quando o remoto oficial estiver definido (README ainda usa placeholder). */
export const BUDDIO_GITHUB_REPO =
  (import.meta.env.VITE_BUDDIO_GITHUB_REPO as string | undefined)?.trim() ||
  "BuddioApp/buddio";

export const APP_VERSION = "0.1.0";

export type UpdateCheckResult =
  | { status: "up_to_date"; current: string; latest: string }
  | { status: "update_available"; current: string; latest: string; url: string }
  | { status: "unavailable"; current: string; reason: string };

function normalizeVersion(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

function compareSemver(a: string, b: string): number {
  const pa = normalizeVersion(a)
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
  const pb = normalizeVersion(b)
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export async function checkForUpdates(
  currentVersion: string = APP_VERSION,
): Promise<UpdateCheckResult> {
  const repo = BUDDIO_GITHUB_REPO;
  if (!repo || !repo.includes("/")) {
    return {
      status: "unavailable",
      current: currentVersion,
      reason: "Repositório GitHub não configurado.",
    };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
      },
    );

    if (res.status === 404) {
      return {
        status: "unavailable",
        current: currentVersion,
        reason: "Nenhum release encontrado neste repositório.",
      };
    }

    if (!res.ok) {
      return {
        status: "unavailable",
        current: currentVersion,
        reason: `Falha ao consultar GitHub (${res.status}).`,
      };
    }

    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
    };
    const latest = normalizeVersion(data.tag_name ?? "");
    if (!latest) {
      return {
        status: "unavailable",
        current: currentVersion,
        reason: "Resposta de release inválida.",
      };
    }

    if (compareSemver(latest, currentVersion) > 0) {
      return {
        status: "update_available",
        current: currentVersion,
        latest,
        url: data.html_url ?? `https://github.com/${repo}/releases/latest`,
      };
    }

    return {
      status: "up_to_date",
      current: currentVersion,
      latest,
    };
  } catch {
    return {
      status: "unavailable",
      current: currentVersion,
      reason: "Sem conexão ou GitHub indisponível.",
    };
  }
}
