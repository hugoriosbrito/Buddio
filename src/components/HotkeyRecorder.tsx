import { Keyboard } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resumeHotkeys, suspendHotkeys } from "../lib/api";
import { Button } from "./ui/Button";
import { HotkeyChip } from "./ui/HotkeyChip";
import { Modal } from "./ui/Modal";

type Props = {
  value: string | null;
  onChange: (hotkey: string | null) => Promise<void> | void;
  label?: string;
};

/**
 * Format using `e.code` (physical key), NOT `e.key`.
 * With Shift held, `e.key` becomes "!" / "@" / etc. and breaks
 * tauri-plugin-global-shortcut registration (UnsupportedKey).
 */
function formatChord(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const code = e.code;
  if (
    code === "ControlLeft" ||
    code === "ControlRight" ||
    code === "AltLeft" ||
    code === "AltRight" ||
    code === "ShiftLeft" ||
    code === "ShiftRight" ||
    code === "MetaLeft" ||
    code === "MetaRight"
  ) {
    return null;
  }

  let mapped: string;
  if (code.startsWith("Key") && code.length === 4) {
    mapped = code.slice(3); // KeyA → A
  } else if (code.startsWith("Digit") && code.length === 6) {
    mapped = code.slice(5); // Digit1 → 1
  } else if (code.startsWith("Numpad")) {
    mapped = code; // Numpad1, NumpadAdd, …
  } else if (/^F\d{1,2}$/.test(code)) {
    mapped = code;
  } else if (code === "Space") {
    mapped = "Space";
  } else if (code === "Escape") {
    mapped = "Escape";
  } else if (code === "ArrowUp") {
    mapped = "Up";
  } else if (code === "ArrowDown") {
    mapped = "Down";
  } else if (code === "ArrowLeft") {
    mapped = "Left";
  } else if (code === "ArrowRight") {
    mapped = "Right";
  } else if (code === "Tab") {
    mapped = "Tab";
  } else if (code === "Backspace") {
    mapped = "Backspace";
  } else if (code === "Enter" || code === "NumpadEnter") {
    mapped = code === "NumpadEnter" ? "NumpadEnter" : "Enter";
  } else {
    // Last resort: may be unsupported by the OS plugin
    mapped = code;
  }

  parts.push(mapped);
  return parts.join("+");
}

export function HotkeyRecorder({ value, onChange, label = "Atalho" }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = useRef(false);
  const suspendedRef = useRef(false);

  const stopRecording = useCallback(async () => {
    setRecording(false);
    armed.current = false;
    if (!suspendedRef.current) return;
    suspendedRef.current = false;
    try {
      await resumeHotkeys();
    } catch {
      /* ignore when not in tauri */
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setRecording(true);
    armed.current = true;
    try {
      await suspendHotkeys();
      suspendedRef.current = true;
    } catch {
      /* ignore when not in tauri */
    }
  }, []);

  // Always resume if this component unmounts while capture is active
  // (e.g. ImportReviewModal closed mid-capture).
  useEffect(() => {
    return () => {
      if (suspendedRef.current) {
        suspendedRef.current = false;
        void resumeHotkeys().catch(() => {
          /* ignore */
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        try {
          await onChange(null);
          setError(null);
        } catch (err) {
          setError(String(err));
          return;
        }
        await stopRecording();
        return;
      }

      // Bare keys (F12, letters, Escape) usually fail RegisterHotKey on Windows.
      // Prefer Ctrl/Alt/Shift chords.
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
      if (!hasModifier) {
        setError(
          "Use Ctrl, Alt ou Shift + tecla. Teclas sozinhas (ex.: F12) costumam falhar no Windows.",
        );
        return;
      }

      const chord = formatChord(e);
      if (!chord || !armed.current) return;

      try {
        await onChange(chord);
        setError(null);
        await stopRecording();
      } catch (err) {
        setError(String(err));
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange, stopRecording]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-[var(--buddio-text-muted)]">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <HotkeyChip value={value} />
        <Button variant="secondary" onClick={() => void startRecording()}>
          Capturar
        </Button>
        {value ? (
          <Button variant="ghost" onClick={() => void onChange(null)}>
            Limpar
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="animate-shake text-[12px] text-[var(--buddio-danger)]">{error}</p>
      ) : null}

      <Modal
        open={recording}
        title="Capturar atalho"
        description="Use Ctrl/Alt/Shift + tecla (ex.: Ctrl+Shift+1). Esc limpa o atalho."
        onClose={() => void stopRecording()}
        closeOnEsc={false}
      >
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand)] animate-pulse">
            <Keyboard size={28} weight="bold" />
          </div>
          <p className="text-[14px] font-semibold">Aguardando combinação…</p>
          <p className="max-w-sm text-center text-[12px] text-[var(--buddio-text-secondary)]">
            Teclas sozinhas como F12 ou Esc não funcionam bem no Windows.
          </p>
          <Button variant="secondary" onClick={() => void stopRecording()}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
