import type { MouseEvent } from "react";

/** True if the clip emoji field holds an image URL (custom pad icon). */
export function isIconUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  return /^https?:\/\//i.test(v) || v.startsWith("data:image/");
}

export function ClipIcon({
  emoji,
  size = 28,
  className,
  onClick,
}: {
  emoji?: string | null;
  size?: number;
  className?: string;
  onClick?: (e: MouseEvent) => void;
}) {
  const value = emoji?.trim() || null;
  if (value && isIconUrl(value)) {
    return (
      <button
        type="button"
        aria-label="Tocar"
        className={className}
        onClick={onClick}
        style={{ width: size, height: size }}
      >
        <img
          src={value}
          alt=""
          className="size-full rounded-md object-cover"
          draggable={false}
        />
      </button>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        aria-label="Tocar"
        className={className}
        onClick={onClick}
        style={{ fontSize: Math.round(size * 0.65), lineHeight: 1 }}
      >
        {value ?? "♪"}
      </button>
    );
  }

  return (
    <span
      className={className}
      aria-hidden
      style={{ fontSize: Math.round(size * 0.65), lineHeight: 1 }}
    >
      {value ?? "♪"}
    </span>
  );
}
