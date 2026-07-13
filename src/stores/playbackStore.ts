import { create } from "zustand";

const ERROR_DISPLAY_MS = 3000;

type PlaybackState = {
  playingIds: Set<string>;
  errors: Record<string, string>;
  markStarted: (clipId: string) => void;
  markStopped: (clipId: string) => void;
  markError: (clipId: string, message: string) => void;
  clearError: (clipId: string) => void;
  clearAll: () => void;
  isPlaying: (clipId: string) => boolean;
};

const errorTimeouts = new Map<string, number>();

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  playingIds: new Set(),
  errors: {},

  markStarted: (clipId) =>
    set((state) => {
      const playingIds = new Set(state.playingIds);
      playingIds.add(clipId);
      return { playingIds };
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
