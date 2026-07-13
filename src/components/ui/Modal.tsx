import { X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeOnEsc?: boolean;
};

const EXIT_MS = 150;

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
  closeOnEsc = true,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const handle = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(handle);
  }, [open, mounted]);

  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEsc, onClose]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]",
        open ? "animate-overlay-in" : "animate-overlay-out",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          "max-h-[min(90vh,880px)] w-full max-w-[560px] overflow-y-auto rounded-[var(--radius-panel)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5 shadow-[var(--shadow-modal)] outline-none",
          open ? "animate-modal-in" : "animate-modal-out",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="modal-title"
              className="text-[22px] font-bold text-[var(--buddio-text)]"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            className="h-8 w-8 px-0"
            aria-label="Fechar"
            onClick={onClose}
            icon={<X size={16} />}
          />
        </div>
        <div>{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
