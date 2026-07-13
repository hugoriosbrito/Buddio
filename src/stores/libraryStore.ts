import { create } from "zustand";
import type { ClipDto } from "../lib/api";
import * as api from "../lib/api";
import { useUiStore } from "./uiStore";

type LibraryState = {
  clips: ClipDto[];
  selectedId: string | null;
  query: string;
  loading: boolean;
  error: string | null;
  notice: string | null;
  hydrate: () => Promise<void>;
  setQuery: (query: string) => void;
  select: (id: string | null) => void;
  setNotice: (notice: string | null) => void;
  clearError: () => void;
  importFiles: (paths?: string[] | null) => Promise<void>;
  importFolder: (path?: string | null) => Promise<void>;
  updateSelected: (update: Parameters<typeof api.updateClip>[1]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setHotkey: (id: string, hotkey: string | null) => Promise<void>;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  clips: [],
  selectedId: null,
  query: "",
  loading: false,
  error: null,
  notice: null,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const clips = await api.listClips();
      set({ clips, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  setQuery: (query) => set({ query }),

  select: (id) => {
    set({ selectedId: id });
    if (id) useUiStore.getState().setInspectorOpen(true);
  },

  setNotice: (notice) => set({ notice }),

  clearError: () => set({ error: null }),

  importFiles: async (paths = null) => {
    set({ error: null, loading: true });
    try {
      const result = await api.importClips(paths);
      const clips = await api.listClips();
      set({
        clips,
        loading: false,
        error: null,
        selectedId: result.imported[0]?.id ?? get().selectedId,
      });
      if (
        result.imported.length > 0 ||
        result.duplicates.length > 0 ||
        result.errors.length > 0
      ) {
        useUiStore.getState().openImportReview(result);
      }
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  importFolder: async (path = null) => {
    set({ error: null, loading: true });
    try {
      const result = await api.importFolder(path);
      const clips = await api.listClips();
      set({
        clips,
        loading: false,
        error: null,
        selectedId: result.imported[0]?.id ?? get().selectedId,
      });
      if (
        result.imported.length > 0 ||
        result.duplicates.length > 0 ||
        result.errors.length > 0
      ) {
        useUiStore.getState().openImportReview(result);
      }
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  updateSelected: async (update) => {
    const id = get().selectedId;
    if (!id) return;
    try {
      const clip = await api.updateClip(id, update);
      set({
        clips: get().clips.map((c) => (c.id === id ? clip : c)),
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  remove: async (id) => {
    try {
      await api.deleteClip(id);
      set({
        clips: get().clips.filter((c) => c.id !== id),
        selectedId: get().selectedId === id ? null : get().selectedId,
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setHotkey: async (id, hotkey) => {
    try {
      const clip = await api.setClipHotkey(id, hotkey);
      set({
        clips: get().clips.map((c) => (c.id === id ? clip : c)),
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
      throw err;
    }
  },
}));
