import { create } from "zustand";
import type { ImportResult } from "../lib/api";

export type AppView =
  | "soundboard"
  | "library"
  | "profiles"
  | "routing"
  | "settings";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "purple" | "blue" | "green" | "orange" | "red";
export type UiDensity = "comfortable" | "compact";

type UiState = {
  view: AppView;
  theme: "light" | "dark";
  themeMode: ThemeMode;
  accent: AccentColor;
  density: UiDensity;
  startMinimized: boolean;
  startInBackground: boolean;
  reduceMotion: boolean;
  selectedCollectionId: string | null;
  inspectorOpen: boolean;
  commandPaletteOpen: boolean;
  onboardingOpen: boolean;
  diagnosticsOpen: boolean;
  editorClipId: string | null;
  importReviewOpen: boolean;
  importReview: ImportResult | null;
  setView: (view: AppView) => void;
  setTheme: (theme: "light" | "dark") => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  setDensity: (density: UiDensity) => void;
  setStartMinimized: (value: boolean) => void;
  setStartInBackground: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  toggleTheme: () => void;
  setSelectedCollectionId: (id: string | null) => void;
  setInspectorOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
  setDiagnosticsOpen: (open: boolean) => void;
  setEditorClipId: (id: string | null) => void;
  setImportReviewOpen: (open: boolean) => void;
  setImportReview: (review: ImportResult | null) => void;
  openImportReview: (review: ImportResult) => void;
  hydrateTheme: () => void;
};

const THEME_KEY = "buddio.theme";
const THEME_MODE_KEY = "buddio.themeMode";
const ACCENT_KEY = "buddio.accent";
const DENSITY_KEY = "buddio.density";
const START_MINIMIZED_KEY = "buddio.startMinimized";
const START_BACKGROUND_KEY = "buddio.startInBackground";
const REDUCE_MOTION_KEY = "buddio.reduceMotion";

const ACCENT_HEX: Record<AccentColor, string> = {
  purple: "#5b4dff",
  blue: "#3b82f6",
  green: "#22a06b",
  orange: "#f59e0b",
  red: "#ef4444",
};

let themeFadeHandle: number | undefined;
let systemThemeMq: MediaQueryList | null = null;

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyAccent(accent: AccentColor) {
  const root = document.documentElement;
  const hex = ACCENT_HEX[accent];
  // Apenas a cor de destaque do usuário — brand permanece fixa no CSS.
  root.style.setProperty("--buddio-accent", hex);
  root.setAttribute("data-accent", accent);
}

function applyDensity(density: UiDensity) {
  const root = document.documentElement;
  root.setAttribute("data-density", density);
}

function applyReduceMotion(enabled: boolean) {
  document.documentElement.setAttribute(
    "data-reduce-motion",
    enabled ? "true" : "false",
  );
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  if (root.getAttribute("data-theme") !== theme) {
    root.classList.add("theme-fading");
    window.clearTimeout(themeFadeHandle);
    themeFadeHandle = window.setTimeout(
      () => root.classList.remove("theme-fading"),
      200,
    );
  }
  root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "true";
  } catch {
    return fallback;
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  view: "soundboard",
  theme: "light",
  themeMode: "light",
  accent: "purple",
  density: "comfortable",
  startMinimized: false,
  startInBackground: false,
  reduceMotion: false,
  selectedCollectionId: null,
  inspectorOpen: true,
  commandPaletteOpen: false,
  onboardingOpen: false,
  diagnosticsOpen: false,
  editorClipId: null,
  importReviewOpen: false,
  importReview: null,

  setView: (view) => set({ view }),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme, themeMode: theme });
    persist(THEME_MODE_KEY, theme);
  },
  setThemeMode: (mode) => {
    const resolved = mode === "system" ? resolveSystemTheme() : mode;
    applyTheme(resolved);
    set({ themeMode: mode, theme: resolved });
    persist(THEME_MODE_KEY, mode);
  },
  setAccent: (accent) => {
    applyAccent(accent);
    set({ accent });
    persist(ACCENT_KEY, accent);
  },
  setDensity: (density) => {
    applyDensity(density);
    set({ density });
    persist(DENSITY_KEY, density);
  },
  setStartMinimized: (value) => {
    set({ startMinimized: value });
    persist(START_MINIMIZED_KEY, String(value));
  },
  setStartInBackground: (value) => {
    // TODO(tauri): conectar ao autostart / hide-on-launch do shell nativo.
    set({ startInBackground: value });
    persist(START_BACKGROUND_KEY, String(value));
  },
  setReduceMotion: (value) => {
    applyReduceMotion(value);
    set({ reduceMotion: value });
    persist(REDUCE_MOTION_KEY, String(value));
  },
  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    get().setTheme(next);
  },
  setSelectedCollectionId: (id) => set({ selectedCollectionId: id }),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  setDiagnosticsOpen: (open) => set({ diagnosticsOpen: open }),
  setEditorClipId: (id) => set({ editorClipId: id }),
  setImportReviewOpen: (open) => set({ importReviewOpen: open }),
  setImportReview: (review) => set({ importReview: review }),
  openImportReview: (review) =>
    set({ importReview: review, importReviewOpen: true }),
  hydrateTheme: () => {
    try {
      const modeRaw = localStorage.getItem(THEME_MODE_KEY);
      const themeMode: ThemeMode =
        modeRaw === "dark" || modeRaw === "system" || modeRaw === "light"
          ? modeRaw
          : localStorage.getItem(THEME_KEY) === "dark"
            ? "dark"
            : "light";
      const accentRaw = localStorage.getItem(ACCENT_KEY);
      const accent: AccentColor =
        accentRaw === "blue" ||
        accentRaw === "green" ||
        accentRaw === "orange" ||
        accentRaw === "red" ||
        accentRaw === "purple"
          ? accentRaw
          : "purple";
      const densityRaw = localStorage.getItem(DENSITY_KEY);
      const density: UiDensity =
        densityRaw === "compact" ? "compact" : "comfortable";
      const startMinimized = readBool(START_MINIMIZED_KEY, false);
      const startInBackground = readBool(START_BACKGROUND_KEY, false);
      const reduceMotion = readBool(REDUCE_MOTION_KEY, false);

      const resolved =
        themeMode === "system" ? resolveSystemTheme() : themeMode;
      applyTheme(resolved);
      applyAccent(accent);
      applyDensity(density);
      applyReduceMotion(reduceMotion);
      set({
        themeMode,
        theme: resolved,
        accent,
        density,
        startMinimized,
        startInBackground,
        reduceMotion,
      });

      if (typeof window !== "undefined") {
        systemThemeMq?.removeEventListener("change", onSystemThemeChange);
        systemThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
        systemThemeMq.addEventListener("change", onSystemThemeChange);
      }
    } catch {
      applyTheme("light");
    }
  },
}));

function onSystemThemeChange() {
  const { themeMode } = useUiStore.getState();
  if (themeMode !== "system") return;
  const resolved = resolveSystemTheme();
  applyTheme(resolved);
  useUiStore.setState({ theme: resolved });
}
