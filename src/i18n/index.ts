import { useCallback } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { en } from "./en";
import { pt } from "./pt";
import { normalizeLocale, type Locale } from "./types";

export type { Locale } from "./types";
export { LOCALES, isLocale, normalizeLocale } from "./types";
export { localizeSeedName } from "./seedNames";

export type Messages = typeof en;
export type MessageKey = keyof Messages;
/** Locale catalogs share keys; values differ by language. */
type Catalog = { readonly [K in MessageKey]: string };

const catalogs: Record<Locale, Catalog> = { en, pt };

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const catalog = catalogs[locale] ?? catalogs.en;
  let text: string = catalog[key] ?? catalogs.en[key] ?? String(key);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function t(
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const locale = normalizeLocale(useSettingsStore.getState().settings.locale);
  return translate(locale, key, vars);
}

export function useT() {
  const locale = normalizeLocale(
    useSettingsStore((s) => s.settings.locale),
  );
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );
}

export function useLocale(): Locale {
  return normalizeLocale(useSettingsStore((s) => s.settings.locale));
}
