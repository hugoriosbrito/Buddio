import { Check, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import type { ClipDto, ImportResult } from "../lib/api";
import { useCollectionsStore } from "../stores/collectionsStore";
import { useLibraryStore } from "../stores/libraryStore";
import { useUiStore } from "../stores/uiStore";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { Select } from "./ui/Select";
import { Toggle } from "./ui/Toggle";

type Draft = {
  name: string;
  hotkey: string | null;
  collectionId: string | null;
  iconUrl: string;
};

export function ImportReviewModal() {
  const open = useUiStore((s) => s.importReviewOpen);
  const setOpen = useUiStore((s) => s.setImportReviewOpen);
  const review = useUiStore((s) => s.importReview);
  const setReview = useUiStore((s) => s.setImportReview);
  const collections = useCollectionsStore((s) => s.collections);
  const hydrate = useLibraryStore((s) => s.hydrate);
  const select = useLibraryStore((s) => s.select);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoHotkeys, setAutoHotkeys] = useState(true);

  const imported = review?.imported ?? [];

  useEffect(() => {
    if (!open || !review) return;
    let cancelled = false;

    // Fresh batch: rebuild drafts from imported clips.
    const base: Record<string, Draft> = {};
    for (const clip of review.imported) {
      base[clip.id] = {
        name: clip.name,
        hotkey: clip.hotkey,
        collectionId: clip.collectionIds[0] ?? null,
        iconUrl:
          clip.emoji &&
          (/^https?:\/\//i.test(clip.emoji) ||
            clip.emoji.startsWith("data:image/"))
            ? clip.emoji
            : "",
      };
    }
    setDrafts(base);
    setActiveId(review.imported[0]?.id ?? null);
    setError(null);

    if (!autoHotkeys) return;

    void (async () => {
      const need = review.imported.filter((c) => !c.hotkey).length;
      if (need === 0) return;
      let suggested: string[] = [];
      try {
        suggested = await api.suggestAutoHotkeys(need);
      } catch {
        return;
      }
      if (cancelled || suggested.length === 0) return;

      setDrafts((prev) => {
        const next = { ...prev };
        let i = 0;
        for (const clip of review.imported) {
          if (!clip.hotkey && suggested[i] && next[clip.id]) {
            next[clip.id] = { ...next[clip.id], hotkey: suggested[i] };
            i += 1;
          }
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [open, review]);

  // Toggle only remaps hotkeys; keep name / collection / icon edits.
  useEffect(() => {
    if (!open || !review) return;
    let cancelled = false;

    if (!autoHotkeys) {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const clip of review.imported) {
          if (!next[clip.id]) continue;
          next[clip.id] = { ...next[clip.id], hotkey: clip.hotkey };
        }
        return next;
      });
      return;
    }

    void (async () => {
      const need = review.imported.filter((c) => !c.hotkey).length;
      if (need === 0) return;
      let suggested: string[] = [];
      try {
        suggested = await api.suggestAutoHotkeys(need);
      } catch {
        return;
      }
      if (cancelled || suggested.length === 0) return;
      setDrafts((prev) => {
        const next = { ...prev };
        let i = 0;
        for (const clip of review.imported) {
          if (!clip.hotkey && suggested[i] && next[clip.id]) {
            next[clip.id] = { ...next[clip.id], hotkey: suggested[i] };
            i += 1;
          }
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
    // intentionally only autoHotkeys — open/review handled above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHotkeys]);

  const active = useMemo(
    () => imported.find((c) => c.id === activeId) ?? null,
    [imported, activeId],
  );
  const activeDraft = activeId ? drafts[activeId] : null;

  const readyCount = imported.length;
  const attention =
    (review?.duplicates.length ?? 0) + (review?.errors.length ?? 0);

  const close = () => {
    setOpen(false);
    setReview(null);
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const clip of imported) {
        const draft = drafts[clip.id];
        if (!draft) continue;
        if (draft.name.trim() && draft.name.trim() !== clip.name) {
          await api.updateClip(clip.id, { name: draft.name.trim() });
        }
        const icon = draft.iconUrl.trim();
        const nextEmoji = icon || null;
        if (nextEmoji !== clip.emoji) {
          await api.updateClip(clip.id, { emoji: nextEmoji });
        }
        if (draft.hotkey !== clip.hotkey) {
          await api.setClipHotkey(clip.id, draft.hotkey);
        }
        if (draft.collectionId) {
          await api.setClipCollections(clip.id, [draft.collectionId]);
        } else if (clip.collectionIds.length > 0) {
          await api.setClipCollections(clip.id, []);
        }
      }
      await hydrate();
      const collectionId = useUiStore.getState().selectedCollectionId;
      void api.syncIndexHotkeys(collectionId).catch(() => {
        /* ignore */
      });
      if (imported[0]) select(imported[0].id);
      close();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !review) return null;

  return (
    <Modal
      open={open}
      title="Revisar importação"
      description="Confirme nome, atalho e coleção antes de concluir."
      onClose={close}
      className="max-w-[920px]"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Depois
          </Button>
          <Button
            variant="primary"
            icon={<Check size={16} weight="bold" />}
            onClick={() => void finish()}
            disabled={saving || readyCount === 0}
          >
            {saving ? "Salvando…" : "Concluir importação"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-[16px] border border-[var(--buddio-border)] bg-[var(--buddio-window)] p-4">
          <p className="text-[14px] font-semibold">
            {imported.length} arquivo{imported.length === 1 ? "" : "s"} importado
            {imported.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
            {readyCount} prontos
            {attention > 0 ? ` · ${attention} precisam de atenção` : ""}
          </p>

          <div className="mt-3 rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3 py-2">
            <Toggle
              label="Atribuir atalhos automaticamente"
              checked={autoHotkeys}
              onChange={setAutoHotkeys}
            />
            <p className="mt-1 text-[11px] text-[var(--buddio-text-muted)]">
              Sugere atalhos livres (Ctrl+Alt+N após F1–F12, que o Windows costuma rejeitar).
            </p>
          </div>

          <ul className="mt-4 flex flex-col gap-2">
            {imported.map((clip) => (
              <ImportRow
                key={clip.id}
                clip={clip}
                active={clip.id === activeId}
                name={drafts[clip.id]?.name ?? clip.name}
                onSelect={() => setActiveId(clip.id)}
              />
            ))}
          </ul>

          {review.duplicates.length > 0 || review.errors.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-[var(--buddio-border)] pt-4">
              {review.duplicates.map((name) => (
                <p
                  key={`dup-${name}`}
                  className="flex items-center gap-2 text-[12px] text-[var(--buddio-warning)]"
                >
                  <WarningCircle size={14} weight="fill" />
                  Duplicado ignorado: {name}
                </p>
              ))}
              {review.errors.map((msg) => (
                <p
                  key={`err-${msg}`}
                  className="flex items-center gap-2 text-[12px] text-[var(--buddio-danger)]"
                >
                  <WarningCircle size={14} weight="fill" />
                  {msg}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-[16px] border border-[var(--buddio-border)] bg-[var(--buddio-window)] p-4">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--buddio-text-muted)]">
            RESUMO
          </p>
          <p className="mt-3 text-[34px] font-bold leading-none">{readyCount}</p>
          <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
            arquivos prontos
          </p>

          {active && activeDraft ? (
            <div className="mt-5 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="text-[var(--buddio-text-secondary)]">Nome</span>
                <input
                  className="h-10 rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3 outline-none focus:border-[var(--buddio-brand)]"
                  value={activeDraft.name}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [active.id]: { ...activeDraft, name: e.target.value },
                    }))
                  }
                />
              </label>

              <HotkeyRecorder
                label="Atalho global"
                value={activeDraft.hotkey}
                onChange={(hotkey) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [active.id]: { ...activeDraft, hotkey },
                  }))
                }
              />

              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="text-[var(--buddio-text-secondary)]">
                  URL do ícone
                </span>
                <input
                  className="h-10 rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3 outline-none focus:border-[var(--buddio-brand)]"
                  placeholder="https://… ou deixe vazio"
                  value={activeDraft.iconUrl}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [active.id]: {
                        ...activeDraft,
                        iconUrl: e.target.value,
                      },
                    }))
                  }
                />
                {activeDraft.iconUrl.trim() ? (
                  <span className="mt-1 flex items-center gap-2">
                    <img
                      src={activeDraft.iconUrl.trim()}
                      alt=""
                      className="size-10 rounded-md object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity =
                          "0.3";
                      }}
                    />
                    <span className="text-[11px] text-[var(--buddio-text-muted)]">
                      Prévia do ícone (clique no ícone toca o som)
                    </span>
                  </span>
                ) : null}
              </label>

              <div className="flex flex-col gap-1.5 text-[13px]">
                <span className="text-[var(--buddio-text-secondary)]">Coleção</span>
                <Select
                  aria-label="Coleção"
                  value={activeDraft.collectionId ?? ""}
                  options={[
                    { value: "", label: "Nenhuma" },
                    ...collections.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  onChange={(next) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [active.id]: {
                        ...activeDraft,
                        collectionId: next || null,
                      },
                    }))
                  }
                />
              </div>
            </div>
          ) : (
            <p className="mt-5 text-[13px] text-[var(--buddio-text-secondary)]">
              Nenhum arquivo novo para revisar.
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--buddio-danger)]">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function ImportRow({
  clip,
  active,
  name,
  onSelect,
}: {
  clip: ClipDto;
  active: boolean;
  name: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "flex w-full items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)]"
          : "border-[var(--buddio-border)] bg-[var(--buddio-surface)] hover:border-[var(--buddio-brand-border)]/60",
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold">{name}</p>
        <p className="text-[11px] text-[var(--buddio-text-secondary)]">
          {clip.ext.toUpperCase()} · {Math.max(1, Math.round(clip.durationMs / 100) / 10)}s
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--buddio-success)_18%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--buddio-text)]">
        Pronto
      </span>
    </button>
  );
}

/** Helper type re-export for store wiring */
export type { ImportResult };
