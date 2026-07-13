import { CaretDown, Check } from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

export type SelectOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  size?: "md" | "lg";
  "aria-label"?: string;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

/** Dropdown customizado: evita o menu nativo do WebView/Edge. */
export function Select({
  value,
  options,
  onChange,
  disabled,
  placeholder = "Selecionar",
  className,
  id,
  size = "md",
  "aria-label": ariaLabel,
}: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(280, preferBelow ? spaceBelow : spaceAbove);
    setPos({
      top: preferBelow ? rect.bottom + 6 : Math.max(8, rect.top - maxHeight - 6),
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, maxHeight),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const selectedIdx = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    setActiveIndex(selectedIdx);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        const opt = options[activeIndex];
        if (opt) pick(opt.value);
      } else {
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center gap-2 rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-window)] px-3 text-left text-[13px] text-[var(--buddio-text)] transition-[border,box-shadow,background] duration-[var(--duration-hover)]",
          size === "lg" ? "h-12" : "h-10",
          "hover:border-[var(--buddio-brand-border)]/70",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--buddio-window),0_0_0_4px_var(--buddio-brand)]",
          open && "border-[var(--buddio-brand-border)] shadow-[0_0_0_1px_var(--buddio-brand-border)]",
          disabled && "cursor-not-allowed opacity-45",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <CaretDown
          size={14}
          weight="bold"
          className={cn(
            "shrink-0 text-[var(--buddio-text-muted)] transition-transform duration-[var(--duration-hover)]",
            open && "rotate-180",
          )}
        />
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-activedescendant={`${listId}-opt-${activeIndex}`}
              className="buddio-scroll fixed z-[220] overflow-y-auto rounded-[14px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-1.5 shadow-[var(--shadow-modal)]"
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
              }}
            >
              {options.map((opt, index) => {
                const isSelected = opt.value === value;
                const isActive = index === activeIndex;
                return (
                  <li key={`${opt.value}-${index}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-opt-${index}`}
                      data-index={index}
                      aria-selected={isSelected}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors duration-[var(--duration-instant)]",
                        isActive || isSelected
                          ? "bg-[var(--buddio-surface-selected)] text-[var(--buddio-text)]"
                          : "text-[var(--buddio-text)] hover:bg-[var(--buddio-surface-secondary)]",
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(opt.value)}
                    >
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {isSelected ? (
                        <Check
                          size={14}
                          weight="bold"
                          className="shrink-0 text-[var(--buddio-brand)]"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
