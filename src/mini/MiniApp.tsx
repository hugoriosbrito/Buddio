import {
  MagnifyingGlass,
  Stop,
  Warning,
  ArrowSquareOut,
  X,
  Minus,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import markUrl from "../assets/brand/mark.svg";
import { ClipIcon } from "../components/ClipIcon";
import { playClip, stopAll, stopClip } from "../lib/api";
import { installNativeShellGuards } from "../lib/nativeShell";
import { cn } from "../lib/cn";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import { HotkeyChip } from "../components/ui/HotkeyChip";
import { Slider } from "../components/ui/Slider";
import { Waveform } from "../components/Waveform";

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type MiniMode = "default" | "search" | "playing" | "warning" | "compact";

async function hideMini() {
  try {
    await getCurrentWindow().hide();
  } catch {
    /* browser preview */
  }
}

async function minimizeMini() {
  try {
    await getCurrentWindow().minimize();
  } catch {
    /* browser preview */
  }
}

export function MiniApp() {
  const hydrateLibrary = useLibraryStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateTheme = useUiStore((s) => s.hydrateTheme);
  const setTheme = useUiStore((s) => s.setTheme);
  const clips = useLibraryStore((s) => s.clips);
  const settings = useSettingsStore((s) => s.settings);
  const setMasterVolume = useSettingsStore((s) => s.setMasterVolume);
  const playingIds = usePlaybackStore((s) => s.playingIds);
  const markStarted = usePlaybackStore((s) => s.markStarted);
  const markStopped = usePlaybackStore((s) => s.markStopped);
  const [query, setQuery] = useState("");
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const uninstall = installNativeShellGuards();
    hydrateTheme();
    void (async () => {
      await hydrateSettings();
      const theme = useSettingsStore.getState().settings.theme;
      if (theme === "light" || theme === "dark") setTheme(theme);
      await hydrateLibrary();
    })();
    let unlisten: (() => void) | undefined;
    void listen<Record<string, unknown>>("playback-event", (event) => {
      const payload = event.payload;
      const type = String(payload.type ?? "").toLowerCase();
      const data = (payload.data ?? payload) as {
        clipId?: string;
        clip_id?: string;
      };
      const id = data.clipId ?? data.clip_id;
      if (type === "started" && id) markStarted(id);
      else if (type === "stopped") markStopped(id ?? "*");
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      uninstall();
      unlisten?.();
    };
  }, [
    hydrateLibrary,
    hydrateSettings,
    hydrateTheme,
    markStarted,
    markStopped,
    setTheme,
  ]);

  const pinned = useMemo(() => {
    const fromFlag = clips.filter((c) => c.pinned);
    if (fromFlag.length) return fromFlag;
    const ids = new Set(settings.pinnedClipIds ?? []);
    if (ids.size) return clips.filter((c) => ids.has(c.id));
    return clips.slice(0, 4);
  }, [clips, settings.pinnedClipIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pinned;
    return clips.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.hotkey?.toLowerCase().includes(q) ?? false),
    );
  }, [clips, pinned, query]);

  const routeWarning = !settings.secondaryDevice;
  const playing = playingIds.size > 0;

  const mode: MiniMode = compact
    ? "compact"
    : routeWarning
      ? "warning"
      : query
        ? "search"
        : playing
          ? "playing"
          : "default";

  const openMain = async () => {
    try {
      const main = await WebviewWindow.getByLabel("main");
      if (main) {
        await main.show();
        await main.setFocus();
      }
    } catch {
      /* ignore */
    }
  };

  const windowControls = (
    <div className="no-drag flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Minimizar"
        className="flex size-7 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)]"
        onClick={() => void minimizeMini()}
      >
        <Minus size={12} weight="bold" />
      </button>
      <button
        type="button"
        aria-label="Fechar Mini"
        className="flex size-7 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-danger)] hover:text-white"
        onClick={() => void hideMini()}
      >
        <X size={12} weight="bold" />
      </button>
    </div>
  );

  if (mode === "compact") {
    return (
      <div className="flex h-full flex-col bg-[var(--buddio-window)] p-3 text-[var(--buddio-text)]">
        <div className="drag-region mb-2 flex items-center justify-between gap-2">
          <img src={markUrl} alt="" className="size-6 no-drag" />
          <button
            type="button"
            className="no-drag text-[11px] text-[var(--buddio-text-secondary)]"
            onClick={() => setCompact(false)}
          >
            Expandir
          </button>
          {windowControls}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {pinned.slice(0, 4).map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(
                "flex aspect-square items-center justify-center rounded-[12px] border text-lg transition-[background,border,transform] duration-[var(--duration-hover)] ease-[var(--ease-enter)] active:scale-95",
                playingIds.has(c.id)
                  ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)]"
                  : "border-[var(--buddio-border)] bg-[var(--buddio-surface)]",
              )}
              onClick={() =>
                void (playingIds.has(c.id) ? stopClip(c.id) : playClip(c.id))
              }
            >
              <ClipIcon
                emoji={c.emoji}
                size={24}
                className="overflow-hidden rounded-md"
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mt-2 flex h-8 items-center justify-center gap-1 rounded-[10px] bg-[var(--buddio-surface-secondary)] text-[12px] font-semibold transition-[background,transform] duration-[var(--duration-hover)] hover:bg-[var(--buddio-brand-soft)] active:scale-[0.98]"
          onClick={() => void stopAll()}
        >
          <Stop size={14} weight="bold" /> Parar
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--buddio-window)] text-[var(--buddio-text)]">
      <header className="drag-region flex items-center gap-2 border-b border-[var(--buddio-border-subtle)] px-3 py-2">
        <img src={markUrl} alt="" className="size-7 no-drag" />
        <div className="min-w-0 flex-1">
          <p className="font-brand text-[15px] font-extrabold leading-none">
            Buddio Mini
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--buddio-text-secondary)]">
            {settings.secondaryDevice ?? "Sem saída virtual"}
          </p>
        </div>
        <button
          type="button"
          className="no-drag rounded-md px-2 py-1 text-[11px] text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)]"
          onClick={() => setCompact(true)}
        >
          Compacto
        </button>
        {windowControls}
      </header>

      {routeWarning ? (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-[12px] border border-[var(--buddio-warning)]/40 bg-[color-mix(in_oklab,var(--buddio-warning)_12%,transparent)] px-3 py-2">
          <Warning
            size={16}
            weight="fill"
            className="mt-0.5 text-[var(--buddio-warning)]"
          />
          <p className="text-[12px]">
            Rota incompleta. Configure a saída virtual no app completo.
          </p>
        </div>
      ) : null}

      <label className="mx-3 mt-3 flex h-9 items-center gap-2 rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-2.5">
        <MagnifyingGlass
          size={14}
          className="text-[var(--buddio-text-secondary)]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca rápida"
          className="w-full bg-transparent text-[12px] outline-none"
        />
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!query ? (
          <p className="mb-1.5 px-0.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--buddio-text-muted)]">
            FIXADOS
          </p>
        ) : null}
        <ul className="grid grid-cols-2 gap-2">
          {filtered.map((c) => {
            const playingClip = playingIds.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-1.5 rounded-[12px] border px-2.5 py-2 text-left transition-[background,border,transform] duration-[var(--duration-hover)] ease-[var(--ease-enter)] active:scale-[0.98]",
                    playingClip
                      ? "border-[var(--buddio-brand-border)] bg-[var(--buddio-surface-selected)]"
                      : "border-[var(--buddio-border)] bg-[var(--buddio-surface)] hover:border-[var(--buddio-brand-border)]/60",
                  )}
                  onClick={() =>
                    void (playingClip ? stopClip(c.id) : playClip(c.id))
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <ClipIcon
                      emoji={c.emoji}
                      size={18}
                      className="shrink-0 overflow-hidden rounded"
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">
                      {c.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--buddio-text-secondary)]">
                    {formatDuration(c.durationMs)}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <HotkeyChip value={c.hotkey} className="shrink-0" />
                    <Waveform
                      peaks={c.peaks}
                      playing={playingClip}
                      className="h-4 flex-1"
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-[var(--buddio-border-subtle)] px-3 py-2.5">
        <Slider
          label="Volume mestre"
          min={0}
          max={1}
          step={0.01}
          value={settings.masterVolume}
          onChange={(v) => void setMasterVolume(v)}
        />
      </div>

      <footer className="flex items-center gap-2 border-t border-[var(--buddio-border-subtle)] px-3 py-2">
        <button
          type="button"
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-[10px] bg-[var(--buddio-surface-secondary)] text-[12px] font-semibold transition-[background,transform] duration-[var(--duration-hover)] hover:bg-[var(--buddio-brand-soft)] active:scale-[0.98]"
          onClick={() => void stopAll()}
        >
          <Stop size={14} weight="bold" /> Parar tudo
        </button>
        <button
          type="button"
          className="flex h-8 items-center gap-1 rounded-[10px] px-2 text-[12px] font-semibold text-[var(--buddio-brand-deep)] transition-[background,transform] duration-[var(--duration-hover)] hover:bg-[var(--buddio-brand-soft)] active:scale-[0.98]"
          onClick={() => void openMain()}
        >
          <ArrowSquareOut size={14} /> Abrir
        </button>
        <span className="ml-auto" />
      </footer>
    </div>
  );
}
