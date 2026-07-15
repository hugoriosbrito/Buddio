import { create } from "zustand";

const ERROR_DISPLAY_MS = 3000;

type PlaybackState = {
  playingIds: Set<string>;
  usage: Record<string, number>;
  errors: Record<string, string>;
  markStarted: (clipId: string) => void;
  markStopped: (clipId: string) => void;
  markError: (clipId: string, message: string) => void;
  clearError: (clipId: string) => void;
  clearAll: () => void;
  isPlaying: (clipId: string) => boolean;
};

const errorTimeouts = new Map<string, number>();
const USAGE_KEY = "buddio.clip-usage";

function loadUsage(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) ?? "{}"); } catch { return {}; }
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  playingIds: new Set(),
  usage: loadUsage(),
  errors: {},

  markStarted: (clipId) =>
    set((state) => {
      const playingIds = new Set(state.playingIds);
      playingIds.add(clipId);
      const usage = { ...state.usage, [clipId]: (state.usage[clipId] ?? 0) + 1 };
      try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch { /* optional */ }
      return { playingIds, usage };
    }),

  markStopped: (clipId) =>
    set((state) => {
      if (clipId === "*") {
        return { playingIds: new Set() };
      }
      const playingIds = new Set(state.playingIds);
      playingIds.delete(clipId);
      return { playingIds };
    }),

  markError: (clipId, message) => {
    window.clearTimeout(errorTimeouts.get(clipId));
    set((state) => ({ errors: { ...state.errors, [clipId]: message } }));
    const handle = window.setTimeout(() => get().clearError(clipId), ERROR_DISPLAY_MS);
    errorTimeouts.set(clipId, handle);
  },

  clearError: (clipId) => {
    window.clearTimeout(errorTimeouts.get(clipId));
    errorTimeouts.delete(clipId);
    set((state) => {
      if (!(clipId in state.errors)) return state;
      const errors = { ...state.errors };
      delete errors[clipId];
      return { errors };
    });
  },

  clearAll: () => set({ playingIds: new Set() }),

  isPlaying: (clipId) => get().playingIds.has(clipId),
}));
