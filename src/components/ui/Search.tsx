import { MagnifyingGlass } from "@phosphor-icons/react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  onClear?: () => void;
};

export function Search({ className, onClear, value, ...rest }: Props) {
  return (
    <label
      className={cn(
        "relative flex h-[42px] min-w-[12rem] flex-1 items-center rounded-[14px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3",
        className,
      )}
    >
      <MagnifyingGlass
        size={18}
        weight="bold"
        className="shrink-0 text-[var(--buddio-text-secondary)]"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        className="ml-2 w-full bg-transparent text-[13px] text-[var(--buddio-text)] outline-none placeholder:text-[var(--buddio-text-muted)]"
        {...rest}
      />
      {value && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 text-[11px] text-[var(--buddio-text-muted)] hover:text-[var(--buddio-text)]"
        >
          Limpar
        </button>
      ) : null}
    </label>
  );
}
