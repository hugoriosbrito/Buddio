const SEED_KEYS: Record<string, string> = {
  favorites: "seed.favorites",
  favoritos: "seed.favorites",
  calls: "seed.calls",
  chamadas: "seed.calls",
  streaming: "seed.streaming",
  games: "seed.games",
  jogos: "seed.games",
  default: "seed.defaultProfile",
  padrão: "seed.defaultProfile",
  padrao: "seed.defaultProfile",
};

type SeedKey =
  | "seed.favorites"
  | "seed.calls"
  | "seed.streaming"
  | "seed.games"
  | "seed.defaultProfile";

function asSeedKey(value: string): SeedKey | null {
  switch (value) {
    case "seed.favorites":
    case "seed.calls":
    case "seed.streaming":
    case "seed.games":
    case "seed.defaultProfile":
      return value;
    default:
      return null;
  }
}

/** Show built-in collection/profile names in the active UI language. */
export function localizeSeedName(
  name: string,
  t: (key: SeedKey) => string,
): string {
  const mapped = asSeedKey(SEED_KEYS[name.trim().toLowerCase()] ?? "");
  return mapped ? t(mapped) : name;
}
