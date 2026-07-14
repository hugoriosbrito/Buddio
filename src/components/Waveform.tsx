import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useT } from "../i18n";
import { cn } from "../lib/cn";

type Props = {
  peaks?: number[] | null;
  playing?: boolean;
  className?: string;
  /** Duração total do clip (ms). Necessário no modo interativo. */
  durationMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  gainDb?: number;
  /** Handles de trim + preview visual de fade/gain. */
  interactive?: boolean;
  onTrimChange?: (startMs: number, endMs: number) => void;
};

const PLACEHOLDER = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  return 0.22 + 0.58 * Math.abs(Math.sin(t * Math.PI * 3.2));
});

const MIN_TRIM_MS = 50;

function gainScale(gainDb: number): number {
  return Math.min(1.85, Math.max(0.15, Math.pow(10, gainDb / 20)));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function Waveform({
  peaks,
  playing,
  className,
  durationMs = 1,
  trimStartMs = 0,
  trimEndMs,
  fadeInMs = 0,
  fadeOutMs = 0,
  gainDb = 0,
  interactive = false,
  onTrimChange,
}: Props) {
  const t = useT();
  const bars = peaks && peaks.length > 0 ? peaks : PLACEHOLDER;
  const duration = Math.max(durationMs, 1);
  const endMs = trimEndMs ?? duration;
  const start = clamp(trimStartMs, 0, duration);
  const end = clamp(Math.max(start + MIN_TRIM_MS, endMs), 0, duration);
  const trimmedLen = Math.max(end - start, 1);
  const fadeIn = clamp(fadeInMs, 0, trimmedLen);
  const fadeOut = clamp(fadeOutMs, 0, trimmedLen);
  const scale = gainScale(gainDb);

  const startPct = (start / duration) * 100;
  const endPct = (end / duration) * 100;
  const fadeInPct = (fadeIn / duration) * 100;
  const fadeOutPct = (fadeOut / duration) * 100;

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<"start" | "end" | null>(null);

  const msFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * duration;
    },
    [duration],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const which = dragRef.current;
      if (!which || !onTrimChange) return;
      const ms = Math.round(msFromClientX(e.clientX));
      if (which === "start") {
        onTrimChange(clamp(ms, 0, end - MIN_TRIM_MS), end);
      } else {
        onTrimChange(start, clamp(ms, start + MIN_TRIM_MS, duration));
      }
    },
    [duration, end, msFromClientX, onTrimChange, start],
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  }, [onPointerMove]);

  const beginDrag = (which: "start" | "end") => (e: ReactPointerEvent) => {
    if (!interactive || !onTrimChange) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = which;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
  };

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative flex h-8 items-end gap-[2px] overflow-hidden",
        interactive && "select-none touch-none",
        className,
      )}
      aria-hidden={!interactive}
      role={interactive ? "group" : undefined}
      aria-label={interactive ? "Forma de onda com trim" : undefined}
    >
      {bars.map((v, i) => {
        const barCenter = ((i + 0.5) / bars.length) * duration;
        const inTrim = barCenter >= start && barCenter <= end;
        const distFromStart = barCenter - start;
        const distFromEnd = end - barCenter;
        let fadeMul = 1;
        if (inTrim && fadeIn > 0 && distFromStart < fadeIn) {
          fadeMul = clamp(distFromStart / fadeIn, 0, 1);
        }
        if (inTrim && fadeOut > 0 && distFromEnd < fadeOut) {
          fadeMul = Math.min(fadeMul, clamp(distFromEnd / fadeOut, 0, 1));
        }
        const heightPct = Math.max(
          8,
          Math.min(100, v * 100 * (inTrim ? scale * (0.35 + 0.65 * fadeMul) : 0.35)),
        );

        return (
          <span
            key={i}
            className={cn(
              "min-w-[2px] flex-1 rounded-sm transition-[height,background-color,opacity] duration-[var(--duration-default)]",
              !inTrim
                ? "bg-[var(--buddio-border)] opacity-40"
                : playing
                  ? interactive
                    ? "bg-[var(--buddio-accent)] opacity-100"
                    : "bg-[var(--buddio-brand)] opacity-100"
                  : fadeMul < 0.98
                    ? interactive
                      ? "bg-[var(--buddio-accent)] opacity-70"
                      : "bg-[var(--buddio-brand)] opacity-70"
                    : "bg-[var(--buddio-border)] opacity-90",
            )}
            style={{
              height: `${heightPct}%`,
              animation: playing
                ? `buddio-wave ${700 + (i % 5) * 80}ms ease-in-out ${i * 20}ms infinite alternate`
                : undefined,
            }}
          />
        );
      })}

      {interactive ? (
        <>
          {/* Região fora do trim (esquerda) */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--buddio-window)_55%,transparent)]"
            style={{ width: `${startPct}%` }}
          />
          {/* Região fora do trim (direita) */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 bg-[color-mix(in_oklab,var(--buddio-window)_55%,transparent)]"
            style={{ width: `${100 - endPct}%` }}
          />
          {/* Preview fade in */}
          {fadeIn > 0 ? (
            <div
              className="pointer-events-none absolute inset-y-0 bg-gradient-to-r from-[color-mix(in_oklab,var(--buddio-window)_70%,transparent)] to-transparent"
              style={{ left: `${startPct}%`, width: `${fadeInPct}%` }}
            />
          ) : null}
          {/* Preview fade out */}
          {fadeOut > 0 ? (
            <div
              className="pointer-events-none absolute inset-y-0 bg-gradient-to-l from-[color-mix(in_oklab,var(--buddio-window)_70%,transparent)] to-transparent"
              style={{ left: `${endPct - fadeOutPct}%`, width: `${fadeOutPct}%` }}
            />
          ) : null}

          {/* Handle início */}
          <button
            type="button"
            aria-label={t("waveform.trimStart")}
            className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0"
            style={{ left: `${startPct}%` }}
            onPointerDown={beginDrag("start")}
          >
            <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--buddio-accent)]" />
            <span className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 rounded-full border-2 border-[var(--buddio-accent)] bg-[var(--buddio-surface)]" />
          </button>

          {/* Handle fim */}
          <button
            type="button"
            aria-label={t("waveform.trimEnd")}
            className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none border-0 bg-transparent p-0"
            style={{ left: `${endPct}%` }}
            onPointerDown={beginDrag("end")}
          >
            <span className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-[var(--buddio-accent)]" />
            <span className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 rounded-full border-2 border-[var(--buddio-accent)] bg-[var(--buddio-surface)]" />
          </button>
        </>
      ) : null}
    </div>
  );
}
