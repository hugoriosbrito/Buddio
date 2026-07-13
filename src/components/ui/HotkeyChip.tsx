import { cn } from "../../lib/cn";

type Props = {
  value: string | null | undefined;
  conflict?: boolean;
  className?: string;
  onClick?: () => void;
};

function displayHotkey(value: string): string {
  return value
    .replace(/CommandOrControl/gi, "Ctrl")
    .replace(/Control/gi, "Ctrl")
    .replace(/Meta/gi, "Ctrl");
}

export function HotkeyChip({ value, conflict, className, onClick }: Props) {
  if (!value) {
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center rounded-[var(--radius-hotkey)] border border-dashed border-[var(--buddio-border)] px-2 font-mono text-[11px] text-[var(--buddio-text-muted)]",
          className,
        )}
      >
        -
      </span>
    );
  }

  const Comp = onClick ? "button" : "span";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center rounded-[var(--radius-hotkey)] border px-2 font-mono text-[11px] font-semibold",
        conflict
          ? "border-[var(--buddio-danger)] bg-[color-mix(in_oklab,var(--buddio-danger)_12%,transparent)] text-[var(--buddio-danger)]"
          : "border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand-deep)]",
        className,
      )}
    >
      {displayHotkey(value)}
    </Comp>
  );
}
