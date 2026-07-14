import { useEffect, useMemo, useState } from "react";
import { useT, type MessageKey } from "../i18n";
import { playClip, stopAll, stopClip } from "../lib/api";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { useUiStore, type AppView } from "../stores/uiStore";
import { Modal } from "./ui/Modal";
import { Search } from "./ui/Search";

const VIEW_KEYS: Array<{ id: AppView; key: MessageKey }> = [
  { id: "soundboard", key: "palette.goSoundboard" },
  { id: "library", key: "palette.goLibrary" },
  { id: "profiles", key: "palette.goProfiles" },
  { id: "routing", key: "palette.goRouting" },
  { id: "settings", key: "palette.goSettings" },
];

export function CommandPalette() {
  const t = useT();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const setView = useUiStore((s) => s.setView);
  const setDiagnosticsOpen = useUiStore((s) => s.setDiagnosticsOpen);
  const clips = useLibraryStore((s) => s.clips);
  const playingIds = usePlaybackStore((s) => s.playingIds);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions = [
      {
        id: "stop-all",
        label: t("palette.stopAll"),
        run: () => void stopAll(),
      },
      {
        id: "diagnostics",
        label: t("palette.openDiagnostics"),
        run: () => setDiagnosticsOpen(true),
      },
      ...VIEW_KEYS.map((v) => ({
        id: `view-${v.id}`,
        label: t(v.key),
        run: () => setView(v.id),
      })),
      ...clips
        .filter(
          (c) =>
            !q ||
            c.name.toLowerCase().includes(q) ||
            (c.hotkey?.toLowerCase().includes(q) ?? false),
        )
        .slice(0, 12)
        .map((c) => ({
          id: `clip-${c.id}`,
          label: playingIds.has(c.id)
            ? t("palette.stopClip", { name: c.name })
            : t("palette.playClip", { name: c.name }),
          run: async () => {
            if (playingIds.has(c.id)) await stopClip(c.id);
            else await playClip(c.id);
          },
        })),
    ];
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [clips, playingIds, query, setDiagnosticsOpen, setView, t]);

  return (
    <Modal
      open={open}
      title={t("palette.title")}
      description={t("palette.description")}
      onClose={() => setOpen(false)}
      className="max-w-[520px]"
    >
      <Search
        autoFocus
        placeholder={t("palette.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
      />
      <ul className="mt-3 max-h-[320px] overflow-y-auto">
        {results.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full items-center rounded-[10px] px-3 py-2.5 text-left text-[13px] hover:bg-[var(--buddio-surface-selected)]"
              onClick={() => {
                void item.run();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
        {results.length === 0 ? (
          <li className="px-3 py-6 text-center text-[13px] text-[var(--buddio-text-secondary)]">
            {t("palette.noResults")}
          </li>
        ) : null}
      </ul>
    </Modal>
  );
}
