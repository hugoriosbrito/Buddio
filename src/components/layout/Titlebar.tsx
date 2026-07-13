import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowSquareOut, Minus, Square, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import * as api from "../../lib/api";
import { useToastStore } from "../../stores/toastStore";

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized).catch(() => undefined);
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized).catch(() => undefined);
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, []);

  const run = async (action: "minimize" | "toggle" | "close") => {
    try {
      const win = getCurrentWindow();
      if (action === "minimize") await win.minimize();
      else if (action === "toggle") await win.toggleMaximize();
      else await win.close();
    } catch {
      /* browser preview */
    }
  };

  const openMini = () => {
    void api.showMiniWindow().catch((err: unknown) =>
      push({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  };

  return (
    <header className="drag-region relative flex h-[var(--titlebar-h)] shrink-0 items-center border-b border-[var(--buddio-border-subtle)] bg-[var(--buddio-window)] px-3">
      <p className="pointer-events-none absolute inset-x-0 text-center text-[12px] font-medium text-[var(--buddio-text-secondary)]">
        Buddio
      </p>
      <div className="no-drag ml-auto flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Abrir Buddio Mini"
          title="Buddio Mini"
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)] hover:text-[var(--buddio-brand)]"
          onClick={openMini}
        >
          <ArrowSquareOut size={14} weight="bold" />
        </button>
        <button
          type="button"
          aria-label="Minimizar"
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)]"
          onClick={() => void run("minimize")}
        >
          <Minus size={14} weight="bold" />
        </button>
        <button
          type="button"
          aria-label={maximized ? "Restaurar" : "Maximizar"}
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)]"
          onClick={() => void run("toggle")}
        >
          <Square size={12} weight="bold" />
        </button>
        <button
          type="button"
          aria-label="Fechar"
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-danger)] hover:text-white"
          onClick={() => void run("close")}
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </header>
  );
}
