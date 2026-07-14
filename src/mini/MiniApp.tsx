import {
  ArrowsLeftRight,
  ArrowSquareOut,
  CaretDown,
  DotsThree,
  MagnifyingGlass,
  Play,
  SpeakerHigh,
  Stop,
  Warning,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { LogicalSize, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import markUrl from "../assets/brand/mark.svg";
import { ClipIcon } from "../components/ClipIcon";
import { HotkeyChip } from "../components/ui/HotkeyChip";
import { Slider } from "../components/ui/Slider";
import { Waveform } from "../components/Waveform";
import { useT, type MessageKey } from "../i18n";
import type { ClipDto } from "../lib/api";
import { ensureVirtualCable, playClip, stopAll, stopClip } from "../lib/api";
import { cn } from "../lib/cn";
import { installNativeShellGuards } from "../lib/nativeShell";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";

const DEFAULT_SIZE = { width: 360, height: 560 };
const DEFAULT_MIN = { width: 320, height: 420 };
/** Horizontal ultra-compact bar (reference + volume row). */
const COMPACT_SIZE = { width: 480, height: 196 };
const COMPACT_MIN = { width: 420, height: 176 };

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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

async function resizeMini(
  size: { width: number; height: number },
  min: { width: number; height: number },
  compact: boolean,
) {
  try {
    // Prefer Rust: JS setSize often no-ops on undecorated Windows webviews.
    await invoke("resize_mini_window", {
      width: size.width,
      height: size.height,
      min_width: min.width,
      min_height: min.height,
      compact,
    });
    return;
  } catch {
    /* fall through to JS fallback (dev browser / older binary) */
  }

  try {
    const win = getCurrentWindow();
    await win.setMaxSize(null);
    await win.setMinSize(null);
    const factor = await win.scaleFactor();
    await win.setSize(
      new PhysicalSize(
        Math.round(size.width * factor),
        Math.round(size.height * factor),
      ),
    );
    await win.setMinSize(new LogicalSize(min.width, min.height));
    await win.setResizable(!compact);
  } catch (err) {
    console.warn("resizeMini failed", err);
  }
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "muted" }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        tone === "ok" && "bg-[var(--buddio-success)]",
        tone === "warn" && "bg-[var(--buddio-warning)]",
        tone === "muted" && "bg-[var(--buddio-text-muted)]",
      )}
    />
  );
}

function SoundCard({
  clip,
  playing,
  onToggle,
}: {
  clip: ClipDto;
  playing: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t("mini.playSound", { name: clip.name })}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-[14px] border px-2.5 py-2.5 text-left transition-[background,border,transform] duration-[var(--duration-hover)] ease-[var(--ease-enter)] active:scale-[0.98]",
        playing
          ? "border-[var(--buddio-brand-border)] bg-[var(--buddio-surface-selected)]"
          : "border-[var(--buddio-border)] bg-[var(--buddio-surface)] hover:border-[var(--buddio-brand-border)]/50",
      )}
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <ClipIcon
          emoji={clip.emoji}
          size={22}
          className="mt-0.5 shrink-0 overflow-hidden rounded-md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold leading-tight">
            {clip.name}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--buddio-text-secondary)]">
            {formatDuration(clip.durationMs)}
          </p>
        </div>
        <HotkeyChip value={clip.hotkey} className="h-5 shrink-0 px-1.5 text-[10px]" />
      </div>
      <div className="flex items-center gap-1.5">
        <Waveform
          peaks={clip.peaks}
          playing={playing}
          className="h-4 flex-1"
        />
        <Play
          size={12}
          weight="fill"
          className={cn(
            "shrink-0",
            playing
              ? "text-[var(--buddio-brand)]"
              : "text-[var(--buddio-text-muted)] group-hover:text-[var(--buddio-text)]",
          )}
        />
      </div>
    </button>
  );
}

