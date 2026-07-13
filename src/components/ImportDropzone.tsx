import { ArrowUp, UploadSimple } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";

type Props = {
  onImport: (paths: string[] | null) => Promise<void>;
  compact?: boolean;
  /** Large dashed dropzone matching onboarding / library mocks. */
  variant?: "default" | "hero";
  label?: string;
};

export function ImportDropzone({
  onImport,
  compact,
  variant = "default",
  label,
}: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        const kind = event.payload.type;
        if (kind === "enter" || kind === "over") setActive(true);
        else if (kind === "leave") setActive(false);
        else if (kind === "drop") {
          setActive(false);
          const paths = event.payload.paths ?? [];
          if (paths.length > 0) void onImport(paths);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onImport]);

  const onPick = useCallback(() => {
    void onImport(null);
  }, [onImport]);

  if (compact) {
    return (
      <Button
        variant="primary"
        icon={<UploadSimple size={16} weight="bold" />}
        onClick={onPick}
      >
        {label ?? "Importar áudio"}
      </Button>
    );
  }

  if (variant === "hero") {
    return (
      <div
        data-no-drag
        className={cn(
          "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed px-6 py-12 text-center transition-[border,background,transform] duration-[140ms] ease-[var(--ease-enter)]",
          active
            ? "scale-[1.01] border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)]"
            : "border-[var(--buddio-border)] bg-[var(--buddio-surface)]",
        )}
      >
        <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand)]">
          <ArrowUp size={22} weight="bold" />
        </span>
        <p className="text-[16px] font-bold">Arraste um áudio para cá</p>
        <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
          MP3, WAV, FLAC, OGG ou M4A · até 2 GB
        </p>
        <Button
          variant="secondary"
          className="mt-5"
          onClick={onPick}
        >
          {label ?? "Selecionar arquivo"}
        </Button>
      </div>
    );
  }

  return (
    <div
      data-no-drag
      className={cn(
        "flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-dashed px-4 py-4 transition-[border,background,transform] duration-[140ms] ease-[var(--ease-enter)]",
        active
          ? "scale-[1.01] border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)]"
          : "border-[var(--buddio-border)] bg-[var(--buddio-surface)]",
      )}
    >
      <div>
        <p className="text-[14px] font-semibold">Solte áudios aqui</p>
        <p className="text-[12px] text-[var(--buddio-text-secondary)]">
          WAV, MP3, FLAC, OGG, M4A · ou escolha arquivos
        </p>
      </div>
      <Button
        variant="primary"
        icon={<UploadSimple size={16} weight="bold" />}
        onClick={onPick}
      >
        {label ?? "Importar"}
      </Button>
    </div>
  );
}
