export type Locale = "en" | "pt";

export const LOCALES: { id: Locale; nativeLabel: string }[] = [
  { id: "en", nativeLabel: "English" },
  { id: "pt", nativeLabel: "Português" },
];

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "pt";
}

export function normalizeLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : "en";
}
