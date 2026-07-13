import { useEffect, useId, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (value: string) => void | Promise<void>;
};

/** Modal nativo Buddio: substitui window.prompt do WebView/Edge. */
export function PromptModal({
  open,
  title,
  description,
  label,
  placeholder,
  confirmLabel = "Criar",
  initialValue = "",
  onClose,
  onConfirm,
}: Props) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
      setSaving(false);
    }
  }, [open, initialValue]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Informe um nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      closeOnEsc={!saving}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "Salvando…" : confirmLabel}
          </Button>
        </>
      }
    >
      <label htmlFor={inputId} className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-[var(--buddio-text-secondary)]">
          {label}
        </span>
        <input
          id={inputId}
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          className="h-10 rounded-[var(--radius-control)] border border-[var(--buddio-border)] bg-[var(--buddio-window)] px-3 text-[13px] text-[var(--buddio-text)] outline-none focus-visible:shadow-[0_0_0_2px_var(--buddio-brand-border)]"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-[var(--buddio-danger)]">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
