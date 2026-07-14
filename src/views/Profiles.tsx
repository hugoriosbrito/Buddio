import { Check, Copy, Plus } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../components/ui/Button";
import { PromptModal } from "../components/ui/PromptModal";
import { Search } from "../components/ui/Search";
import { Select } from "../components/ui/Select";
import { localizeSeedName, useT } from "../i18n";
import { cn } from "../lib/cn";
import * as api from "../lib/api";
import { useCollectionsStore } from "../stores/collectionsStore";
import { useProfilesStore } from "../stores/profilesStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useToastStore } from "../stores/toastStore";

export function ProfilesView() {
  const t = useT();
  const profiles = useProfilesStore((s) => s.profiles);
  const loading = useProfilesStore((s) => s.loading);
  const error = useProfilesStore((s) => s.error);
  const create = useProfilesStore((s) => s.create);
  const apply = useProfilesStore((s) => s.apply);
  const remove = useProfilesStore((s) => s.remove);
  const hydrate = useProfilesStore((s) => s.hydrate);
  const activeId = useSettingsStore((s) => s.settings.activeProfileId);
  const devices = useSettingsStore((s) => s.devices);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const collections = useCollectionsStore((s) => s.collections);
  const push = useToastStore((s) => s.push);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => p.name.toLowerCase().includes(q));
  }, [profiles, query]);

  const selected =
    filtered.find((p) => p.id === selectedId) ??
    filtered.find((p) => p.id === activeId) ??
    filtered[0] ??
    null;

  const isActive = (id: string) =>
    id === activeId || (!activeId && profiles.find((p) => p.id === id)?.isDefault);

  const secondaryOptions = [
    { value: "", label: t("profiles.notDefined") },
    ...devices.map((d) => ({ value: d.name, label: d.name })),
  ];
  const monitorOptions = [
    { value: "", label: t("common.systemDefault") },
    ...devices.map((d) => ({ value: d.name, label: d.name })),
  ];
  const collectionOptions = [
    { value: "", label: t("common.none") },
    ...collections.map((c) => ({
      value: c.id,
      label: localizeSeedName(c.name, t),
    })),
  ];

  const saveSelected = async () => {
    if (!selected) return;
    try {
      await api.updateProfile(selected.id, {
        secondaryDevice: selected.secondaryDevice,
        monitorDevice: selected.monitorDevice,
        monitorEnabled: selected.monitorEnabled,
        collectionId: selected.collectionId,
      });
      await apply(selected.id);
      await hydrate();
      await hydrateSettings();
      push({ kind: "success", message: t("profiles.saved") });
    } catch (err) {
      push({ kind: "error", message: String(err) });
    }
  };

  const duplicateSelected = async () => {
    if (!selected) return;
    try {
      await create(t("profiles.copySuffix", { name: selected.name }));
    } catch (err) {
      push({ kind: "error", message: String(err) });
    }
  };

  return (
    <div className="buddio-scroll h-full overflow-y-auto px-[var(--space-pad-x)] py-[var(--space-pad-y)]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[length:var(--heading-size)] font-bold leading-none">{t("profiles.title")}</h1>
          <p className="mt-2 text-[13px] text-[var(--buddio-text-secondary)]">
            {t("profiles.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Search
            placeholder={t("common.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="w-[220px] flex-none"
          />
          <Button
            variant="primary"
            icon={<Plus size={16} weight="bold" />}
            onClick={() => setCreateOpen(true)}
          >
            {t("profiles.new")}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 text-[13px] text-[var(--buddio-danger)]">{error}</p>
      ) : null}

      {loading && profiles.length === 0 ? (
        <p className="text-[13px] text-[var(--buddio-text-secondary)]">
          {t("profiles.loading")}
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
          <section>
            <p className="mb-3 text-[13px] font-semibold text-[var(--buddio-text-secondary)]">
              {t("profiles.yours")}
            </p>
            <div className="flex flex-col gap-2">
              {filtered.map((p, index) => {
                const active = isActive(p.id);
                const focused = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(p.id);
                      if (!active) void apply(p.id);
                    }}
                    className={cn(
                      "rounded-[14px] border px-4 py-3 text-left transition-colors",
                      focused || active
                        ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)] border-l-[3px] border-l-[var(--buddio-brand)]"
                        : "border-[var(--buddio-border)] bg-[var(--buddio-surface)] hover:bg-[var(--buddio-surface-secondary)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[15px] font-bold">
                        {localizeSeedName(p.name, t)}
                      </h2>
                      <span
                        className={cn(
                          "font-mono text-[12px] font-semibold",
                          active
                            ? "text-[var(--buddio-brand)]"
                            : "text-[var(--buddio-text-muted)]",
                        )}
                      >
                        Ctrl+{index + 1}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
                      {(p.secondaryDevice ?? t("profiles.noOutput"))} ·{" "}
                      {p.monitorEnabled
                        ? (p.monitorDevice ?? t("profiles.monitorDefault"))
                        : t("profiles.monitorOff")}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--buddio-text-muted)]">
                      {p.collectionId
                        ? localizeSeedName(
                            collections.find((c) => c.id === p.collectionId)
                              ?.name ?? "",
                            t,
                          ) || t("profiles.oneCollection")
                        : t("profiles.noStartCollection")}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {selected ? (
            <section className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
              <div className="mb-4">
                <h2 className="text-[17px] font-bold">
                  {t("profiles.heading", {
                    name: localizeSeedName(selected.name, t),
                  })}
                </h2>
                {isActive(selected.id) ? (
                  <p className="mt-1 text-[12px] font-semibold text-[var(--buddio-success)]">
                    {t("profiles.activeConfig")}
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
                    {t("profiles.clickToActivate")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 text-[13px]">
                <Field label={t("profiles.output")}>
                  <Select
                    aria-label={t("profiles.output")}
                    value={selected.secondaryDevice ?? ""}
                    options={secondaryOptions}
                    onChange={(next) => {
                      void api
                        .updateProfile(selected.id, {
                          secondaryDevice: next || null,
                        })
                        .then(() => hydrate());
                    }}
                  />
                </Field>
                <Field label={t("profiles.monitor")}>
                  <Select
                    aria-label={t("profiles.monitor")}
                    value={selected.monitorDevice ?? ""}
                    options={monitorOptions}
                    onChange={(next) => {
                      void api
                        .updateProfile(selected.id, {
                          monitorDevice: next || null,
                          monitorEnabled: true,
                        })
                        .then(() => hydrate());
                    }}
                  />
                </Field>
                <Field label={t("profiles.mic")}>
                  <Select
                    aria-label={t("profiles.mic")}
                    value="system"
                    options={[
                      {
                        value: "system",
                        label: t("routing.systemMic"),
                      },
                    ]}
                    onChange={() => undefined}
                  />
                </Field>
                <Field label={t("profiles.startCollection")}>
                  <Select
                    aria-label={t("profiles.startCollection")}
                    value={selected.collectionId ?? ""}
                    options={collectionOptions}
                    onChange={(next) => {
                      void api
                        .updateProfile(selected.id, {
                          collectionId: next || null,
                        })
                        .then(() => hydrate());
                    }}
                  />
                </Field>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <p className="text-[13px] font-semibold text-[var(--buddio-text-secondary)]">
                  {t("profiles.mixing")}
                </p>
                <Field label={t("profiles.micMode")}>
                  <Select
                    aria-label={t("profiles.micMode")}
                    value={selected.micRouteMode}
                    options={[
                      { value: "mix", label: t("profiles.micMode.mix") },
                      { value: "ducking", label: t("settings.micMode.ducking") },
                      { value: "soundOnly", label: t("settings.micMode.soundOnly") },
                    ]}
                    onChange={(next) => {
                      void api
                        .updateProfile(selected.id, {
                          micRouteMode: next as
                            | "mix"
                            | "ducking"
                            | "soundOnly",
                        })
                        .then(() => hydrate());
                    }}
                  />
                </Field>
                <Field label={t("routing.ducking")}>
                  <Select
                    aria-label={t("routing.ducking")}
                    value={String(selected.duckingDb)}
                    options={[
                      { value: "0", label: "0 dB" },
                      { value: "-8", label: "-8 dB" },
                      { value: "-12", label: "-12 dB" },
                    ]}
                    onChange={(next) => {
                      void api
                        .updateProfile(selected.id, {
                          duckingDb: Number(next),
                        })
                        .then(() => hydrate());
                    }}
                  />
                </Field>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  icon={<Check size={16} weight="bold" />}
                  onClick={() => void saveSelected()}
                >
                  {t("profiles.saveChanges")}
                </Button>
                <Button
                  variant="secondary"
                  icon={<Copy size={16} weight="bold" />}
                  onClick={() => void duplicateSelected()}
                >
                  {t("profiles.duplicate")}
                </Button>
                {!selected.isDefault ? (
                  <Button variant="danger" onClick={() => void remove(selected.id)}>
                    {t("common.delete")}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <PromptModal
        open={createOpen}
        title={t("profiles.new")}
        description={t("profiles.description")}
        label={t("profiles.nameLabel")}
        placeholder={t("profiles.namePlaceholder")}
        confirmLabel={t("profiles.create")}
        onClose={() => setCreateOpen(false)}
        onConfirm={(name) => create(name)}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[var(--buddio-text-secondary)]">{label}</span>
      {children}
    </div>
  );
}
