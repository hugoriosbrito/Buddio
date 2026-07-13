import { useEffect, useMemo, useState } from "react";
import { playClip, stopAll, stopClip } from "../lib/api";
import { useLibraryStore } from "../stores/libraryStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { useUiStore, type AppView } from "../stores/uiStore";
import { Modal } from "./ui/Modal";
import { Search } from "./ui/Search";

const VIEWS: Array<{ id: AppView; label: string }> = [
  { id: "soundboard", label: "Ir para Soundboard" },
  { id: "library", label: "Ir para Biblioteca" },
  { id: "profiles", label: "Ir para Perfis" },
  { id: "routing", label: "Ir para Roteamento" },
  { id: "settings", label: "Ir para Configurações" },
];

export function CommandPalette() {
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
      { id: "stop-all", label: "Parar todos os sons", run: () => void stopAll() },
      {
        id: "diagnostics",
        label: "Abrir diagnóstico",
        run: () => setDiagnosticsOpen(true),
      },
      ...VIEWS.map((v) => ({
        id: `view-${v.id}`,
        label: v.label,
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
          label: playingIds.has(c.id) ? `Parar “${c.name}”` : `Tocar “${c.name}”`,
          run: async () => {
            if (playingIds.has(c.id)) await stopClip(c.id);
            else await playClip(c.id);
          },
        })),
    ];
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [clips, playingIds, query, setDiagnosticsOpen, setView]);

  return (
    <Modal
      open={open}
      title="Command palette"
      description="Busque sons, navegue e execute ações. Atalho: Ctrl+K"
      onClose={() => setOpen(false)}
      className="max-w-[520px]"
    >
      <Search
        autoFocus
        placeholder="Buscar…"
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
            Nenhum resultado
          </li>
        ) : null}
      </ul>
    </Modal>
  );
}
