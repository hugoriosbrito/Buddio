import { create } from "zustand";
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
};

type UpdateState = {
  available: AvailableUpdate | null;
  checking: boolean;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  dismissModal: () => void;
  clearAvailable: () => void;
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

  setModalOpen: (open) => set({ modalOpen: open }),

  dismissModal: () => {
    const available = get().available;
    if (available) writeDismissedVersion(available.latest);
    set({ modalOpen: false });
  },

  clearAvailable: () => set({ available: null, modalOpen: false }),

  applyCheckResult: (result, options) => {
    if (result.status !== "update_available") {
      set({ available: null, modalOpen: false });
      return;
    }

    const available: AvailableUpdate = {
      current: result.current,
      latest: result.latest,
      url: result.url,
    };
    set({ available });

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
