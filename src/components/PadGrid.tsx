import { useMemo } from "react";
import { useT } from "../i18n";
import { playClip, stopClip } from "../lib/api";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { useUiStore } from "../stores/uiStore";
import { PadCard } from "./PadCard";
import { filterSmartCollection, type SmartCollectionId } from "../lib/smartCollections";

type Props = {
  emptyTitle?: string;
  emptyBody?: string;
};

export function PadGrid({ emptyTitle, emptyBody }: Props) {
  const t = useT();
  const clips = useLibraryStore((s) => s.clips);
  const query = useLibraryStore((s) => s.query);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const loading = useLibraryStore((s) => s.loading);
  const select = useLibraryStore((s) => s.select);
  const playingIds = usePlaybackStore((s) => s.playingIds);
  const usage = usePlaybackStore((s) => s.usage);
  const errors = usePlaybackStore((s) => s.errors);
  const markError = usePlaybackStore((s) => s.markError);
  const collectionId = useUiStore((s) => s.selectedCollectionId);

  const resolvedEmptyTitle = emptyTitle ?? t("pad.emptyTitle");
  const resolvedEmptyBody = emptyBody ?? t("pad.emptyBody");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const smartId = collectionId?.startsWith("smart:")
      ? (collectionId.slice(6) as SmartCollectionId)
      : null;
    const source = smartId ? filterSmartCollection(clips, smartId, new Map(Object.entries(usage))) : clips;
    return source.filter((c) => {
      if (collectionId && !c.collectionIds.includes(collectionId)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.hotkey?.toLowerCase().includes(q) ?? false) ||
        (c.emoji?.includes(q) ?? false)
      );
    });
  }, [clips, query, collectionId, usage]);

  if (loading && clips.length === 0) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center text-sm text-[var(--buddio-text-secondary)]">
        {t("library.loading")}
      </div>
    );
  }

  if (filtered.length === 0) {
    const collectionEmpty = Boolean(collectionId) && clips.length > 0;
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--buddio-border)] px-6 text-center">
        <p className="text-[22px] font-bold text-[var(--buddio-text)]">
          {collectionEmpty ? t("pad.collectionEmpty") : resolvedEmptyTitle}
        </p>
        <p className="mt-2 max-w-sm text-[13px] text-[var(--buddio-text-secondary)]">
          {collectionEmpty
            ? t("pad.collectionEmptyHint", { count: clips.length })
            : resolvedEmptyBody}
        </p>
        {collectionEmpty ? (
          <button
            type="button"
            className="mt-4 text-[13px] font-semibold text-[var(--buddio-brand)] underline"
            onClick={() => useUiStore.getState().setSelectedCollectionId(null)}
          >
            {t("library.viewAll")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-[var(--space-gap)] sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((clip) => {
        const playing = playingIds.has(clip.id);
        return (
          <PadCard
            key={clip.id}
            clip={clip}
            selected={selectedId === clip.id}
            playing={playing}
            error={errors[clip.id]}
            onSelect={() => select(clip.id)}
            onPlayToggle={async () => {
              select(clip.id);
              try {
                if (playing) await stopClip(clip.id);
                else await playClip(clip.id);
              } catch (err) {
                markError(clip.id, String(err));
              }
            }}
          />
        );
      })}
    </div>
  );
}
