import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowSquareOut,
  Bell,
  Minus,
  Square,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import * as api from "../../lib/api";
import { useToastStore } from "../../stores/toastStore";
import { useUpdateStore } from "../../stores/updateStore";
import { cn } from "../../lib/cn";

export function Titlebar() {
  const t = useT();
  const [maximized, setMaximized] = useState(false);
  const push = useToastStore((s) => s.push);
  const available = useUpdateStore((s) => s.available);
  const setModalOpen = useUpdateStore((s) => s.setModalOpen);

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
        {available ? (
          <button
            type="button"
            aria-label={t("update.bellAria", { version: available.latest })}
            title={t("update.bellTitle", { version: available.latest })}
            className={cn(
              "relative flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)]",
              "hover:bg-[var(--buddio-surface-secondary)] hover:text-[var(--buddio-brand)]",
            )}
            onClick={() => setModalOpen(true)}
          >
            <Bell size={15} weight="fill" className="text-[var(--buddio-brand)]" />
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--buddio-danger)] ring-2 ring-[var(--buddio-window)] animate-update-badge"
            />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t("titlebar.openMini")}
          title="Buddio Mini"
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)] hover:text-[var(--buddio-brand)]"
          onClick={openMini}
        >
          <ArrowSquareOut size={14} weight="bold" />
        </button>
        <button
          type="button"
          aria-label={t("titlebar.minimize")}
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)]"
          onClick={() => void run("minimize")}
        >
          <Minus size={14} weight="bold" />
        </button>
        <button
          type="button"
          aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)]"
          onClick={() => void run("toggle")}
        >
          <Square size={12} weight="bold" />
        </button>
        <button
          type="button"
          aria-label={t("titlebar.close")}
          className="flex size-8 items-center justify-center rounded-md text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-danger)] hover:text-white"
          onClick={() => void run("close")}
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </header>
  );
}
