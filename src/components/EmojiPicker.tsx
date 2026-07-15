import { CaretDown, MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

const EMOJIS = [
  ["🔊", "Som"], ["🎵", "Música"], ["😂", "Risada"], ["👏", "Aplausos"],
  ["📣", "Alerta"], ["🎮", "Jogo"], ["🎙️", "Voz"], ["🥁", "Batida"],
  ["😮", "Surpresa"], ["❤️", "Favorito"], ["🔥", "Destaque"], ["✨", "Efeito"],
] as const;

type Props = {
  value: string;
  onChange: (emoji: string) => void;
  label?: string;
  searchPlaceholder?: string;
};

export function EmojiPicker({
  value,
  onChange,
  label = "Escolher emoji",
  searchPlaceholder = "Buscar emoji",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term
      ? EMOJIS.filter(([emoji, name]) => `${emoji} ${name}`.toLocaleLowerCase().includes(term))
      : EMOJIS;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
  }, [open]);

  const select = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3 text-left outline-none transition-colors hover:border-[var(--buddio-brand-border)] focus:border-[var(--buddio-brand)]"
      >
        <span className="flex items-center gap-2"><span className="text-[20px] leading-none">{value}</span><span className="text-[12px] text-[var(--buddio-text-secondary)]">{label}</span></span>
        <CaretDown size={14} className="text-[var(--buddio-text-muted)]" />
      </button>

      {open ? (
        <div role="dialog" aria-label={label} className="absolute z-30 mt-2 w-[300px] rounded-[14px] border border-[var(--buddio-border)] bg-[var(--buddio-window)] p-2 shadow-[var(--shadow-modal)]">
          <label className="flex h-9 items-center gap-2 rounded-[9px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-2 text-[var(--buddio-text-muted)]">
            <MagnifyingGlass size={15} />
            <input
              ref={searchRef}
              type="search"
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--buddio-text)] outline-none placeholder:text-[var(--buddio-text-muted)]"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setOpen(false); return; }
                if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
                if (event.key === "Enter" && filtered[activeIndex]) { event.preventDefault(); select(filtered[activeIndex][0]); }
              }}
            />
          </label>
          {filtered.length ? (
            <div role="listbox" className="mt-2 grid grid-cols-6 gap-1" aria-label={label}>
              {filtered.map(([emoji, name], index) => (
                <button
                  key={emoji}
                  type="button"
                  role="option"
                  aria-label={name}
                  aria-selected={emoji === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(emoji)}
                  className={`flex size-10 items-center justify-center rounded-[9px] text-[20px] outline-none transition-colors ${index === activeIndex ? "bg-[var(--buddio-brand-soft)] ring-1 ring-[var(--buddio-brand-border)]" : "hover:bg-[var(--buddio-surface)]"}`}
                >{emoji}</button>
              ))}
            </div>
          ) : <p className="px-2 py-5 text-center text-[12px] text-[var(--buddio-text-muted)]">Nenhum emoji encontrado.</p>}
        </div>
      ) : null}
    </div>
  );
}
