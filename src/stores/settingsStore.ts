import { emit } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { AppSettings, MicRouteModeDto, OutputDeviceDto } from "../lib/api";
import * as api from "../lib/api";

type SettingsState = {
  settings: AppSettings;
  devices: OutputDeviceDto[];
  error: string | null;
  hydrate: () => Promise<void>;
  setMasterVolume: (volume: number) => Promise<void>;
  setOutputs: (
    monitorEnabled: boolean,
    monitor: string | null,
    secondary: string | null,
  ) => Promise<void>;
  setStopAllHotkey: (hotkey: string | null) => Promise<void>;
  setMicRoute: (
    mode: MicRouteModeDto,
    duckingDb?: number | null,
  ) => Promise<void>;
  setLocale: (locale: string) => Promise<void>;
};

const defaults: AppSettings = {
  masterVolume: 1,
  monitorEnabled: true,
  monitorDevice: null,
  secondaryDevice: null,
  stopAllHotkey: "Escape",
  theme: "light",
  locale: "en",
  activeProfileId: null,
  onboardingDone: false,
  micMixEnabled: true,
  micRouteMode: "mix",
  duckingDb: -8,
  vadSoundEnabled: true,
  voiceTargetLufs: -16,
  indexHotkeysEnabled: false,
  micDevice: null,
  pinnedClipIds: [],
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaults,
  devices: [],
  error: null,

  hydrate: async () => {
    try {
      const [settings, devices] = await Promise.all([
        api.getSettings(),
        api.listOutputDevices(),
      ]);
      set({ settings, devices, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setMasterVolume: async (volume) => {
    try {
      await api.setMasterVolume(volume);
      set((s) => ({
        settings: { ...s.settings, masterVolume: volume },
        error: null,
      }));
    } catch (err) {
      set({ error: String(err) });
      throw err;
    }
  },

  setOutputs: async (monitorEnabled, monitor, secondary) => {
    try {
      await api.setOutputDevices({
        monitorEnabled,
        monitor,
        secondary,
      });
      set((s) => ({
        settings: {
          ...s.settings,
          monitorEnabled,
          monitorDevice: monitor,
          secondaryDevice: secondary,
        },
        error: null,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  setStopAllHotkey: async (hotkey) => {
    try {
      await api.setStopAllHotkey(hotkey);
      set((s) => ({
        settings: { ...s.settings, stopAllHotkey: hotkey },
        error: null,
      }));
    } catch (err) {
      set({ error: String(err) });
      throw err;
    }
  },

  setMicRoute: async (mode, duckingDb = null) => {
    try {
      await api.setMicRoute(mode, duckingDb);
      set((s) => ({
        settings: {
          ...s.settings,
          micRouteMode: mode,
          duckingDb: duckingDb ?? s.settings.duckingDb,
          micMixEnabled: mode !== "soundOnly",
        },
        error: null,
      }));
    } catch (err) {
      set({ error: String(err) });
      throw err;
    }
  },

  setLocale: async (locale) => {
    try {
      await api.setLocale(locale);
      set((s) => ({
        settings: { ...s.settings, locale },
        error: null,
      }));
      // Separate webviews (Buddio Mini) keep their own Zustand store — notify them.
      try {
        await emit("settings-changed", { locale });
      } catch {
        /* browser preview / non-Tauri */
      }
    } catch (err) {
      set({ error: String(err) });
      throw err;
    }
  },
}));
