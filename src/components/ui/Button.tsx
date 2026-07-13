import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--buddio-brand)] text-white border border-[var(--buddio-brand-deep)] btn-primary-shadow hover:brightness-105 active:scale-[0.98]",
  secondary:
    "bg-[var(--buddio-surface)] text-[var(--buddio-text)] border border-[var(--buddio-border)] btn-secondary-shadow hover:bg-[var(--buddio-surface-secondary)] active:scale-[0.98]",
  ghost:
    "bg-transparent text-[var(--buddio-text-secondary)] border border-transparent hover:bg-[var(--buddio-surface-secondary)] hover:text-[var(--buddio-text)]",
  danger:
    "bg-transparent text-[var(--buddio-danger)] border border-transparent hover:bg-[color-mix(in_oklab,var(--buddio-danger)_12%,transparent)]",
};

export function Button({
  variant = "secondary",
  loading,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-[var(--control-h)] items-center justify-center gap-2 rounded-[var(--radius-control)] px-3.5 text-[13px] font-semibold transition-[background,transform,filter,box-shadow] duration-[var(--duration-hover)] ease-[var(--ease-enter)] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--buddio-window),0_0_0_4px_var(--buddio-brand)]",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-4 animate-pulse rounded-full bg-current/40" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
