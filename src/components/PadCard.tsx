import { Pause, Play, Repeat, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import type { ClipDto } from "../lib/api";
import { cn } from "../lib/cn";
import { ClipIcon } from "./ClipIcon";
import { HotkeyChip } from "./ui/HotkeyChip";
import { Waveform } from "./Waveform";

type Props = {
  clip: ClipDto;
  selected: boolean;
  playing: boolean;
  error?: string | null;
  onPlayToggle: () => void;
  onSelect: () => void;
};

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Pad visual alinhado ao mock Sound States / Soundboard. */
export function PadCard({
  clip,
  selected,
  playing,
  error,
  onPlayToggle,
  onSelect,
}: Props) {
  const t = useT();
  const wasPlaying = useRef(playing);
  const [pulse, setPulse] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (playing && !wasPlaying.current) {
      setPulse(true);
      const handle = window.setTimeout(() => setPulse(false), 220);
      wasPlaying.current = playing;
      return () => window.clearTimeout(handle);
    }
    wasPlaying.current = playing;
  }, [playing]);

  return (
    <article
      data-no-drag
      className={cn(
        "group relative flex flex-col gap-[var(--space-gap-card)] overflow-hidden rounded-[var(--pad-radius)] border p-[var(--space-pad-card)] transition-[background,border,box-shadow,transform] duration-[80ms] ease-[var(--ease-enter)]",
        error
          ? "border-[var(--buddio-danger)] bg-[color-mix(in_oklab,var(--buddio-danger)_8%,var(--buddio-surface))]"
          : playing
            ? "border-[var(--buddio-brand)] bg-[var(--buddio-surface-selected)] shadow-[var(--shadow-selected)]"
            : selected
              ? "border-[var(--buddio-brand)] bg-[var(--buddio-surface-selected)] shadow-[var(--shadow-selected)]"
              : "border-[var(--buddio-border)] bg-[var(--buddio-surface)] hover:border-[var(--buddio-brand-border)] hover:bg-[color-mix(in_oklab,var(--buddio-brand-soft)_55%,var(--buddio-surface))]",
        pressed && !error && "scale-[0.98] border-[var(--buddio-brand)]",
        pulse && "animate-play-pulse",
        error && "animate-shake",
      )}
      onClick={onSelect}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect();
      }}
    >
      {clip.loopEnabled && !error ? (
        <span className="absolute right-3 top-3 text-[var(--buddio-brand)]">
          <Repeat size={14} weight="bold" aria-label="Loop" />
        </span>
      ) : null}

      <div className="flex items-start justify-between gap-2 pr-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipIcon
              emoji={clip.emoji}
              size={28}
              className="shrink-0 overflow-hidden rounded-md"
              onClick={(e) => {
                e.stopPropagation();
                onPlayToggle();
              }}
            />
            <h3 className="truncate text-[14px] font-semibold text-[var(--buddio-text)]">
              {clip.name}
            </h3>
          </div>
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-[11px]",
              error
                ? "text-[var(--buddio-danger)]"
                : "text-[var(--buddio-text-secondary)]",
            )}
          >
            {error ? (
              <>
                <WarningCircle size={12} weight="fill" />
                {t("pad.outputUnavailable")}
              </>
            ) : (
              formatDuration(clip.durationMs)
            )}
          </p>
        </div>
        <HotkeyChip value={clip.hotkey} />
      </div>

      <Waveform peaks={clip.peaks} playing={playing} className="h-8" />

      <div className="flex items-center justify-end">
        <button
          type="button"
          aria-label={playing ? t("inspector.stop") : t("inspector.play")}
          aria-pressed={playing}
          onClick={(e) => {
            e.stopPropagation();
            onPlayToggle();
          }}
          className={cn(
            "flex size-9 items-center justify-center rounded-full transition-[background,color,transform] duration-[var(--duration-hover)] ease-[var(--ease-enter)] active:scale-95",
            error
              ? "bg-[color-mix(in_oklab,var(--buddio-danger)_16%,transparent)] text-[var(--buddio-danger)]"
              : playing
                ? "bg-[var(--buddio-brand)] text-white btn-primary-shadow"
                : "bg-[var(--buddio-surface-secondary)] text-[var(--buddio-text)] group-hover:bg-[var(--buddio-brand)] group-hover:text-white",
          )}
        >
          {error ? (
            <WarningCircle size={16} weight="fill" />
          ) : playing ? (
            <Pause size={16} weight="fill" />
          ) : (
            <Play size={16} weight="fill" className="translate-x-[1px]" />
          )}
        </button>
      </div>
    </article>
  );
}
