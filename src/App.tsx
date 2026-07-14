import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { AudioEditorModal } from "./components/AudioEditorModal";
import { CommandPalette } from "./components/CommandPalette";
import { DiagnosticsModal } from "./components/DiagnosticsModal";
import { ImportReviewModal } from "./components/ImportReviewModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { UpdateAvailableModal } from "./components/UpdateAvailableModal";
import { Titlebar } from "./components/layout/Titlebar";
import { ToastViewport } from "./components/ui/Toast";
import { MiniApp } from "./mini/MiniApp";
import { t } from "./i18n";
import { installNativeShellGuards } from "./lib/nativeShell";
import * as api from "./lib/api";
import { useCollectionsStore } from "./stores/collectionsStore";
import { useLibraryStore } from "./stores/libraryStore";
import { usePlaybackStore } from "./stores/playbackStore";
import { useProfilesStore } from "./stores/profilesStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useToastStore } from "./stores/toastStore";
import { useUiStore } from "./stores/uiStore";
import { useUpdateStore } from "./stores/updateStore";
import { LibraryView } from "./views/Library";
import { ProfilesView } from "./views/Profiles";
import { RoutingView } from "./views/Routing";
import { SettingsView } from "./views/Settings";
import { SoundboardView } from "./views/Soundboard";

function MainApp() {
  const view = useUiStore((s) => s.view);
  const hydrateTheme = useUiStore((s) => s.hydrateTheme);
  const applyLaunchPreferences = useUiStore((s) => s.applyLaunchPreferences);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setOnboardingOpen = useUiStore((s) => s.setOnboardingOpen);
  const hydrateLibrary = useLibraryStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateCollections = useCollectionsStore((s) => s.hydrate);
  const hydrateProfiles = useProfilesStore((s) => s.hydrate);
  const setNotice = useLibraryStore((s) => s.setNotice);
  const markStarted = usePlaybackStore((s) => s.markStarted);
  const markStopped = usePlaybackStore((s) => s.markStopped);
  const pushToast = useToastStore((s) => s.push);
  const checkOnLaunch = useUpdateStore((s) => s.checkOnLaunch);

  useEffect(() => {
    const uninstall = installNativeShellGuards();
    hydrateTheme();
    void (async () => {
      await hydrateSettings();
      const settings = useSettingsStore.getState().settings;
      if (settings.theme === "light" || settings.theme === "dark") {
        setThemeMode(settings.theme);
      }
      if (!settings.onboardingDone) {
        setOnboardingOpen(true);
      } else {
        await applyLaunchPreferences();
        // After onboarding only: quiet update check → modal + titlebar badge.
        void checkOnLaunch();
      }
      await Promise.all([
        hydrateLibrary(),
        hydrateCollections(),
        hydrateProfiles(),
      ]);
      const collectionId = useUiStore.getState().selectedCollectionId;
      void api.syncIndexHotkeys(collectionId).catch(() => {
        /* ignore */
      });
    })();

    const unlistens: Array<() => void> = [];
    void listen<Record<string, unknown>>("playback-event", (event) => {
      const payload = event.payload;
      const type = String(payload.type ?? "").toLowerCase();
      const data = (payload.data ?? payload) as {
        clipId?: string;
        clip_id?: string;
        message?: string;
      };
      const id = data.clipId ?? data.clip_id;
      const message = data.message;

      if (type === "started" && id) markStarted(id);
      else if (type === "stopped") markStopped(id ?? "*");
      else if (type === "devicewarning" && message) {
        pushToast({ kind: "warning", message, sticky: true });
        setNotice(message);
      } else if (type === "error" && message) {
        useLibraryStore.setState({ error: message });
        pushToast({ kind: "error", message, sticky: true });
      }
    }).then((fn) => {
      unlistens.push(fn);
    });

    void listen<{
      type?: string;
      message?: string;
      hotkey?: string;
    }>("hotkey-event", (event) => {
      const type = String(event.payload.type ?? "").toLowerCase();
      const message = event.payload.message;
      if (
        (type === "registerfailed" ||
          type === "clearedfragile" ||
          type === "unsupported") &&
        message
      ) {
        pushToast({ kind: "warning", message, sticky: true });
        setNotice(message);
        if (type !== "unsupported") {
          void hydrateLibrary();
        }
      }
    }).then((fn) => {
      unlistens.push(fn);
    });

    void listen<{ imported?: number }>("library-updated", (event) => {
      void hydrateLibrary();
      const n = event.payload.imported ?? 0;
      if (n > 0) {
        pushToast({
          kind: "success",
          message:
            n === 1
              ? t("app.watchedImportOne")
              : t("app.watchedImportMany", { count: n }),
        });
      }
    }).then((fn) => {
      unlistens.push(fn);
    });

    void listen<{ received: number; total?: number | null }>(
      "update-download-progress",
      (event) => {
        useUpdateStore.getState().setProgress({
          received: event.payload.received,
          total: event.payload.total ?? null,
        });
      },
    ).then((fn) => {
      unlistens.push(fn);
    });

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      uninstall();
      for (const fn of unlistens) fn();
      window.removeEventListener("keydown", onKey);
    };
  }, [
    applyLaunchPreferences,
    checkOnLaunch,
    hydrateCollections,
    hydrateLibrary,
    hydrateProfiles,
    hydrateSettings,
    hydrateTheme,
    markStarted,
    markStopped,
    pushToast,
    setCommandPaletteOpen,
    setNotice,
    setOnboardingOpen,
    setThemeMode,
  ]);

  const selectedCollectionId = useUiStore((s) => s.selectedCollectionId);
  const indexHotkeysEnabled = useSettingsStore(
    (s) => s.settings.indexHotkeysEnabled,
  );

  useEffect(() => {
    if (!indexHotkeysEnabled) return;
    void api.syncIndexHotkeys(selectedCollectionId).catch(() => {
      /* ignore when not in tauri */
    });
  }, [selectedCollectionId, indexHotkeysEnabled]);

  const onboardingOpen = useUiStore((s) => s.onboardingOpen);
  const showInspector = view === "soundboard" || view === "library";

  if (onboardingOpen) {
    return (
      <div className="relative flex h-full flex-col overflow-hidden bg-[var(--buddio-window)] text-[var(--buddio-text)]">
        <Titlebar />
        <div className="min-h-0 flex-1">
          <OnboardingModal />
        </div>
        <ToastViewport />
        <CommandPalette />
        <ImportReviewModal />
        <UpdateAvailableModal />
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <AppShell showInspector={showInspector}>
        <div key={view} className="animate-view-in h-full">
          {view === "soundboard" ? <SoundboardView /> : null}
          {view === "library" ? <LibraryView /> : null}
          {view === "profiles" ? <ProfilesView /> : null}
          {view === "routing" ? <RoutingView /> : null}
          {view === "settings" ? <SettingsView /> : null}
        </div>
      </AppShell>
      <CommandPalette />
      <AudioEditorModal />
      <ImportReviewModal />
      <DiagnosticsModal />
      <UpdateAvailableModal />
    </div>
  );
}

function App() {
  const isMini =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("window") === "mini";

  if (isMini) return <MiniApp />;
  return <MainApp />;
}

export default App;
