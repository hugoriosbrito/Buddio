import {
  ArrowClockwise,
  ArrowSquareOut,
  Check,
  Desktop,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState, type ReactNode } from "react";
import { HotkeyRecorder } from "../components/HotkeyRecorder";
import { Button } from "../components/ui/Button";
import { Search } from "../components/ui/Search";
import { Select } from "../components/ui/Select";
import { Slider } from "../components/ui/Slider";
import { Toggle } from "../components/ui/Toggle";
import { LOCALES, useT, type Locale, type MessageKey } from "../i18n";
import * as api from "../lib/api";
import { cn } from "../lib/cn";
import {
  APP_VERSION,
  BUDDIO_GITHUB_REPO,
} from "../lib/updates";
import { useSettingsStore } from "../stores/settingsStore";
import {
  useUiStore,
  type AccentColor,
  type ThemeMode,
  type UiDensity,
} from "../stores/uiStore";
import { useToastStore } from "../stores/toastStore";
import { useHelpStore } from "../stores/helpStore";
import { useUpdateStore } from "../stores/updateStore";

type SettingsSection =
  | "general"
  | "audio"
  | "hotkeys"
  | "appearance"
  | "about";

const SECTION_IDS: SettingsSection[] = [
  "general",
  "audio",
  "hotkeys",
  "appearance",
  "about",
];

const ACCENT_IDS: AccentColor[] = [
  "purple",
  "blue",
  "green",
  "orange",
  "red",
];

const SECTION_LABEL: Record<SettingsSection, MessageKey> = {
  general: "settings.section.general",
  audio: "settings.section.audio",
  hotkeys: "settings.section.hotkeys",
  appearance: "settings.section.appearance",
  about: "settings.section.about",
};

const ACCENT_LABEL: Record<AccentColor, MessageKey> = {
  purple: "settings.accent.purple",
  blue: "settings.accent.blue",
  green: "settings.accent.green",
  orange: "settings.accent.orange",
  red: "settings.accent.red",
};

const ACCENT_COLORS: Record<AccentColor, string> = {
  purple: "#5b4dff",
  blue: "#3b82f6",
  green: "#22a06b",
  orange: "#f59e0b",
  red: "#ef4444",
};