function SearchRow({
  clip,
  playing,
  focused,
  onToggle,
}: {
  clip: ClipDto;
  playing: boolean;
  focused: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t("mini.playSound", { name: clip.name })}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[12px] border px-2.5 py-2 text-left transition-[background,border] duration-[var(--duration-hover)]",
        focused || playing
          ? "border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)]"
          : "border-transparent hover:bg-[var(--buddio-surface-secondary)]",
      )}
      onClick={onToggle}
    >
      <ClipIcon
        emoji={clip.emoji}
        size={28}
        className="shrink-0 overflow-hidden rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{clip.name}</p>
        <p className="mt-0.5 text-[11px] text-[var(--buddio-text-secondary)]">
          {formatDuration(clip.durationMs)} · {t("mini.fromLibrary")}
        </p>
      </div>
      <HotkeyChip value={clip.hotkey} className="h-5 shrink-0 px-1.5 text-[10px]" />
      <Play size={12} weight="fill" className="shrink-0 text-[var(--buddio-text-muted)]" />
    </button>
  );
}

export function MiniApp() {
  const t = useT();
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [repairing, setRepairing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const uninstall = installNativeShellGuards();
    hydrateTheme();

    const syncFromBackend = async () => {
      await hydrateSettings();
      const theme = useSettingsStore.getState().settings.theme;
      if (theme === "light" || theme === "dark") setTheme(theme);
      await hydrateLibrary();
    };
    void syncFromBackend();

    const unsubs: Array<() => void> = [];
    void listen<Record<string, unknown>>("playback-event", (event) => {
      const payload = event.payload;
      const type = String(payload.type ?? "").toLowerCase();
      const data = (payload.data ?? payload) as {
        clipId?: string;
        clip_id?: string;
      };
      const id = data.clipId ?? data.clip_id;
      if (type === "started" && id) {
        markStarted(id);
        setRecentIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 4));
      } else if (type === "stopped") markStopped(id ?? "*");
    }).then((fn) => unsubs.push(fn));

    void listen("settings-changed", () => {
      void syncFromBackend();
    }).then((fn) => unsubs.push(fn));

    let unlistenFocus: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) void syncFromBackend();
      })
      .then((fn) => {
        unlistenFocus = fn;
      });

    return () => {
      uninstall();
      for (const unsub of unsubs) unsub();
      unlistenFocus?.();
    };
  }, [
    hydrateLibrary,
    hydrateSettings,
    hydrateTheme,
    markStarted,
    markStopped,
    setTheme,
  ]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pinned = useMemo(() => {
    const fromFlag = clips.filter((c) => c.pinned);
    if (fromFlag.length) return fromFlag;
    const ids = new Set(settings.pinnedClipIds ?? []);
    if (ids.size) return clips.filter((c) => ids.has(c.id));
    return clips.slice(0, 6);
  }, [clips, settings.pinnedClipIds]);

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pinned;
    return clips.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.hotkey?.toLowerCase().includes(q) ?? false),
    );
  }, [clips, pinned, query]);

  const recents = useMemo(() => {
    const byId = new Map(clips.map((c) => [c.id, c]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean) as ClipDto[];
  }, [clips, recentIds]);

  const routeWarning = !settings.secondaryDevice;
  const routeOk = Boolean(settings.secondaryDevice);
  const playingId = [...playingIds][0] ?? null;
  const playingClip = playingId
    ? (clips.find((c) => c.id === playingId) ?? null)
    : null;

  const statusLabelKey: MessageKey = routeOk
    ? playingId
      ? "mini.statusStreaming"
      : "mini.statusReady"
    : "mini.statusOffline";

  const toggleClip = useCallback(
    (id: string) => {
      void (playingIds.has(id) ? stopClip(id) : playClip(id));
    },
    [playingIds],
  );

  const setCompactMode = async (next: boolean) => {
    setCompact(next);
    setMenuOpen(false);
    if (next) {
      await resizeMini(COMPACT_SIZE, COMPACT_MIN, true);
    } else {
      await resizeMini(DEFAULT_SIZE, DEFAULT_MIN, false);
    }
  };

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

  const repairRoute = async () => {
    setRepairing(true);
    try {
      await ensureVirtualCable();
      await hydrateSettings();
    } catch {
      /* toast elsewhere / silent in mini */
    } finally {
      setRepairing(false);
    }
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!searching || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const clip = filtered[focusIndex];
      if (clip) toggleClip(clip.id);
    }
  };

  useEffect(() => {
    setFocusIndex(0);
  }, [query]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = () => setMenuOpen(false);
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  if (compact) {
    const compactPads = pinned.slice(0, 4);
    return (
      <div className="box-border flex w-full flex-col overflow-hidden bg-[var(--buddio-window)] px-3 py-2.5 text-[var(--buddio-text)]">
        <div className="drag-region flex shrink-0 items-center gap-2 pb-2">
          <img src={markUrl} alt="" className="size-5 no-drag" />
          <span className="font-brand text-[13px] font-extrabold leading-none">
            {t("mini.brand")}
          </span>
          <span className="flex-1" />
          <span className="no-drag inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--buddio-text-secondary)]">
            <StatusDot tone={routeOk ? "ok" : "muted"} />
            {t(statusLabelKey)}
          </span>
        </div>

        <div className="no-drag flex min-h-0 shrink-0 items-stretch gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-4 gap-1.5">
            {Array.from({ length: 4 }, (_, i) => {
              const c = compactPads[i];
              if (!c) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="min-h-[64px] rounded-[12px] border border-dashed border-[var(--buddio-border)] bg-[var(--buddio-surface)]/40"
                  />
                );
              }
              const on = playingIds.has(c.id);
              const hotkeyLabel = c.hotkey
                ? c.hotkey
                    .replace(/CommandOrControl/gi, "⌘")
                    .replace(/Control/gi, "Ctrl")
                    .replace(/Shift/gi, "⇧")
                    .replace(/\+/g, "")
                    .slice(0, 4)
                : "—";
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.name}
                  className={cn(
                    "flex min-h-[64px] flex-col items-stretch justify-between rounded-[12px] border px-1.5 py-1.5 text-left transition-[background,border,transform] active:scale-95",
                    on
                      ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)]"
                      : "border-[var(--buddio-border)] bg-[var(--buddio-surface)]",
                  )}
                  onClick={() => toggleClip(c.id)}
                >
                  <div className="flex items-start justify-between gap-0.5">
                    <ClipIcon
                      emoji={c.emoji}
                      size={18}
                      className="overflow-hidden rounded"
                    />
                    <span className="font-mono text-[9px] font-bold text-[var(--buddio-brand-deep)]">
                      {hotkeyLabel}
                    </span>
                  </div>
                  <span className="truncate text-[10px] font-medium leading-tight text-[var(--buddio-text)]">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={t("mini.stopAll")}
            className="flex w-12 shrink-0 items-center justify-center self-stretch rounded-[12px] bg-[var(--buddio-brand)] text-white transition-transform active:scale-95"
            onClick={() => void stopAll()}
          >
            <Stop size={18} weight="fill" />
          </button>
        </div>

        <div className="no-drag mt-2 flex shrink-0 items-center gap-2">
          <SpeakerHigh
            size={14}
            className="shrink-0 text-[var(--buddio-text-secondary)]"
          />
          <Slider
            label={t("mini.masterVolume")}
            aria-label={t("mini.masterVolume")}
            min={0}
            max={1}
            step={0.01}
            value={settings.masterVolume}
            onChange={(v) => void setMasterVolume(v)}
            className="min-w-0 flex-1 gap-0 [&>:first-child]:hidden"
          />
        </div>

        <div className="no-drag mt-2 flex shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--buddio-brand-deep)]"
              onClick={() => void setCompactMode(false)}
            >
              {t("mini.expand")}
            </button>
            <button
              type="button"
              className="text-[11px] font-semibold text-[var(--buddio-text-secondary)] hover:text-[var(--buddio-brand-deep)]"
              onClick={() => void openMain()}
            >
              {t("mini.openApp")}
            </button>
          </div>
          <span className="font-mono text-[10px] text-[var(--buddio-text-muted)]">
            {t("mini.searchShortcut")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-[var(--buddio-window)] text-[var(--buddio-text)]">
      <header className="drag-region flex items-center gap-2 px-3 pb-1 pt-3">
        <img src={markUrl} alt="" className="size-7 no-drag" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-brand text-[15px] font-extrabold leading-none">
              {t("mini.brand")}
            </span>
            <span className="text-[9px] font-bold tracking-[0.12em] text-[var(--buddio-text-muted)]">
              {t("mini.badge")}
            </span>
          </div>
        </div>
        <span className="no-drag inline-flex items-center gap-1.5 rounded-full border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-2 py-1 text-[11px] font-semibold">
          <StatusDot tone={routeOk ? "ok" : "warn"} />
          {t(statusLabelKey)}
          <CaretDown size={10} className="text-[var(--buddio-text-muted)]" />
        </span>
        <div className="no-drag relative">
          <button
            type="button"
            aria-label={t("mini.menu")}
            aria-expanded={menuOpen}
            className="flex size-7 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)]"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <DotsThree size={18} weight="bold" />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] py-1 shadow-[var(--shadow-modal)]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--buddio-surface-secondary)]"
                onClick={() => void setCompactMode(true)}
              >
                {t("mini.compact")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--buddio-surface-secondary)]"
                onClick={() => {
                  setMenuOpen(false);
                  void minimizeMini();
                }}
              >
                {t("mini.minimize")}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-1.5 text-left text-[12px] text-[var(--buddio-danger)] hover:bg-[var(--buddio-surface-secondary)]"
                onClick={() => {
                  setMenuOpen(false);
                  void hideMini();
                }}
              >
                {t("mini.close")}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {routeWarning ? (
        <div className="mx-3 mt-2 rounded-[14px] border border-[color-mix(in_oklab,var(--buddio-warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--buddio-warning)_14%,transparent)] px-3 py-3">
          <div className="flex items-start gap-2">
            <Warning
              size={18}
              weight="fill"
              className="mt-0.5 shrink-0 text-[var(--buddio-warning)]"
            />
            <div className="min-w-0">
              <p className="text-[13px] font-bold">{t("mini.warnTitle")}</p>
              <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
                {t("mini.warnBody")}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={repairing}
            className="mt-3 flex h-9 w-full items-center justify-center rounded-[10px] bg-[var(--buddio-brand)] text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
            onClick={() => void repairRoute()}
          >
            {t("mini.repairNow")}
          </button>
        </div>
      ) : null}

      <label className="mx-3 mt-3 flex h-10 items-center gap-2 rounded-[14px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3">
        <MagnifyingGlass
          size={15}
          className="shrink-0 text-[var(--buddio-text-secondary)]"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={t("mini.quickSearch")}
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--buddio-text-muted)]"
        />
        <span className="shrink-0 rounded-md bg-[var(--buddio-brand-soft)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--buddio-brand-deep)]">
          {searching ? t("mini.clearSearch") : t("mini.searchShortcut")}
        </span>
        {searching ? (
          <button
            type="button"
            aria-label={t("mini.clearSearch")}
            className="text-[var(--buddio-text-muted)]"
            onClick={() => setQuery("")}
          >
            <X size={12} weight="bold" />
          </button>
        ) : null}
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {playingClip && !searching ? (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-bold tracking-[0.1em] text-[var(--buddio-brand)]">
              {t("mini.nowPlaying").toUpperCase()}
            </p>
            <SoundCard
              clip={playingClip}
              playing
              onToggle={() => toggleClip(playingClip.id)}
            />
          </div>
        ) : null}

        {searching ? (
          <>
            <p className="mb-2 text-[12px] text-[var(--buddio-text-secondary)]">
              {filtered.length === 1
                ? t("mini.resultOne")
                : t("mini.results", { count: filtered.length })}
            </p>
            <ul className="flex flex-col gap-1">
              {filtered.map((c, i) => (
                <li key={c.id}>
                  <SearchRow
                    clip={c}
                    playing={playingIds.has(c.id)}
                    focused={i === focusIndex}
                    onToggle={() => toggleClip(c.id)}
                  />
                </li>
              ))}
            </ul>
            {filtered.length > 0 ? (
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--buddio-text-muted)]">
                <span>↑↓ {t("mini.navHint")}</span>
                <span>Enter {t("mini.playHint")}</span>
              </p>
            ) : null}
            {recents.length > 0 ? (
              <div className="mt-4">
                <p className="mb-1.5 text-[12px] font-semibold">{t("mini.recents")}</p>
                <ul className="grid grid-cols-2 gap-2">
                  {recents.map((c) => (
                    <li key={c.id}>
                      <SoundCard
                        clip={c}
                        playing={playingIds.has(c.id)}
                        onToggle={() => toggleClip(c.id)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[12px] font-semibold">{t("mini.pinned")}</p>
              <button
                type="button"
                className="text-[12px] font-semibold text-[var(--buddio-brand-deep)]"
                onClick={() => void openMain()}
              >
                {t("mini.editPinned")}
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {pinned.map((c) => (
                <li key={c.id}>
                  <SoundCard
                    clip={c}
                    playing={playingIds.has(c.id)}
                    onToggle={() => toggleClip(c.id)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {routeWarning ? (
        <div className="mx-3 mb-2 rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--buddio-text-secondary)]">
                {t("mini.tempOutput")}
              </p>
              <p className="truncate text-[12px] font-semibold">
                Monitor — {settings.monitorDevice ?? t("common.systemDefault")}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-[12px] font-semibold text-[var(--buddio-brand-deep)]"
              onClick={() => void openMain()}
            >
              {t("mini.changeOutput")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="px-3 pb-2">
        <Slider
          label={t("mini.masterVolume")}
          min={0}
          max={1}
          step={0.01}
          value={settings.masterVolume}
          onChange={(v) => void setMasterVolume(v)}
        />
      </div>

      <div className="flex items-center gap-2 px-3 pb-2">
        <button
          type="button"
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] text-[12px] font-semibold transition-colors hover:bg-[var(--buddio-surface-secondary)]"
          onClick={() => void stopAll()}
        >
          <Stop size={13} weight="fill" /> {t("mini.stopAll")}
        </button>
        <span
          className={cn(
            "inline-flex h-9 max-w-[48%] items-center gap-1.5 truncate rounded-[12px] px-2.5 text-[11px] font-semibold",
            routeOk
              ? "bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand-deep)]"
              : "bg-[color-mix(in_oklab,var(--buddio-warning)_16%,transparent)] text-[var(--buddio-warning)]",
          )}
        >
          <StatusDot tone={routeOk ? "ok" : "warn"} />
          {routeOk ? t("mini.hotkeysReady") : t("mini.limitedRoute")}
        </span>
      </div>

      <footer className="flex items-center gap-2 border-t border-[var(--buddio-border-subtle)] px-3 py-2.5">
        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-[var(--buddio-text-secondary)]">
          <ArrowsLeftRight size={12} />
          <span className="truncate">
            {routeOk ? t("mini.virtualMic") : t("mini.monitorOnly")}
          </span>
          <StatusDot tone={routeOk ? "ok" : "warn"} />
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--buddio-text-secondary)]">
          <StatusDot tone={routeOk ? "ok" : "muted"} />
          {routeOk ? t("mini.statusReady") : t("mini.statusOffline")}
        </span>
        <button
          type="button"
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-[10px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-2.5 text-[12px] font-semibold transition-colors hover:bg-[var(--buddio-surface-secondary)]"
          onClick={() => void openMain()}
        >
          <ArrowSquareOut size={13} /> {t("mini.open")}
        </button>
      </footer>
    </div>
  );
}
