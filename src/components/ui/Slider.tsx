import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  label: string;
  value: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
};

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  formatValue = (v) => `${Math.round(v * 100)}%`,
  className,
  disabled,
  ...rest
}: Props) {
  const pct =
    ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;

  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-[var(--buddio-text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--buddio-text)]">
          {formatValue(Number(value))}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--buddio-surface-secondary)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--buddio-accent)]"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent accent-[var(--buddio-accent)]"
          {...rest}
        />
      </div>
    </label>
  );
}
