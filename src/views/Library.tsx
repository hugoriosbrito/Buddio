import { FolderPlus, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ClipIcon } from "../components/ClipIcon";
import { ImportDropzone } from "../components/ImportDropzone";
import { Button } from "../components/ui/Button";
import { HotkeyChip } from "../components/ui/HotkeyChip";
import { Search } from "../components/ui/Search";
import { localizeSeedName, useT } from "../i18n";
import { cn } from "../lib/cn";
import type { ClipDto, WatchedFolderDto } from "../lib/api";
import {
  addWatchedFolder,
  listWatchedFolders,
  playClip,
  removeWatchedFolder,
  setWatchedFolderEnabled,
  stopClip,
} from "../lib/api";
import { useCollectionsStore } from "../stores/collectionsStore";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { useUiStore } from "../stores/uiStore";

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function folderLabel(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function LibraryView() {
  const t = useT();
  const query = useLibraryStore((s) => s.query);
  const setQuery = useLibraryStore((s) => s.setQuery);
  const importFiles = useLibraryStore((s) => s.importFiles);
  const importFolder = useLibraryStore((s) => s.importFolder);
  const hydrate = useLibraryStore((s) => s.hydrate);
  const error = useLibraryStore((s) => s.error);
  const notice = useLibraryStore((s) => s.notice);
  const clearError = useLibraryStore((s) => s.clearError);
  const setNotice = useLibraryStore((s) => s.setNotice);
  const clips = useLibraryStore((s) => s.clips);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const select = useLibraryStore((s) => s.select);
  const remove = useLibraryStore((s) => s.remove);
  const loading = useLibraryStore((s) => s.loading);
  const collections = useCollectionsStore((s) => s.collections);
  const collectionId = useUiStore((s) => s.selectedCollectionId);
  const setSelectedCollectionId = useUiStore((s) => s.setSelectedCollectionId);
  const playingIds = usePlaybackStore((s) => s.playingIds);

  const [watched, setWatched] = useState<WatchedFolderDto[]>([]);
  const [watchedBusy, setWatchedBusy] = useState(false);

  const refreshWatched = useCallback(async () => {
    try {
      setWatched(await listWatchedFolders());
    } catch (err) {
      useLibraryStore.setState({ error: String(err) });
    }
  }, []);

  useEffect(() => {
    void refreshWatched();
  }, [refreshWatched]);

  const activeCollection = collections.find((c) => c.id === collectionId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clips.filter((c) => {
      if (collectionId && !c.collectionIds.includes(collectionId)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.hotkey?.toLowerCase().includes(q) ?? false) ||
        c.ext.toLowerCase().includes(q)
      );
    });
  }, [clips, query, collectionId]);

  const withHotkey = clips.filter((c) => c.hotkey).length;
  const withoutHotkey = clips.length - withHotkey;
  const selected = clips.find((c) => c.id === selectedId) ?? null;

  const onAddWatched = async () => {
    setWatchedBusy(true);
    try {
      await addWatchedFolder(null, collectionId);
      await refreshWatched();
      await hydrate();
      setNotice(t("library.watchedAdded"));
    } catch (err) {
      useLibraryStore.setState({ error: String(err) });
    } finally {
      setWatchedBusy(false);
    }
  };

  const onRemoveWatched = async (id: string) => {
    setWatchedBusy(true);
    try {
      await removeWatchedFolder(id);
      await refreshWatched();
    } catch (err) {
      useLibraryStore.setState({ error: String(err) });
    } finally {
      setWatchedBusy(false);
    }
  };

  const onToggleWatched = async (folder: WatchedFolderDto) => {
    setWatchedBusy(true);
    try {
      await setWatchedFolderEnabled(folder.id, !folder.enabled);
      await refreshWatched();
    } catch (err) {
      useLibraryStore.setState({ error: String(err) });
    } finally {
      setWatchedBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-[var(--space-gap)] overflow-hidden px-[var(--space-pad-x)] py-[var(--space-pad-y)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[length:var(--heading-size)] font-bold leading-none">{t("library.title")}</h1>
          <p className="mt-2 text-[13px] text-[var(--buddio-text-secondary)]">
            {t("library.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Search
            placeholder={t("common.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="w-[240px] flex-none"
          />
          <Button
            variant="secondary"
            icon={<FolderPlus size={16} weight="bold" />}
            onClick={() => void importFolder(null)}
          >
            {t("library.importFolder")}
          </Button>
          <ImportDropzone
            onImport={importFiles}
            compact
            label={t("library.importFiles")}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t("library.allSounds")} value={clips.length} />
        <StatCard label={t("library.withHotkey")} value={withHotkey} />
        <StatCard label={t("library.withoutHotkey")} value={withoutHotkey} />
      </div>

      <section className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold">{t("library.watchedFolders")}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--buddio-text-secondary)]">
              {t("library.watchedHint")}
            </p>
          </div>
          <Button
            variant="secondary"
            icon={<FolderPlus size={16} weight="bold" />}
            loading={watchedBusy}
            onClick={() => void onAddWatched()}
          >
            {t("library.addFolder")}
          </Button>
        </div>
        {watched.length === 0 ? (
          <p className="mt-3 text-[12px] text-[var(--buddio-text-muted)]">
            {t("library.noWatchedFolders")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {watched.map((folder) => (
              <li
                key={folder.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[var(--buddio-border-subtle)] bg-[var(--buddio-surface-secondary)]/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    {folderLabel(folder.path)}
                    {!folder.enabled ? (
                      <span className="ml-2 text-[11px] font-medium text-[var(--buddio-text-muted)]">
                        {t("library.paused")}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[11px] text-[var(--buddio-text-secondary)]">
                    {folder.path}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    disabled={watchedBusy}
                    onClick={() => void onToggleWatched(folder)}
                  >
                    {folder.enabled ? t("library.pause") : t("library.enable")}
                  </Button>
                  <Button
                    variant="danger"
                    icon={<Trash size={16} weight="bold" />}
                    disabled={watchedBusy}
                    onClick={() => void onRemoveWatched(folder.id)}
                  >
                    {t("library.remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={collectionId === null}
          onClick={() => setSelectedCollectionId(null)}
        >
          {t("library.all")}
        </FilterChip>
        {collections.map((c) => {
          const count = clips.filter((clip) =>
            clip.collectionIds.includes(c.id),
          ).length;
          return (
            <FilterChip
              key={c.id}
              active={collectionId === c.id}
              onClick={() => setSelectedCollectionId(c.id)}
            >
              {localizeSeedName(c.name, t)}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </FilterChip>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--buddio-danger)]">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("common.close")}
          </button>
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="text-[13px] text-[var(--buddio-text-secondary)]"
        >
          {notice}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setNotice(null)}
          >
            {t("common.close")}
          </button>
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && clips.length === 0 ? (
          <p className="text-[13px] text-[var(--buddio-text-secondary)]">
            {t("library.loading")}
          </p>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--buddio-border)] px-6 text-center">
            {collectionId && clips.length > 0 ? (
              <>
                <p className="text-[22px] font-bold">
                  {t("library.emptyCollection", {
                    name: activeCollection?.name ?? "",
                  })}
                </p>
                <p className="mt-2 max-w-sm text-[13px] text-[var(--buddio-text-secondary)]">
                  {t("library.emptyCollectionHint", { count: clips.length })}
                </p>
                <Button
                  variant="primary"
                  className="mt-4"
                  onClick={() => setSelectedCollectionId(null)}
                >
                  {t("library.viewAll")}
                </Button>
              </>
            ) : (
              <>
                <p className="text-[22px] font-bold">{t("library.emptyTitle")}</p>
                <p className="mt-2 max-w-sm text-[13px] text-[var(--buddio-text-secondary)]">
                  {t("library.emptyHint")}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="buddio-scroll min-h-0 flex-1 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)]">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="sticky top-0 z-[1] bg-[var(--buddio-surface)]">
                  <tr className="border-b border-[var(--buddio-border-subtle)] text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--buddio-text-muted)]">
                    <th className="px-4 py-3 font-semibold">{t("library.name")}</th>
                    <th className="px-3 py-3 font-semibold">{t("library.duration")}</th>
                    <th className="px-3 py-3 font-semibold">{t("library.hotkey")}</th>
                    <th className="px-3 py-3 font-semibold">{t("library.collection")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((clip) => (
                    <LibraryRow
                      key={clip.id}
                      clip={clip}
                      selected={selectedId === clip.id}
                      playing={playingIds.has(clip.id)}
                      collectionName={
                        collections.find((c) =>
                          clip.collectionIds.includes(c.id),
                        )?.name ?? "—"
                      }
                      onSelect={() => select(clip.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {selected ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-4 py-3">
                <p className="min-w-0 truncate text-[13px]">
                  {t("library.selected", { name: selected.name })}
                </p>
                <Button
                  variant="danger"
                  icon={<Trash size={16} weight="bold" />}
                  onClick={() => void remove(selected.id)}
                >
                  {t("common.delete")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryRow({
  clip,
  selected,
  playing,
  collectionName,
  onSelect,
}: {
  clip: ClipDto;
  selected: boolean;
  playing: boolean;
  collectionName: string;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className={cn(
        "cursor-pointer border-b border-[var(--buddio-border-subtle)] last:border-none",
        selected
          ? "bg-[var(--buddio-surface-selected)]"
          : "hover:bg-[var(--buddio-surface-secondary)]/60",
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <ClipIcon
            emoji={clip.emoji}
            size={32}
            className="shrink-0 overflow-hidden rounded-md"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              void (playing ? stopClip(clip.id) : playClip(clip.id));
            }}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {clip.name}
              {clip.ext ? `.${clip.ext}` : ""}
            </p>
            <p className="text-[11px] text-[var(--buddio-text-secondary)]">
              {clip.ext.toUpperCase()} · 48 kHz
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 tabular-nums text-[var(--buddio-text-secondary)]">
        {formatDuration(clip.durationMs)}
      </td>
      <td className="px-3 py-3">
        <HotkeyChip value={clip.hotkey} />
      </td>
      <td className="px-3 py-3 text-[var(--buddio-text-secondary)]">
        {collectionName}
      </td>
    </tr>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-semibold transition-colors",
        active
          ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand-deep)]"
          : "border-[var(--buddio-border)] bg-[var(--buddio-surface)] text-[var(--buddio-text-secondary)] hover:border-[var(--buddio-brand-border)]",
      )}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-4 py-3">
      <p className="text-[12px] text-[var(--buddio-text-secondary)]">{label}</p>
      <p className="mt-1 text-[24px] font-bold leading-none">{value}</p>
    </div>
  );
}