export function SettingsView() {
  const t = useT();
  const [section, setSection] = useState<SettingsSection>("general");
  const [settingsQuery, setSettingsQuery] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installedVersion, setInstalledVersion] = useState(APP_VERSION);

  const settings = useSettingsStore((s) => s.settings);
  const devices = useSettingsStore((s) => s.devices);
  const error = useSettingsStore((s) => s.error);
  const setMasterVolume = useSettingsStore((s) => s.setMasterVolume);
  const setOutputs = useSettingsStore((s) => s.setOutputs);
  const setStopAllHotkey = useSettingsStore((s) => s.setStopAllHotkey);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const hydrate = useSettingsStore((s) => s.hydrate);

  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const accent = useUiStore((s) => s.accent);
  const setAccent = useUiStore((s) => s.setAccent);
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const setReduceMotion = useUiStore((s) => s.setReduceMotion);
  const startMinimized = useUiStore((s) => s.startMinimized);
  const setStartMinimized = useUiStore((s) => s.setStartMinimized);
  const startInBackground = useUiStore((s) => s.startInBackground);
  const setStartInBackground = useUiStore((s) => s.setStartInBackground);
  const setOnboardingOpen = useUiStore((s) => s.setOnboardingOpen);
  const openHelp = useHelpStore((s) => s.open);
  const push = useToastStore((s) => s.push);
  const checkNow = useUpdateStore((s) => s.checkNow);
  const updateChecking = useUpdateStore((s) => s.checking);

  useEffect(() => {
    void getVersion()
      .then(setInstalledVersion)
      .catch(() => setInstalledVersion(APP_VERSION));
  }, []);

  const sections = SECTION_IDS.map((id) => ({
    id,
    label: t(SECTION_LABEL[id]),
  }));

  const accents = ACCENT_IDS.map((id) => ({
    id,
    label: t(ACCENT_LABEL[id]),
    color: ACCENT_COLORS[id],
  }));

  const monitorOptions = [
    { value: "", label: t("common.systemDefault") },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault
        ? t("common.deviceDefaultSuffix", { name: d.name })
        : d.name,
    })),
  ];
  const secondaryOptions = [
    { value: "", label: t("common.disabled") },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault
        ? t("common.deviceDefaultSuffix", { name: d.name })
        : d.name,
    })),
  ];

  const applyThemeMode = async (mode: ThemeMode) => {
    setThemeMode(mode);
    if (mode === "light" || mode === "dark") {
      try {
        await api.setTheme(mode);
        await hydrate();
      } catch (err) {
        push({ kind: "error", message: String(err) });
      }
    }
  };

  const verifyUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const result = await checkNow({ openModal: true });
      switch (result.status) {
        case "up_to_date":
          push({
            kind: "success",
            message: t("settings.update.upToDate", {
              current: result.current,
              latest: result.latest,
            }),
          });
          break;
        case "update_available":
          // Modal is the primary install path; toast re-opens it.
          push({
            kind: "info",
            message: t("settings.update.available", {
              current: result.current,
              latest: result.latest,
            }),
            actionLabel: t("settings.update.openUpdate"),
            onAction: () => useUpdateStore.getState().setModalOpen(true),
          });
          break;
        case "unavailable":
          push({
            kind: "warning",
            message: result.reason,
          });
          break;
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  let content: ReactNode;
  switch (section) {
    case "general":
      content = (
        <div className="flex flex-col gap-8">
          <SectionCard title={t("settings.section.general")}>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={() =>
                  void api
                    .showMiniWindow()
                    .catch((err) =>
                      push({ kind: "error", message: String(err) }),
                    )
                }
              >
                {t("settings.openMini")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setOnboardingOpen(true)}
              >
                {t("settings.redoOnboarding")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => openHelp()}
              >
                {t("settings.openDiagnostics")}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title={t("settings.startup")}>
            <Toggle
              label={t("settings.startMinimized")}
              checked={startMinimized}
              onChange={setStartMinimized}
            />
            <Toggle
              label={t("settings.startBackground")}
              checked={startInBackground}
              onChange={setStartInBackground}
            />
            <p className="text-[12px] text-[var(--buddio-text-muted)]">
              {t("settings.startupHint")}
            </p>
          </SectionCard>
        </div>
      );
      break;
    case "audio":
      content = (
        <SectionCard title={t("settings.section.audio")}>
          <Slider
            label={t("settings.masterVolume")}
            value={settings.masterVolume}
            onChange={(v) => void setMasterVolume(v)}
          />
          <Toggle
            label={t("settings.monitorEnabled")}
            checked={settings.monitorEnabled}
            onChange={(checked) =>
              void setOutputs(
                checked,
                settings.monitorDevice,
                settings.secondaryDevice,
              )
            }
          />
          <Field label={t("settings.monitorDevice")}>
            <Select
              disabled={!settings.monitorEnabled}
              aria-label={t("settings.monitorDevice")}
              value={settings.monitorDevice ?? ""}
              options={monitorOptions}
              onChange={(next) =>
                void setOutputs(
                  settings.monitorEnabled,
                  next || null,
                  settings.secondaryDevice,
                )
              }
            />
          </Field>
          <Field label={t("settings.secondaryDevice")}>
            <Select
              aria-label={t("settings.secondaryAria")}
              value={settings.secondaryDevice ?? ""}
              options={secondaryOptions}
              onChange={(next) =>
                void setOutputs(
                  settings.monitorEnabled,
                  settings.monitorDevice,
                  next || null,
                )
              }
            />
          </Field>
          <Field label={t("settings.micMode")}>
            <Select
              aria-label={t("settings.micMode")}
              value={settings.micRouteMode}
              options={[
                { value: "mix", label: t("settings.micMode.mix") },
                { value: "ducking", label: t("settings.micMode.ducking") },
                { value: "soundOnly", label: t("settings.micMode.soundOnly") },
              ]}
              onChange={async (next) => {
                try {
                  await api.setMicRoute(
                    next as "mix" | "ducking" | "soundOnly",
                    settings.duckingDb,
                  );
                  await hydrate();
                } catch (err) {
                  push({ kind: "error", message: String(err) });
                }
              }}
            />
          </Field>
          <Toggle
            label={t("settings.vadSound")}
            checked={settings.vadSoundEnabled}
            onChange={async (enabled) => {
              try {
                await api.setVadSound(enabled);
                await hydrate();
              } catch (err) {
                push({ kind: "error", message: String(err) });
              }
            }}
          />
          <p className="text-[12px] text-[var(--buddio-text-secondary)]">
            {t("settings.vadHint")}
          </p>
          <Toggle
            label={t("settings.indexHotkeys")}
            checked={settings.indexHotkeysEnabled}
            onChange={async (enabled) => {
              try {
                await api.setIndexHotkeysEnabled(enabled);
                await hydrate();
              } catch (err) {
                push({ kind: "error", message: String(err) });
              }
            }}
          />
        </SectionCard>
      );
      break;
    case "hotkeys":
      content = (
        <SectionCard title={t("settings.section.hotkeys")}>
          <HotkeyRecorder
            label={t("settings.stopAllHotkey")}
            value={settings.stopAllHotkey}
            onChange={setStopAllHotkey}
          />
          <p className="text-[12px] text-[var(--buddio-text-muted)]">
            {t("settings.hotkeysHint")}
          </p>
        </SectionCard>
      );
      break;
    case "appearance":
      content = (
        <SectionCard title={t("settings.section.appearance")}>
          <Field label={t("settings.language")}>
            <Select
              aria-label={t("settings.language")}
              value={settings.locale === "pt" ? "pt" : "en"}
              options={LOCALES.map((item) => ({
                value: item.id,
                label: item.nativeLabel,
              }))}
              onChange={async (next) => {
                try {
                  await setLocale(next as Locale);
                } catch (err) {
                  push({ kind: "error", message: String(err) });
                }
              }}
            />
            <p className="mt-1.5 text-[12px] text-[var(--buddio-text-muted)]">
              {t("settings.languageHint")}
            </p>
          </Field>

          <div>
            <p className="mb-3 text-[13px] text-[var(--buddio-text-secondary)]">
              {t("settings.theme")}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <ThemeCard
                label={t("settings.theme.light")}
                icon={<Sun size={22} weight="duotone" />}
                selected={themeMode === "light"}
                onClick={() => void applyThemeMode("light")}
              />
              <ThemeCard
                label={t("settings.theme.dark")}
                icon={<Moon size={22} weight="duotone" />}
                selected={themeMode === "dark"}
                onClick={() => void applyThemeMode("dark")}
              />
              <ThemeCard
                label={t("settings.theme.system")}
                icon={<Desktop size={22} weight="duotone" />}
                selected={themeMode === "system"}
                onClick={() => void applyThemeMode("system")}
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-[13px] text-[var(--buddio-text-secondary)]">
              {t("settings.accent")}
            </p>
            <p className="mb-3 text-[12px] text-[var(--buddio-text-muted)]">
              {t("settings.accentHint")}
            </p>
            <div className="flex flex-wrap gap-3">
              {accents.map((item) => {
                const selected = accent === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    aria-pressed={selected}
                    onClick={() => setAccent(item.id)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full transition-transform duration-[var(--duration-hover)]",
                      selected
                        ? "scale-105 ring-2 ring-[var(--buddio-text)] ring-offset-2 ring-offset-[var(--buddio-surface)]"
                        : "hover:scale-105",
                    )}
                    style={{ backgroundColor: item.color }}
                  >
                    {selected ? (
                      <Check size={14} weight="bold" className="text-white" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-3 text-[13px] text-[var(--buddio-text-secondary)]">
              {t("settings.density")}
            </p>
            <DensityGroup value={density} onChange={setDensity} />
          </div>

          <Toggle
            label={t("settings.reduceMotion")}
            checked={reduceMotion}
            onChange={setReduceMotion}
          />

          <p className="text-[12px] text-[var(--buddio-text-muted)]">
            {t("settings.appearanceHint")}
          </p>
        </SectionCard>
      );
      break;
    case "about":
      content = (
        <SectionCard title={t("settings.section.about")}>
          <div className="rounded-[var(--radius-control)] border border-[var(--buddio-border)] bg-[var(--buddio-window)] px-4 py-3">
            <p className="text-[12px] text-[var(--buddio-text-muted)]">
              {t("settings.version")}
            </p>
            <p className="mt-0.5 text-[16px] font-bold tabular-nums">
              {installedVersion}
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[var(--buddio-border)] bg-[var(--buddio-window)] px-4 py-3">
            <p className="text-[12px] text-[var(--buddio-text-muted)]">
              {t("settings.repository")}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold">{BUDDIO_GITHUB_REPO}</p>
            <Button
              variant="secondary"
              className="mt-3"
              icon={<ArrowSquareOut size={16} weight="bold" />}
              onClick={() =>
                void openExternal(`https://github.com/${BUDDIO_GITHUB_REPO}`)
              }
            >
              {t("settings.openGithub")}
            </Button>
          </div>
          <div>
            <p className="mb-2 text-[13px] text-[var(--buddio-text-secondary)]">
              {t("settings.updates")}
            </p>
            <p className="mb-3 text-[13px] text-[var(--buddio-text-secondary)]">
              {t("settings.updatesHint")}
            </p>
            <Button
              variant="secondary"
              disabled={checkingUpdate || updateChecking}
              icon={<ArrowClockwise size={16} weight="bold" />}
              onClick={() => void verifyUpdates()}
            >
              {checkingUpdate
                ? t("settings.checkingUpdates")
                : t("settings.checkUpdates")}
            </Button>
          </div>
        </SectionCard>
      );
      break;
    default: {
      const _exhaustive: never = section;
      return _exhaustive;
    }
  }

  return (
    <div className="buddio-scroll h-full overflow-y-auto px-[var(--space-pad-x)] py-[var(--space-pad-y)]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[length:var(--heading-size)] font-bold leading-none">
            {t("settings.title")}
          </h1>
          <p className="mt-2 text-[13px] text-[var(--buddio-text-secondary)]">
            {t("settings.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Search
            placeholder={t("common.search")}
            value={settingsQuery}
            onChange={(e) => setSettingsQuery(e.target.value)}
            onClear={() => setSettingsQuery("")}
            className="w-[220px] flex-none"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-4 text-[13px] text-[var(--buddio-danger)]">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)]">
        <div className="flex flex-col gap-0 lg:flex-row">
          <nav
            aria-label={t("settings.sectionsAria")}
            className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-[var(--buddio-border-subtle)] p-3 lg:w-[180px] lg:flex-col lg:border-b-0 lg:border-r"
          >
            {sections
              .filter(
                (item) =>
                  !settingsQuery.trim() ||
                  item.label
                    .toLowerCase()
                    .includes(settingsQuery.trim().toLowerCase()),
              )
              .map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      "h-[var(--control-h)] shrink-0 rounded-[10px] px-3 text-left text-[13px] font-semibold transition-colors",
                      active
                        ? "bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand-deep)]"
                        : "text-[var(--buddio-text-secondary)] hover:bg-[var(--buddio-surface-secondary)] hover:text-[var(--buddio-text)]",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
          </nav>

          <div className="min-w-0 flex-1 p-5">{content}</div>
        </div>
      </div>
    </div>
  );
}

async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-[17px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-[13px]">
      <span className="text-[var(--buddio-text-secondary)]">{label}</span>
      {children}
    </div>
  );
}

function ThemeCard({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-2 rounded-[14px] border px-3 py-4 text-[13px] font-semibold transition-[border,background,box-shadow] duration-[var(--duration-hover)]",
        selected
          ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand-deep)] shadow-[var(--shadow-selected)]"
          : "border-[var(--buddio-border)] bg-[var(--buddio-window)] text-[var(--buddio-text-secondary)] hover:border-[var(--buddio-brand-border)]",
      )}
    >
      <span className={selected ? "text-[var(--buddio-brand)]" : undefined}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function DensityGroup({
  value,
  onChange,
}: {
  value: UiDensity;
  onChange: (value: UiDensity) => void;
}) {
  const t = useT();
  const options: { id: UiDensity; label: string }[] = [
    { id: "comfortable", label: t("settings.density.comfortable") },
    { id: "compact", label: t("settings.density.compact") },
  ];

  return (
    <div className="inline-flex rounded-[12px] border border-[var(--buddio-border)] bg-[var(--buddio-window)] p-1">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "h-[var(--control-h)] rounded-[9px] px-4 text-[12px] font-semibold transition-colors",
              selected
                ? "bg-[var(--buddio-text)] text-[var(--buddio-window)]"
                : "text-[var(--buddio-text-secondary)] hover:text-[var(--buddio-text)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
