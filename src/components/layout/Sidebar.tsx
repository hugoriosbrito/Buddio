import {
  ArrowsLeftRight,
  Books,
  GearSix,
  Plus,
  SquaresFour,
  User,
} from "@phosphor-icons/react";
import { useState } from "react";
import markUrl from "../../assets/brand/mark.svg";
import { localizeSeedName, useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/cn";
import { useCollectionsStore } from "../../stores/collectionsStore";
import { useUiStore, type AppView } from "../../stores/uiStore";
import { PromptModal } from "../ui/PromptModal";

const NAV: Array<{
  id: AppView;
  labelKey: MessageKey;
  icon: typeof SquaresFour;
}> = [
  { id: "soundboard", labelKey: "nav.soundboard", icon: SquaresFour },
  { id: "library", labelKey: "nav.library", icon: Books },
  { id: "profiles", labelKey: "nav.profiles", icon: User },
  { id: "routing", labelKey: "nav.routing", icon: ArrowsLeftRight },
];

export function Sidebar() {
  const t = useT();
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const selectedCollectionId = useUiStore((s) => s.selectedCollectionId);
  const setSelectedCollectionId = useUiStore((s) => s.setSelectedCollectionId);
  const collections = useCollectionsStore((s) => s.collections);
  const create = useCollectionsStore((s) => s.create);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <aside className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-[var(--buddio-border-subtle)] bg-[var(--buddio-sidebar)]">
      <div className="flex items-center gap-3 px-[var(--sidebar-pad)] pb-2 pt-[var(--space-pad)]">
        <img
          src={markUrl}
          alt=""
          className="shrink-0"
          style={{
            width: "var(--brand-mark-size)",
            height: "var(--brand-mark-size)",
          }}
        />
        <span
          className="font-brand font-extrabold leading-none text-[var(--buddio-text)]"
          style={{ fontSize: "var(--brand-word-size)" }}
        >
          Budd<span className="text-[var(--buddio-brand)]">io</span>
        </span>
      </div>

      <nav className="mt-3 flex flex-col gap-1 px-2 sm:px-3">
        {NAV.map(({ id, labelKey, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setView(id)}
              className={cn(
                "relative flex h-[var(--nav-h)] items-center gap-3 rounded-[14px] px-3 text-left text-[14px] transition-colors duration-[var(--duration-hover)]",
                active
                  ? "bg-[var(--buddio-surface)] font-semibold text-[var(--buddio-text)]"
                  : "font-medium text-[var(--buddio-text)] hover:bg-[var(--buddio-surface)]/60",
              )}
            >
              {active ? (
                <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--buddio-brand)]" />
              ) : null}
              <Icon
                size={18}
                weight={active ? "fill" : "regular"}
                className={active ? "text-[var(--buddio-brand)]" : undefined}
              />
              {t(labelKey)}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[0.08em] text-[var(--buddio-text-muted)]">
            {t("nav.collections").toUpperCase()}
          </p>
          <button
            type="button"
            aria-label={t("nav.newCollection")}
            className="text-[var(--buddio-text-muted)] hover:text-[var(--buddio-brand)]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} weight="bold" />
          </button>
        </div>
        <ul className="flex flex-col gap-0.5">
          {collections.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedCollectionId(c.id);
                  if (view !== "soundboard" && view !== "library") {
                    setView("soundboard");
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-[13px]",
                  selectedCollectionId === c.id
                    ? "bg-[var(--buddio-surface-selected)] font-semibold"
                    : "hover:bg-[var(--buddio-surface)]/50",
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {localizeSeedName(c.name, t)}
                </span>
                <span className="tabular-nums text-[11px] text-[var(--buddio-text-secondary)]">
                  {c.clipCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-3 pb-4 pt-2">
        <button
          type="button"
          aria-current={view === "settings" ? "page" : undefined}
          onClick={() => setView("settings")}
          className={cn(
            "relative flex h-[var(--nav-h)] w-full items-center gap-3 rounded-[14px] px-3 text-[14px]",
            view === "settings"
              ? "bg-[var(--buddio-surface)] font-semibold"
              : "font-medium hover:bg-[var(--buddio-surface)]/60",
          )}
        >
          {view === "settings" ? (
            <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--buddio-brand)]" />
          ) : null}
          <GearSix size={18} weight={view === "settings" ? "fill" : "regular"} />
          {t("nav.settings")}
        </button>
      </div>

      <PromptModal
        open={createOpen}
        title={t("soundboard.newCollectionTitle")}
        label={t("soundboard.collectionName")}
        placeholder={t("soundboard.collectionPlaceholder")}
        confirmLabel={t("soundboard.createCollection")}
        onClose={() => setCreateOpen(false)}
        onConfirm={(name) => create(name)}
      />
    </aside>
  );
}
