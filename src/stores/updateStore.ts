import { create } from "zustand";
import * as api from "../lib/api";
import {
  APP_VERSION,
  checkForUpdates,
  type UpdateCheckResult,
} from "../lib/updates";

const DISMISSED_KEY = "buddio.dismissedUpdateVersion";
const PROMPTED_SESSION_KEY = "buddio.updatePromptedSession";

export type AvailableUpdate = {
  current: string;
  latest: string;
  url: string;
  downloadUrl: string | null;
};

export type UpdateInstallPhase = "idle" | "downloading" | "installing" | "error";

type UpdateState = {
  available: AvailableUpdate | null;
  checking: boolean;
  modalOpen: boolean;
  phase: UpdateInstallPhase;
  progress: { received: number; total: number | null } | null;
  error: string | null;
  setModalOpen: (open: boolean) => void;
  dismissModal: () => void;
  clearAvailable: () => void;
  setProgress: (progress: { received: number; total: number | null }) => void;
  resetInstall: () => void;
  startInstall: () => Promise<void>;
  applyCheckResult: (
    result: UpdateCheckResult,
    options?: { openModal?: boolean },
  ) => void;
  /** Quiet check on launch; opens modal once per session if a new version exists. */
  checkOnLaunch: () => Promise<void>;
  /** Manual / Settings refresh. */
  checkNow: (options?: { openModal?: boolean }) => Promise<UpdateCheckResult>;
};

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissedVersion(version: string) {
  try {
    localStorage.setItem(DISMISSED_KEY, version);
  } catch {
    /* ignore */
  }
}

function sessionAlreadyPrompted(latest: string): boolean {
  try {
    return sessionStorage.getItem(PROMPTED_SESSION_KEY) === latest;
  } catch {
    return false;
  }
}

function markSessionPrompted(latest: string) {
  try {
    sessionStorage.setItem(PROMPTED_SESSION_KEY, latest);
  } catch {
    /* ignore */
  }
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  checking: false,
  modalOpen: false,
  phase: "idle",
  progress: null,
  error: null,

  setModalOpen: (open) => set({ modalOpen: open }),

  dismissModal: () => {
    const { available, phase } = get();
    if (phase === "downloading" || phase === "installing") return;
    if (available) writeDismissedVersion(available.latest);
    set({ modalOpen: false });
  },

  clearAvailable: () =>
    set({
      available: null,
      modalOpen: false,
      phase: "idle",
      progress: null,
      error: null,
    }),

  setProgress: (progress) => set({ progress, phase: "downloading" }),

  resetInstall: () =>
    set({ phase: "idle", progress: null, error: null }),

  startInstall: async () => {
    const available = get().available;
    if (!available?.downloadUrl) {
      set({
        phase: "error",
        error: "no_installer",
      });
      return;
    }
    set({
      phase: "downloading",
      error: null,
      progress: { received: 0, total: null },
      modalOpen: true,
    });
    try {
      await api.startNsisUpdate(available.latest, available.downloadUrl);
      set({ phase: "installing" });
    } catch (e) {
      set({
        phase: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  applyCheckResult: (result, options) => {
    if (result.status !== "update_available") {
      set({
        available: null,
        modalOpen: false,
        phase: "idle",
        progress: null,
        error: null,
      });
      return;
    }

    const available: AvailableUpdate = {
      current: result.current,
      latest: result.latest,
      url: result.url,
      downloadUrl: result.downloadUrl,
    };
    set({ available, phase: "idle", progress: null, error: null });

    const shouldOpen =
      options?.openModal === true ||
      (options?.openModal !== false &&
        readDismissedVersion() !== available.latest &&
        !sessionAlreadyPrompted(available.latest));

    if (shouldOpen) {
      markSessionPrompted(available.latest);
      set({ modalOpen: true });
    }
  },

  checkOnLaunch: async () => {
    if (get().checking) return;
    set({ checking: true });
    try {
      const result = await checkForUpdates(APP_VERSION);
      get().applyCheckResult(result, { openModal: undefined });
    } finally {
      set({ checking: false });
    }
  },

  checkNow: async (options) => {
    set({ checking: true });
    try {
      const result = await checkForUpdates(APP_VERSION);
      get().applyCheckResult(result, {
        openModal: options?.openModal ?? result.status === "update_available",
      });
      return result;
    } finally {
      set({ checking: false });
    }
  },
}));
