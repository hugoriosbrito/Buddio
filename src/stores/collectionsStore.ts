import { create } from "zustand";
import type { CollectionDto } from "../lib/api";
import * as api from "../lib/api";

type CollectionsState = {
  collections: CollectionDto[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  create: (name: string, color?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  loading: false,
  error: null,

  hydrate: async () => {
    set({ loading: true });
    try {
      const collections = await api.listCollections();
      set({ collections, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  create: async (name, color = null) => {
    try {
      const created = await api.createCollection(name, color);
      set({ collections: [...get().collections, created], error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  remove: async (id) => {
    try {
      await api.deleteCollection(id);
      set({
        collections: get().collections.filter((c) => c.id !== id),
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
