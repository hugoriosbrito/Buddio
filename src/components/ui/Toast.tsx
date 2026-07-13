import { CheckCircle, Info, Warning, X, XCircle } from "@phosphor-icons/react";
import {
  TOAST_DURATION_MS,
  useToastStore,
  type ToastKind,
} from "../../stores/toastStore";
import { cn } from "../../lib/cn";

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle,
  info: Info,
  warning: Warning,
  error: XCircle,
};

const tones: Record<ToastKind, string> = {
  success: "border-[var(--buddio-success)]/40 text-[var(--buddio-text)]",
  info: "border-[var(--buddio-brand-border)] text-[var(--buddio-text)]",
  warning: "border-[var(--buddio-warning)]/50 text-[var(--buddio-text)]",
  error: "border-[var(--buddio-danger)]/50 text-[var(--buddio-danger)]",
};

const barTones: Record<ToastKind, string> = {
  success: "bg-[var(--buddio-success)]",
  info: "bg-[var(--buddio-brand)]",
  warning: "bg-[var(--buddio-warning)]",
  error: "bg-[var(--buddio-danger)]",
};

export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  if (!items.length) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-16 right-6 z-[60] flex w-[min(360px,calc(100%-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {items.map((item) => {
        const Icon = icons[item.kind];
        return (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto relative flex items-start gap-2 overflow-hidden rounded-[14px] border bg-[var(--buddio-surface)] px-3 py-2.5 shadow-[var(--shadow-modal)]",
              tones[item.kind],
              item.leaving ? "animate-toast-out" : "animate-toast-in",
            )}
          >
            <Icon size={18} weight="fill" className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug">{item.message}</p>
              {item.actionLabel && item.onAction ? (
                <button
                  type="button"
                  className="mt-1 text-[12px] font-semibold text-[var(--buddio-brand-deep)]"
                  onClick={() => {
                    item.onAction?.();
                    dismiss(item.id);
                  }}
                >
                  {item.actionLabel}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Fechar notificação"
              className="rounded-md p-0.5 text-[var(--buddio-text-muted)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--buddio-surface-secondary)] hover:text-[var(--buddio-text)]"
              onClick={() => dismiss(item.id)}
            >
              <X size={14} />
            </button>
            {!item.sticky ? (
              <span
                className={cn(
                  "absolute inset-x-0 bottom-0 h-[2px] origin-left opacity-50",
                  barTones[item.kind],
                )}
                style={{
                  animation: `buddio-toast-progress ${TOAST_DURATION_MS}ms linear both`,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
