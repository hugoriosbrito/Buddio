import { create } from "zustand";
import type { RouteProblemId } from "../lib/routeHealth";

const PREFERRED_APP_KEY = "buddio.preferred-app";

export const HELP_APPS = [
  "discord",
  "teams",
  "zoom",
  "meet",
  "obs",
  "other",
] as const;

export type HelpApp = (typeof HELP_APPS)[number];

type HelpState = {
  isOpen: boolean;
  problemId: RouteProblemId | null;
  preferredApp: HelpApp;
  open: (problemId?: RouteProblemId | null) => void;
  close: () => void;
  setPreferredApp: (app: HelpApp) => void;
};

function storedPreferredApp(): HelpApp {
  try {
    const value = localStorage.getItem(PREFERRED_APP_KEY);
    return HELP_APPS.includes(value as HelpApp) ? (value as HelpApp) : "discord";
  } catch {
    return "discord";
  }
}

export const useHelpStore = create<HelpState>((set) => ({
  isOpen: false,
  problemId: null,
  preferredApp: storedPreferredApp(),
  open: (problemId = null) => set({ isOpen: true, problemId }),
  close: () => set({ isOpen: false, problemId: null }),
  setPreferredApp: (preferredApp) => {
    try {
      localStorage.setItem(PREFERRED_APP_KEY, preferredApp);
    } catch {
      /* Local preference is optional when storage is unavailable. */
    }
    set({ preferredApp });
  },
}));
