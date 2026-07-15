import { useEffect, useState, type MouseEvent } from "react";
import { useT } from "../i18n";

/** True if the clip emoji field holds an image URL (custom pad icon). */
export function isIconUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  return /^https?:\/\//i.test(v) || v.startsWith("data:image/");
}

export function ClipIcon({
  emoji,
  fallbackEmoji,
  size = 28,
  className,
  onClick,
}: {
  emoji?: string | null;
  fallbackEmoji?: string | null;
  size?: number;
  className?: string;
  onClick?: (e: MouseEvent) => void;
}) {
  const t = useT();
  const value = emoji?.trim() || null;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [value]);

  if (value && isIconUrl(value) && !imageFailed) {
    return (
      <button
        type="button"
        aria-label={t("inspector.play")}
        className={className}
        onClick={onClick}
        style={{ width: size, height: size }}
      >
        <img
          src={value}
          alt=""
          className="size-full rounded-md object-cover"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      </button>
    );
  }

  const displayValue = imageFailed
    ? fallbackEmoji?.trim() || "♫"
    : value || "♫";

  if (onClick) {
    return (
      <button
        type="button"
        aria-label={t("inspector.play")}
        className={className}
        onClick={onClick}
        style={{ fontSize: Math.round(size * 0.65), lineHeight: 1 }}
      >
        {displayValue}
      </button>
    );
  }

  return (
    <span
      className={className}
      aria-hidden
      style={{ fontSize: Math.round(size * 0.65), lineHeight: 1 }}
    >
      {displayValue}
    </span>
  );
}
