import {
  ArrowsClockwise,
  Desktop,
  Lightning,
  Microphone,
  SpeakerHigh,
  Waveform as WaveIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Search } from "../components/ui/Search";
import { Select } from "../components/ui/Select";
import { Toggle } from "../components/ui/Toggle";
import { Waveform } from "../components/Waveform";
import { useT } from "../i18n";
import * as api from "../lib/api";
import { cn } from "../lib/cn";
import { useSettingsStore } from "../stores/settingsStore";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";

export function RoutingView() {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const devices = useSettingsStore((s) => s.devices);
  const setOutputs = useSettingsStore((s) => s.setOutputs);
  const setMicRoute = useSettingsStore((s) => s.setMicRoute);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const setDiagnosticsOpen = useUiStore((s) => s.setDiagnosticsOpen);
  const push = useToastStore((s) => s.push);
  const [query, setQuery] = useState("");


  const hasSecondary = Boolean(settings.secondaryDevice);
  const monitorLabel = settings.monitorEnabled
    ? (settings.monitorDevice ?? t("common.systemDefault"))
    : t("common.off");
  const virtualLabel = settings.secondaryDevice ?? t("common.notConfigured");

  const secondaryOptions = [
    { value: "", label: t("common.notConfigured") },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault
        ? t("common.deviceDefaultSuffix", { name: d.name })
        : d.name,
    })),
  ];

  const monitorOptions = [
    { value: "", label: t("common.systemDefault") },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault
        ? t("common.deviceDefaultSuffix", { name: d.name })
        : d.name,
    })),
  ];

  return (
    <div className="buddio-scroll flex h-full flex-col gap-[var(--space-gap)] overflow-y-auto px-[var(--space-pad-x)] py-[var(--space-pad-y)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[length:var(--heading-size)] font-bold leading-none">{t("routing.title")}</h1>
          <p className="mt-2 text-[13px] text-[var(--buddio-text-secondary)]">
            {t("routing.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Search
            placeholder={t("common.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="w-[200px] flex-none"
          />
          <Button
            variant="primary"
            icon={<ArrowsClockwise size={16} weight="bold" />}
            onClick={() => {
              void (async () => {
                try {
                  const result = await api.ensureVirtualCable();
                  await hydrate();
                  push({
                    kind: result.rebootRequired ? "warning" : "success",
                    message: result.message,
                  });
                } catch (err) {
                  push({ kind: "error", message: String(err) });
                }
              })();
            }}
          >
            {t("routing.activateRoute")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void api
                .getDiagnostics()
                .then(() => setDiagnosticsOpen(true))
                .catch((err: unknown) =>
                  push({ kind: "error", message: String(err) }),
                );
            }}
          >
            {t("routing.diagnostics")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void api
                .playTestSample()
                .then(() =>
                  push({ kind: "success", message: t("routing.testOk") }),
                )
                .catch((err: unknown) =>
                  push({
                    kind: "error",
                    message: err instanceof Error ? err.message : String(err),
                  }),
                );
            }}
          >
            {t("routing.testRouting")}
          </Button>
        </div>
      </div>

      <section className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-4">
        <p className="mb-3 text-[15px] font-bold">{t("routing.audioFlow")}</p>
        <div className="flex flex-wrap items-stretch gap-2">
          <RouteCard
            title={t("routing.mic")}
            subtitle={t("routing.micSystem")}
            icon={<Microphone size={18} weight="duotone" />}
            ok
          />
          <Arrow />
          <RouteCard
            title={t("routing.mixer")}
            subtitle={
              settings.micRouteMode === "soundOnly"
                ? t("routing.mixer.soundOnly")
                : settings.micRouteMode === "ducking"
                  ? t("routing.mixer.ducking")
                  : t("routing.mixer.mix")
            }
            icon={<WaveIcon size={18} weight="duotone" />}
            highlight
            ok
          />
          <Arrow />
          <RouteCard
            title={t("routing.virtualMic")}
            subtitle={virtualLabel}
            icon={<Lightning size={18} weight="duotone" />}
            ok={hasSecondary}
          />
          <Arrow />
          <RouteCard
            title={t("routing.monitor")}
            subtitle={monitorLabel}
            icon={<SpeakerHigh size={18} weight="duotone" />}
            ok={settings.monitorEnabled}
          />
        </div>
      </section>

      <div className="grid gap-[var(--space-gap)] lg:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-4">
          <p className="mb-3 text-[15px] font-bold">{t("routing.inputMix")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("routing.mic")} className="sm:col-span-2">
              <Select
                aria-label={t("routing.mic")}
                value="system"
                options={[
                  { value: "system", label: t("routing.systemMic") },
                ]}
                onChange={() => undefined}
              />
            </Field>
            <Field label={t("settings.micMode")} className="sm:col-span-2">
              <Select
                aria-label={t("settings.micMode")}
                value={settings.micRouteMode}
                options={[
                  { value: "mix", label: t("settings.micMode.mix") },
                  { value: "ducking", label: t("routing.micMode.ducking") },
                  { value: "soundOnly", label: t("routing.micMode.soundOnly") },
                ]}
                onChange={(next) => {
                  void setMicRoute(
                    next as "mix" | "ducking" | "soundOnly",
                    settings.duckingDb,
                  ).then(() =>
                    push({
                      kind: "info",
                      message:
                        next === "soundOnly"
                          ? t("routing.toast.soundOnly")
                          : next === "ducking"
                            ? t("routing.toast.ducking")
                            : t("routing.toast.mix"),
                    }),
                  );
                }}
              />
            </Field>
            <Field label={t("routing.ducking")}>
              <Select
                aria-label={t("routing.ducking")}
                value={String(settings.duckingDb)}
                options={[
                  { value: "0", label: "0 dB" },
                  { value: "-8", label: "-8 dB" },
                  { value: "-12", label: "-12 dB" },
                ]}
                onChange={(next) => {
                  void setMicRoute(settings.micRouteMode, Number(next));
                }}
              />
            </Field>
            <Field label={t("routing.lufsTarget")}>
              <Select
                aria-label={t("routing.lufsTarget")}
                value={String(settings.voiceTargetLufs)}
                options={[
                  { value: "-23", label: t("routing.lufs.soft") },
                  { value: "-16", label: t("routing.lufs.default") },
                  { value: "-14", label: t("routing.lufs.streaming") },
                  { value: "-11", label: t("routing.lufs.loud") },
                ]}
                onChange={async (next) => {
                  try {
                    await api.setVoiceTargetLufs(Number(next));
                    await hydrate();
                    push({
                      kind: "info",
                      message: t("routing.lufsToast"),
                    });
                  } catch (err) {
                    push({ kind: "error", message: String(err) });
                  }
                }}
              />
            </Field>
            <Field label={t("routing.virtualMic")}>
              <Select
                aria-label={t("routing.virtualMic")}
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
            <Field label={t("routing.monitor")} className="sm:col-span-2">
              <Select
                aria-label={t("routing.monitor")}
                value={settings.monitorDevice ?? ""}
                options={monitorOptions}
                onChange={(next) =>
                  void setOutputs(true, next || null, settings.secondaryDevice)
                }
              />
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-2">
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
              <Toggle
                label={t("settings.vadSound")}
                checked={settings.vadSoundEnabled}
                onChange={async (enabled) => {
                  try {
                    await api.setVadSound(enabled);
                    await hydrate();
                    push({
                      kind: "info",
                      message: enabled
                        ? t("routing.vadOn")
                        : t("routing.vadOff"),
                    });
                  } catch (err) {
                    push({ kind: "error", message: String(err) });
                  }
                }}
              />
              <p className="text-[12px] text-[var(--buddio-text-secondary)]">
                {t("routing.vadDiscordHint")}
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-4">
          <p className="mb-3 text-[15px] font-bold">{t("routing.outputs")}</p>
          <div className="flex flex-col gap-3">
            <OutputCard
              title={t("routing.virtualMic")}
              subtitle={virtualLabel}
              icon={
                <Lightning
                  size={16}
                  weight="fill"
                  className="text-[var(--buddio-brand)]"
                />
              }
              tone={hasSecondary ? "ok" : "warn"}
            />
            <OutputCard
              title={t("routing.monitor")}
              subtitle={monitorLabel}
              icon={<Desktop size={16} weight="fill" />}
              tone={settings.monitorEnabled ? "ok" : "muted"}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDiagnosticsOpen(true)}>
              {t("routing.runDiagnostics")}
            </Button>
            <Button
              variant="primary"
              icon={<ArrowsClockwise size={16} weight="bold" />}
              onClick={() => setDiagnosticsOpen(true)}
            >
              {t("routing.repairRoute")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 text-[13px]", className)}>
      <span className="text-[var(--buddio-text-secondary)]">{label}</span>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <span className="self-center text-[var(--buddio-text-muted)]" aria-hidden>
      →
    </span>
  );
}

function RouteCard({
  title,
  subtitle,
  icon,
  highlight,
  ok,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  highlight?: boolean;
  ok?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-w-[130px] flex-1 rounded-[14px] border px-3 py-3",
        highlight
          ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)]"
          : "border-[var(--buddio-border)] bg-[var(--buddio-surface-secondary)]",
      )}
    >
      {ok ? (
        <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-[var(--buddio-success)]" />
      ) : null}
      <div className="mb-2 text-[var(--buddio-brand)]">{icon}</div>
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="mt-1 truncate text-[11px] text-[var(--buddio-text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}

function OutputCard({
  title,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  tone: "ok" | "warn" | "muted";
}) {
  const styles = {
    ok: "border-[var(--buddio-success)]/30 bg-[color-mix(in_oklab,var(--buddio-success)_8%,transparent)]",
    warn: "border-[var(--buddio-warning)]/30 bg-[color-mix(in_oklab,var(--buddio-warning)_8%,transparent)]",
    muted: "border-[var(--buddio-border)] bg-[var(--buddio-window)]",
  }[tone];

  return (
    <div className={cn("rounded-[14px] border px-3 py-3", styles)}>
      <div className="mb-2 flex items-center gap-3">
        {icon}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{title}</p>
          <p className="truncate text-[12px] text-[var(--buddio-text-secondary)]">
            {subtitle}
          </p>
        </div>
        <span className="ml-auto text-[11px] text-[var(--buddio-text-muted)]">
          48 kHz
        </span>
      </div>
      <Waveform playing={tone === "ok"} className="h-8" />
    </div>
  );
}
