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
import * as api from "../lib/api";
import { cn } from "../lib/cn";
import {
  APP_VERSION,
  BUDDIO_GITHUB_REPO,
  checkForUpdates,
} from "../lib/updates";
import { useSettingsStore } from "../stores/settingsStore";
import {
  useUiStore,
  type AccentColor,
  type ThemeMode,
  type UiDensity,
} from "../stores/uiStore";
import { useToastStore } from "../stores/toastStore";

type SettingsSection =
  | "geral"
  | "audio"
  | "atalhos"
  | "aparencia"
  | "sobre";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "geral", label: "Geral" },
  { id: "audio", label: "Áudio" },
  { id: "atalhos", label: "Atalhos" },
  { id: "aparencia", label: "Aparência" },
  { id: "sobre", label: "Sobre" },
];

const ACCENTS: { id: AccentColor; label: string; color: string }[] = [
  { id: "purple", label: "Roxo", color: "#5b4dff" },
  { id: "blue", label: "Azul", color: "#3b82f6" },
  { id: "green", label: "Verde", color: "#22a06b" },
  { id: "orange", label: "Laranja", color: "#f59e0b" },
  { id: "red", label: "Vermelho", color: "#ef4444" },
];

export function SettingsView() {
  const [section, setSection] = useState<SettingsSection>("geral");
  const [settingsQuery, setSettingsQuery] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installedVersion, setInstalledVersion] = useState(APP_VERSION);
  const settings = useSettingsStore((s) => s.settings);
  const devices = useSettingsStore((s) => s.devices);
  const error = useSettingsStore((s) => s.error);
  const setOutputs = useSettingsStore((s) => s.setOutputs);
  const setStopAllHotkey = useSettingsStore((s) => s.setStopAllHotkey);
  const setMasterVolume = useSettingsStore((s) => s.setMasterVolume);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const accent = useUiStore((s) => s.accent);
  const setAccent = useUiStore((s) => s.setAccent);
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);
  const startMinimized = useUiStore((s) => s.startMinimized);
  const setStartMinimized = useUiStore((s) => s.setStartMinimized);
  const startInBackground = useUiStore((s) => s.startInBackground);
  const setStartInBackground = useUiStore((s) => s.setStartInBackground);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const setReduceMotion = useUiStore((s) => s.setReduceMotion);
  const setOnboardingOpen = useUiStore((s) => s.setOnboardingOpen);
  const setDiagnosticsOpen = useUiStore((s) => s.setDiagnosticsOpen);
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    void getVersion()
      .then(setInstalledVersion)
      .catch(() => setInstalledVersion(APP_VERSION));
  }, []);

  const monitorOptions = [
    { value: "", label: "Padrão do sistema" },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault ? `${d.name} (padrão)` : d.name,
    })),
  ];

  const secondaryOptions = [
    { value: "", label: "Desativada" },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault ? `${d.name} (padrão)` : d.name,
    })),
  ];

  const applyThemeMode = async (mode: ThemeMode) => {
    setThemeMode(mode);
    if (mode === "light" || mode === "dark") {
      try {
        await api.setTheme(mode);
      } catch {
        /* local theme still applied */
      }
    }
  };

  const verifyUpdates = async () => {
    setCheckingUpdate(true);
    try {
      let current = installedVersion;
      try {
        current = await getVersion();
        setInstalledVersion(current);
      } catch {
        /* browser / preview — keep package.json version */
      }
      const result = await checkForUpdates(current);
      switch (result.status) {
        case "up_to_date":
          push({
            kind: "success",
            message: `Você já está na versão ${result.current} (latest no GitHub: ${result.latest}).`,
          });
          break;
        case "update_available":
          push({
            kind: "info",
            message: `Nova versão ${result.latest} disponível (você tem ${result.current}).`,
            actionLabel: "Abrir no GitHub",
            onAction: () => {
              void openExternal(result.url);
            },
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
    case "geral":
      content = (
        <div className="flex flex-col gap-8">
          <SectionCard title="Geral">
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
                Abrir Buddio Mini
              </Button>
              <Button
                variant="secondary"
                onClick={() => setOnboardingOpen(true)}
              >
                Refazer onboarding de áudio
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDiagnosticsOpen(true)}
              >
                Abrir diagnóstico
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Inicialização">
            <Toggle
              label="Iniciar minimizado na bandeja"
              checked={startMinimized}
              onChange={setStartMinimized}
            />
            <Toggle
              label="Iniciar em segundo plano"
              checked={startInBackground}
              onChange={setStartInBackground}
            />
            <p className="text-[12px] text-[var(--buddio-text-muted)]">
              Preferências salvas neste computador. O início em segundo plano
              esconde a janela principal ao abrir (bandeja).
            </p>
          </SectionCard>
        </div>
      );
      break;
    case "audio":
      content = (
        <SectionCard title="Áudio">
          <Slider
            label="Volume master"
            value={settings.masterVolume}
            onChange={(v) => void setMasterVolume(v)}
          />
          <Toggle
            label="Ouvir no monitor"
            checked={settings.monitorEnabled}
            onChange={(checked) =>
              void setOutputs(
                checked,
                settings.monitorDevice,
                settings.secondaryDevice,
              )
            }
          />
          <Field label="Dispositivo de monitor">
            <Select
              disabled={!settings.monitorEnabled}
              aria-label="Dispositivo de monitor"
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
          <Field label="Saída secundária (chamada / virtual)">
            <Select
              aria-label="Saída secundária"
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
          <Field label="Modo do microfone">
            <Select
              aria-label="Modo do microfone"
              value={settings.micRouteMode}
              options={[
                { value: "mix", label: "Misturar voz + sons" },
                { value: "ducking", label: "Ducking" },
                { value: "soundOnly", label: "Só som" },
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
            label="Som de ativação de voz (VAD)"
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
          <Toggle
            label="Atalhos por índice (Ctrl+Alt+N)"
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
    case "atalhos":
      content = (
        <SectionCard title="Atalhos">
          <HotkeyRecorder
            label="Atalho parar tudo"
            value={settings.stopAllHotkey}
            onChange={setStopAllHotkey}
          />
          <p className="text-[12px] text-[var(--buddio-text-muted)]">
            Ctrl+K abre a command palette.
          </p>
        </SectionCard>
      );
      break;
    case "aparencia":
      content = (
        <SectionCard title="Aparência">
          <div>
            <p className="mb-3 text-[13px] text-[var(--buddio-text-secondary)]">
              Tema
            </p>
            <div className="grid grid-cols-3 gap-3">
              <ThemeCard
                label="Claro"
                icon={<Sun size={22} weight="duotone" />}
                selected={themeMode === "light"}
                onClick={() => void applyThemeMode("light")}
              />
              <ThemeCard
                label="Escuro"
                icon={<Moon size={22} weight="duotone" />}
                selected={themeMode === "dark"}
                onClick={() => void applyThemeMode("dark")}
              />
              <ThemeCard
                label="Sistema"
                icon={<Desktop size={22} weight="duotone" />}
                selected={themeMode === "system"}
                onClick={() => void applyThemeMode("system")}
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-[13px] text-[var(--buddio-text-secondary)]">
              Cor de destaque
            </p>
            <p className="mb-3 text-[12px] text-[var(--buddio-text-muted)]">
              Usada no editor (waveform e handles). A marca Buddio permanece
              roxa.
            </p>
            <div className="flex flex-wrap gap-3">
              {ACCENTS.map((item) => {
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
              Densidade
            </p>
            <DensityGroup value={density} onChange={setDensity} />
          </div>

          <Toggle
            label="Reduzir animações"
            checked={reduceMotion}
            onChange={setReduceMotion}
          />

          <p className="text-[12px] text-[var(--buddio-text-muted)]">
            As alterações de aparência são aplicadas imediatamente.
          </p>
        </SectionCard>
      );
      break;
    case "sobre":
      content = (
        <SectionCard title="Sobre">
          <div className="rounded-[var(--radius-control)] border border-[var(--buddio-border)] bg-[var(--buddio-window)] px-4 py-3">
            <p className="text-[12px] text-[var(--buddio-text-muted)]">Versão</p>
            <p className="mt-0.5 text-[16px] font-bold tabular-nums">
              {installedVersion}
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] border border-[var(--buddio-border)] bg-[var(--buddio-window)] px-4 py-3">
            <p className="text-[12px] text-[var(--buddio-text-muted)]">
              Repositório
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
              Abrir no GitHub
            </Button>
          </div>
          <div>
            <p className="mb-2 text-[13px] text-[var(--buddio-text-secondary)]">
              Atualizações
            </p>
            <p className="mb-3 text-[13px] text-[var(--buddio-text-secondary)]">
              Consulta a release mais recente publicada no GitHub (incluindo
              release candidates).
            </p>
            <Button
              variant="secondary"
              disabled={checkingUpdate}
              icon={<ArrowClockwise size={16} weight="bold" />}
              onClick={() => void verifyUpdates()}
            >
              {checkingUpdate ? "Verificando…" : "Verificar atualizações"}
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
          <h1 className="text-[length:var(--heading-size)] font-bold leading-none">Configurações</h1>
          <p className="mt-2 text-[13px] text-[var(--buddio-text-secondary)]">
            Ajuste o comportamento, aparência e integração do Buddio.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Search
            placeholder="Buscar"
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
            aria-label="Seções de configuração"
            className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-[var(--buddio-border-subtle)] p-3 lg:w-[180px] lg:flex-col lg:border-b-0 lg:border-r"
          >
            {SECTIONS.filter(
              (item) =>
                !settingsQuery.trim() ||
                item.label
                  .toLowerCase()
                  .includes(settingsQuery.trim().toLowerCase()),
            ).map((item) => {
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
  const options: { id: UiDensity; label: string }[] = [
    { id: "comfortable", label: "Expandida" },
    { id: "compact", label: "Compacta" },
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
