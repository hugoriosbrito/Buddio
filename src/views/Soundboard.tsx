import type { ReactNode } from "react";
import { useState } from "react";
import { Plus, Stop } from "@phosphor-icons/react";
import { localizeSeedName, useT } from "../i18n";
import { stopAll } from "../lib/api";
import { ImportDropzone } from "../components/ImportDropzone";
import { PadGrid } from "../components/PadGrid";
import { Button } from "../components/ui/Button";
import { PromptModal } from "../components/ui/PromptModal";
import { Search } from "../components/ui/Search";
import { useCollectionsStore } from "../stores/collectionsStore";
import { useLibraryStore } from "../stores/libraryStore";
import { useUiStore } from "../stores/uiStore";
import { cn } from "../lib/cn";

export function SoundboardView() {
  const t = useT();
  const query = useLibraryStore((s) => s.query);
  const setQuery = useLibraryStore((s) => s.setQuery);
  const importFiles = useLibraryStore((s) => s.importFiles);
  const error = useLibraryStore((s) => s.error);
  const clearError = useLibraryStore((s) => s.clearError);
  const collections = useCollectionsStore((s) => s.collections);
  const create = useCollectionsStore((s) => s.create);
  const selectedCollectionId = useUiStore((s) => s.selectedCollectionId);
  const setSelectedCollectionId = useUiStore((s) => s.setSelectedCollectionId);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-[var(--space-gap)] overflow-hidden px-[var(--space-pad-x)] py-[var(--space-pad-y)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[length:var(--heading-size)] font-bold leading-none">
            {t("soundboard.title")}
          </h1>
          <p className="mt-2 text-[13px] text-[var(--buddio-text-secondary)]">
            {t("soundboard.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Search
            placeholder={t("common.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="w-[240px] flex-none"
          />
          <ImportDropzone onImport={importFiles} compact />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={<Stop size={16} weight="fill" />}
          onClick={() => void stopAll()}
        >
          {t("soundboard.stopAll")}
        </Button>
        <Button
          variant="ghost"
          icon={<Plus size={16} weight="bold" />}
          onClick={() => setCreateOpen(true)}
        >
          {t("nav.newCollection")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterPill
          active={selectedCollectionId === null}
          onClick={() => setSelectedCollectionId(null)}
        >
          {t("soundboard.all")}
        </FilterPill>
        {collections.map((c) => (
          <FilterPill
            key={c.id}
            active={selectedCollectionId === c.id}
            onClick={() => setSelectedCollectionId(c.id)}
          >
            {localizeSeedName(c.name, t)}
          </FilterPill>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[12px] border border-[var(--buddio-danger)]/30 bg-[color-mix(in_oklab,var(--buddio-danger)_10%,transparent)] px-3 py-2 text-[13px] text-[var(--buddio-danger)]"
        >
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("common.close")}
          </button>
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <PadGrid />
      </div>

      <PromptModal
        open={createOpen}
        title={t("soundboard.newCollectionTitle")}
        description={t("soundboard.collectionDesc")}
        label={t("soundboard.collectionName")}
        placeholder={t("soundboard.collectionPlaceholder")}
        confirmLabel={t("soundboard.createCollection")}
        onClose={() => setCreateOpen(false)}
        onConfirm={(name) => create(name)}
      />
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-[12px] font-semibold transition-colors",
        active
          ? "bg-[var(--buddio-text)] text-[var(--buddio-window)]"
          : "border border-[var(--buddio-border)] bg-[var(--buddio-surface)] text-[var(--buddio-text-secondary)] hover:text-[var(--buddio-text)]",
      )}
    >
      {children}
    </button>
  );
}
