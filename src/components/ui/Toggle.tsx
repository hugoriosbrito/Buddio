import { cn } from "../../lib/cn";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
};

export function Toggle({ checked, onChange, label, disabled, id }: Props) {
  const toggleId = id ?? `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label
      htmlFor={toggleId}
      className={cn(
        "flex items-center justify-between gap-3 text-[13px] text-[var(--buddio-text)]",
        disabled && "opacity-50",
      )}
    >
      <span>{label}</span>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "inline-flex h-[22px] w-[36px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-[var(--duration-hover)]",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--buddio-window),0_0_0_4px_var(--buddio-brand)]",
          checked
            ? "justify-end bg-[var(--buddio-brand)]"
            : "justify-start bg-[var(--buddio-border)]",
        )}
      >
        <span className="pointer-events-none block size-[18px] rounded-full bg-white shadow transition-transform duration-[var(--duration-hover)] ease-[var(--ease-enter)]" />
      </button>
    </label>
  );
}
