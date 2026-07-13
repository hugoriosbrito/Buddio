import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { AudioEditorModal } from "./components/AudioEditorModal";
import { CommandPalette } from "./components/CommandPalette";
import { DiagnosticsModal } from "./components/DiagnosticsModal";
import { ImportReviewModal } from "./components/ImportReviewModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { Titlebar } from "./components/layout/Titlebar";
import { ToastViewport } from "./components/ui/Toast";
import { MiniApp } from "./mini/MiniApp";
import { installNativeShellGuards } from "./lib/nativeShell";
import { useCollectionsStore } from "./stores/collectionsStore";
import { useLibraryStore } from "./stores/libraryStore";
import { usePlaybackStore } from "./stores/playbackStore";
import { useProfilesStore } from "./stores/profilesStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useToastStore } from "./stores/toastStore";
import { useUiStore } from "./stores/uiStore";
import { LibraryView } from "./views/Library";
import { ProfilesView } from "./views/Profiles";
import { RoutingView } from "./views/Routing";
import { SettingsView } from "./views/Settings";
import { SoundboardView } from "./views/Soundboard";

function MainApp() {
  const view = useUiStore((s) => s.view);
  const hydrateTheme = useUiStore((s) => s.hydrateTheme);
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
      }
      await Promise.all([
        hydrateLibrary(),
        hydrateCollections(),
        hydrateProfiles(),
      ]);
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
        (type === "registerfailed" || type === "clearedfragile") &&
        message
      ) {
        pushToast({ kind: "warning", message, sticky: true });
        setNotice(message);
        void hydrateLibrary();
      }
    }).then((fn) => {
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
