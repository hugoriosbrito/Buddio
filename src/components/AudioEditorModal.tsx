import { useEffect, useState, type ChangeEvent } from "react";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { Waveform } from "./Waveform";
import { useLibraryStore } from "../stores/libraryStore";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";
import * as api from "../lib/api";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function AudioEditorModal() {
  const editorClipId = useUiStore((s) => s.editorClipId);
  const setEditorClipId = useUiStore((s) => s.setEditorClipId);
  const clips = useLibraryStore((s) => s.clips);
  const select = useLibraryStore((s) => s.select);
  const pushToast = useToastStore((s) => s.push);

  const clip = clips.find((c) => c.id === editorClipId) ?? null;
  const open = Boolean(editorClipId);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [gainDb, setGainDb] = useState(0);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clip) return;
    setTrimStart(clip.trimStartMs ?? 0);
    setTrimEnd(clip.trimEndMs ?? clip.durationMs);
    setFadeIn(clip.fadeInMs ?? 0);
    setFadeOut(clip.fadeOutMs ?? 0);
    setGainDb(clip.gainDb ?? 0);
    setName(clip.name);
    setError(null);
  }, [clip]);

  if (!editorClipId) return null;

  if (!clip) {
    return (
      <Modal
        open
        title="Editor de áudio"
        description="O som selecionado não foi encontrado."
        onClose={() => setEditorClipId(null)}
      >
        <p className="text-[13px] text-[var(--buddio-text-secondary)]">
          Feche e selecione outro clip no soundboard.
        </p>
      </Modal>
    );
  }

  const duration = Math.max(clip.durationMs, 1);
  const trimmedLen = Math.max(Math.abs(trimEnd - trimStart), 1);

  const persistPayload = () => ({
    name: name.trim() || clip.name,
    trimStartMs: Math.round(Math.min(trimStart, trimEnd)),
    trimEndMs: Math.round(Math.max(trimStart, trimEnd)),
    fadeInMs: Math.round(clamp(fadeIn, 0, trimmedLen)),
    fadeOutMs: Math.round(clamp(fadeOut, 0, trimmedLen)),
    gainDb: clamp(gainDb, -12, 12),
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateClip(clip.id, persistPayload());
      useLibraryStore.setState({
        clips: useLibraryStore
          .getState()
          .clips.map((c) => (c.id === updated.id ? updated : c)),
      });
      select(updated.id);
      pushToast({ kind: "success", message: "Edições salvas." });
      setEditorClipId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushToast({
        kind: "error",
        message: `Falha ao salvar: ${message}`,
        sticky: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const testPlay = async () => {
    setError(null);
    try {
      await api.updateClip(clip.id, persistPayload());
      const nextClips = await api.listClips();
      useLibraryStore.setState({ clips: nextClips });
      await api.playClip(clip.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  };

  return (
    <Modal
      open={open}
      title="Editor de áudio"
      description="Ajuste o som sem alterar o arquivo original."
      onClose={() => setEditorClipId(null)}
      className="max-w-[720px]"
      footer={
        <>
          <Button variant="secondary" onClick={() => setEditorClipId(null)}>
            Descartar
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <input
            className="w-full rounded-[8px] bg-transparent px-1 py-0.5 text-[17px] font-bold outline-none focus-visible:shadow-[0_0_0_2px_var(--buddio-brand-border)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nome do som"
          />
          <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
            {clip.ext.toUpperCase()} · {(clip.durationMs / 1000).toFixed(1)}s
            {" · "}
            Trim {(Math.min(trimStart, trimEnd) / 1000).toFixed(2)}s–
            {(Math.max(trimStart, trimEnd) / 1000).toFixed(2)}s
          </p>
          <div className="mt-3 overflow-hidden rounded-[14px] bg-[var(--buddio-window)] p-3">
            <Waveform
              peaks={clip.peaks}
              className="h-20"
              interactive
              durationMs={duration}
              trimStartMs={trimStart}
              trimEndMs={trimEnd}
              fadeInMs={fadeIn}
              fadeOutMs={fadeOut}
              gainDb={gainDb}
              onTrimChange={(start, end) => {
                setTrimStart(start);
                setTrimEnd(end);
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--buddio-text-muted)]">
            Arraste as barras na onda para definir início e fim do trim.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            label="Fade in"
            unit="ms"
            value={fadeIn}
            min={0}
            max={Math.min(3000, trimmedLen)}
            step={10}
            onChange={setFadeIn}
          />
          <NumberField
            label="Fade out"
            unit="ms"
            value={fadeOut}
            min={0}
            max={Math.min(3000, trimmedLen)}
            step={10}
            onChange={setFadeOut}
          />
          <NumberField
            label="Gain"
            unit="dB"
            value={gainDb}
            min={-12}
            max={12}
            step={0.5}
            decimals={1}
            onChange={setGainDb}
          />
        </div>

        <Button variant="secondary" onClick={() => void testPlay()}>
          Testar reprodução
        </Button>
        {error ? (
          <p role="alert" className="text-[13px] text-[var(--buddio-danger)]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step,
  decimals = 0,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (value: number) => void;
}) {
  const display =
    decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(",", "."));
    if (Number.isNaN(parsed)) {
      onChange(clamp(value, min, max));
      return;
    }
    onChange(clamp(parsed, min, max));
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseFloat(e.target.value.replace(",", "."));
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed, min, max));
  };

  return (
    <label className="flex flex-col gap-1.5 text-[13px]">
      <span className="text-[var(--buddio-text-secondary)]">{label}</span>
      <span className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--buddio-border)] bg-[var(--buddio-window)] px-3 focus-within:shadow-[0_0_0_2px_var(--buddio-brand-border)]">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={display}
          aria-label={label}
          className="h-10 w-full min-w-0 bg-transparent text-[13px] font-semibold outline-none tabular-nums"
          onChange={onInput}
          onBlur={(e) => commit(e.target.value)}
        />
        <span className="shrink-0 text-[12px] text-[var(--buddio-text-muted)]">
          {unit}
        </span>
      </span>
    </label>
  );
}
