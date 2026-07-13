import {
  ArrowsLeftRight,
  ArrowSquareOut,
  Lightning,
  Plus,
  SpeakerHigh,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  playClip,
  setClipCollections,
  stopClip,
} from "../../lib/api";
import { useCollectionsStore } from "../../stores/collectionsStore";
import { useLibraryStore } from "../../stores/libraryStore";
import { usePlaybackStore } from "../../stores/playbackStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { HotkeyRecorder } from "../HotkeyRecorder";
import { ClipIcon } from "../ClipIcon";
import { Waveform } from "../Waveform";
import { Button } from "../ui/Button";
import { HotkeyChip } from "../ui/HotkeyChip";
import { Select } from "../ui/Select";
import { Slider } from "../ui/Slider";
import { Toggle } from "../ui/Toggle";

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Inspector() {
  const view = useUiStore((s) => s.view);
  const clips = useLibraryStore((s) => s.clips);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const updateSelected = useLibraryStore((s) => s.updateSelected);
  const remove = useLibraryStore((s) => s.remove);
  const setHotkey = useLibraryStore((s) => s.setHotkey);
  const hydrate = useLibraryStore((s) => s.hydrate);
  const playingIds = usePlaybackStore((s) => s.playingIds);
  const collections = useCollectionsStore((s) => s.collections);
  const setEditorClipId = useUiStore((s) => s.setEditorClipId);
  const setInspectorOpen = useUiStore((s) => s.setInspectorOpen);
  const setDiagnosticsOpen = useUiStore((s) => s.setDiagnosticsOpen);
  const setView = useUiStore((s) => s.setView);
  const settings = useSettingsStore((s) => s.settings);
  const devices = useSettingsStore((s) => s.devices);
  const setOutputs = useSettingsStore((s) => s.setOutputs);

  const closeButton = (
    <button
      type="button"
      aria-label="Fechar painel de detalhes"
      className="rounded-md p-1 text-[var(--buddio-text-muted)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--buddio-surface-secondary)] hover:text-[var(--buddio-text)]"
      onClick={() => setInspectorOpen(false)}
    >
      <X size={14} />
    </button>
  );

  const clip = clips.find((c) => c.id === selectedId);
  const [nameDraft, setNameDraft] = useState(clip?.name ?? "");

  useEffect(() => {
    setNameDraft(clip?.name ?? "");
  }, [clip?.id, clip?.name]);

  useEffect(() => {
    if (!clip) return;
    if (nameDraft === clip.name) return;
    const handle = window.setTimeout(() => {
      void updateSelected({ name: nameDraft });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [nameDraft, clip, updateSelected]);

  if (!clip) {
    return (
      <aside className="animate-panel-in flex w-[var(--inspector-w)] shrink-0 flex-col border-l border-[var(--buddio-border-subtle)] bg-[var(--buddio-window)] p-[var(--space-pad)]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--buddio-text-muted)]">
            {view === "library" ? "ARQUIVO SELECIONADO" : "DETALHES DO SOM"}
          </p>
          {closeButton}
        </div>
        <p className="mt-4 text-[13px] text-[var(--buddio-text-secondary)]">
          {view === "library"
            ? "Selecione um arquivo na lista para ver detalhes."
            : "Selecione um som para editar nome, atalho, volume e comportamento."}
        </p>
      </aside>
    );
  }

  if (view === "library") {
    return (
      <aside className="animate-panel-in flex w-[var(--inspector-w)] shrink-0 flex-col gap-[var(--space-gap)] overflow-y-auto border-l border-[var(--buddio-border-subtle)] bg-[var(--buddio-window)] p-[var(--space-pad)]">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-bold">Arquivo selecionado</p>
          {closeButton}
        </div>
        <div className="flex items-start gap-3">
          <ClipIcon
            emoji={clip.emoji}
            size={40}
            className="shrink-0 overflow-hidden rounded-lg"
            onClick={() => {
              void (playingIds.has(clip.id)
                ? stopClip(clip.id)
                : playClip(clip.id));
            }}
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">
              {clip.name}.{clip.ext}
            </p>
            <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
              {formatDuration(clip.durationMs)} · {clip.ext.toUpperCase()}
            </p>
          </div>
        </div>
        <Waveform peaks={clip.peaks} className="h-12" />
        <div className="flex flex-col gap-2 text-[13px]">
          <MetaPair label="Formato" value={clip.ext.toUpperCase()} />
          <MetaPair label="Taxa" value="48 kHz" />
          <MetaPair label="Canais" value="Estéreo" />
          <MetaPair label="Local" value="Biblioteca Buddio" />
        </div>
          <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            className="w-full"
            icon={<Plus size={16} weight="bold" />}
            onClick={() => setView("soundboard")}
          >
            Adicionar ao soundboard
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            icon={<ArrowSquareOut size={16} weight="bold" />}
            onClick={() => setEditorClipId(clip.id)}
          >
            Abrir no editor
          </Button>
          <Button variant="danger" className="w-full" onClick={() => void remove(clip.id)}>
            Excluir
          </Button>
          <p className="pt-1 text-[11px] text-[var(--buddio-text-muted)]">
            Última modificação: {new Date(clip.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
      </aside>
    );
  }

  const playing = playingIds.has(clip.id);

  const secondaryOptions = [
    { value: "", label: "Não configurada" },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault ? `${d.name} (padrão)` : d.name,
    })),
  ];

  const monitorOptions = [
    { value: "", label: "Padrão do sistema" },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault ? `${d.name} (padrão)` : d.name,
    })),
  ];

  return (
    <aside className="animate-panel-in flex w-[var(--inspector-w)] shrink-0 flex-col gap-[var(--space-gap)] overflow-y-auto border-l border-[var(--buddio-border-subtle)] bg-[var(--buddio-window)] p-[var(--space-pad)]">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--buddio-text-muted)]">
            DETALHES DO SOM
          </p>
          {closeButton}
        </div>
        <div className="mt-3 flex items-start gap-3">
          <ClipIcon
            emoji={clip.emoji}
            size={40}
            className="shrink-0 overflow-hidden rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <input
              className="w-full rounded-[8px] bg-transparent px-1 py-0.5 text-[17px] font-bold text-[var(--buddio-text)] outline-none transition-[box-shadow] duration-[var(--duration-hover)] placeholder:text-[var(--buddio-text-muted)] focus-visible:bg-[var(--buddio-surface-secondary)] focus-visible:shadow-[0_0_0_2px_var(--buddio-brand-border)]"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              aria-label="Nome do som"
              placeholder="Nome do som"
            />
            <p className="mt-1 text-[11px] text-[var(--buddio-text-secondary)]">
              {formatDuration(clip.durationMs)} · {clip.ext.toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[13px] text-[var(--buddio-text-secondary)]">
          Atalho global
        </p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <HotkeyChip value={clip.hotkey} />
          {clip.hotkey ? (
            <span className="text-[11px] font-medium text-[var(--buddio-success)]">
              Ativo em segundo plano
            </span>
          ) : (
            <span className="text-[11px] text-[var(--buddio-warning)]">
              Sem atalho. Capture Ctrl+Shift+tecla
            </span>
          )}
        </div>
        <HotkeyRecorder
          value={clip.hotkey}
          onChange={(hotkey) => setHotkey(clip.id, hotkey)}
          label="Capturar atalho"
        />
      </div>

      <Slider
        label="Volume"
        value={clip.volume}
        onChange={(volume) => void updateSelected({ volume })}
      />

      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium text-[var(--buddio-text-secondary)]">
          Comportamento
        </p>
        <Toggle
          label="Reiniciar ao pressionar"
          checked={clip.restartOnPress}
          onChange={(restartOnPress) => void updateSelected({ restartOnPress })}
        />
        <Toggle
          label="Parar outros sons"
          checked={clip.stopOthers}
          onChange={(stopOthers) => void updateSelected({ stopOthers })}
        />
        <Toggle
          label="Repetir em loop"
          checked={clip.loopEnabled}
          onChange={(loopEnabled) => void updateSelected({ loopEnabled })}
        />
        <Toggle
          label="Fixar no Mini"
          checked={clip.pinned}
          onChange={(pinned) => void updateSelected({ pinned })}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium text-[var(--buddio-text-secondary)]">
          Saída
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--buddio-text-secondary)]">
            <Lightning size={12} weight="fill" className="text-[var(--buddio-brand)]" />
            Microfone virtual
          </span>
          <Select
            aria-label="Microfone virtual"
            value={settings.secondaryDevice ?? ""}
            options={secondaryOptions}
            onChange={(next) =>
              void setOutputs(
                settings.monitorEnabled,
                settings.monitorDevice,
                next || null,
              )
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--buddio-text-secondary)]">
            <SpeakerHigh size={12} weight="fill" />
            Monitor
          </span>
          <Select
            aria-label="Monitor"
            value={settings.monitorDevice ?? ""}
            options={monitorOptions}
            onChange={(next) =>
              void setOutputs(
                true,
                next || null,
                settings.secondaryDevice,
              )
            }
          />
        </div>
      </div>

      {collections.length > 0 ? (
        <div>
          <p className="mb-2 text-[13px] text-[var(--buddio-text-secondary)]">
            Coleções
          </p>
          <div className="flex flex-wrap gap-1.5">
            {collections.map((c) => {
              const active = clip.collectionIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? clip.collectionIds.filter((id) => id !== c.id)
                      : [...clip.collectionIds, c.id];
                    void setClipCollections(clip.id, next).then(() => hydrate());
                  }}
                  className={[
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    active
                      ? "border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand-deep)]"
                      : "border-[var(--buddio-border)] text-[var(--buddio-text-secondary)]",
                  ].join(" ")}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button
          variant="secondary"
          className="w-full"
          icon={<ArrowsLeftRight size={16} weight="bold" />}
          onClick={() => setDiagnosticsOpen(true)}
        >
          Testar roteamento
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="primary"
            onClick={async () => {
              try {
                if (playing) await stopClip(clip.id);
                else await playClip(clip.id);
              } catch (err) {
                useLibraryStore.setState({ error: String(err) });
              }
            }}
          >
            {playing ? "Parar" : "Tocar"}
          </Button>
          <Button variant="secondary" onClick={() => setEditorClipId(clip.id)}>
            Editor
          </Button>
        </div>
        <Button variant="danger" onClick={() => void remove(clip.id)}>
          Excluir
        </Button>
      </div>
    </aside>
  );
}

function MetaPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--buddio-text-secondary)]">{label}</span>
      <span className="truncate font-semibold">{value}</span>
    </div>
  );
}
