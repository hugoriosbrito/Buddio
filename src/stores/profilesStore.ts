import { create } from "zustand";
import type { ProfileDto } from "../lib/api";
import * as api from "../lib/api";
import { localizeSeedName, t } from "../i18n";
import { useSettingsStore } from "./settingsStore";
import { useToastStore } from "./toastStore";

type ProfilesState = {
  profiles: ProfileDto[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  create: (name: string) => Promise<void>;
  apply: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  loading: false,
  error: null,

  hydrate: async () => {
    set({ loading: true });
    try {
      const profiles = await api.listProfiles();
      set({ profiles, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  create: async (name) => {
    try {
      const profile = await api.createProfile(name);
      set({ profiles: [...get().profiles, profile], error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  apply: async (id) => {
    try {
      const profile = await api.applyProfile(id);
      await useSettingsStore.getState().hydrate();
      set({
        profiles: get().profiles.map((p) =>
          p.id === profile.id ? profile : { ...p, isDefault: false },
        ),
        error: null,
      });
      useToastStore.getState().push({
        kind: "success",
        message: t("profiles.applied", {
          name: localizeSeedName(profile.name, t),
        }),
      });
    } catch (err) {
      set({ error: String(err) });
      useToastStore.getState().push({
        kind: "error",
        message: String(err),
        sticky: true,
      });
    }
  },

  remove: async (id) => {
    try {
      await api.deleteProfile(id);
      set({
        profiles: get().profiles.filter((p) => p.id !== id),
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
