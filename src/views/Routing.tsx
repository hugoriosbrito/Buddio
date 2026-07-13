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
import * as api from "../lib/api";
import { cn } from "../lib/cn";
import { useSettingsStore } from "../stores/settingsStore";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";

export function RoutingView() {
  const settings = useSettingsStore((s) => s.settings);
  const devices = useSettingsStore((s) => s.devices);
  const setOutputs = useSettingsStore((s) => s.setOutputs);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const setDiagnosticsOpen = useUiStore((s) => s.setDiagnosticsOpen);
  const push = useToastStore((s) => s.push);
  const [query, setQuery] = useState("");
  const [gain, setGain] = useState("82");
  const [noiseGate, setNoiseGate] = useState("on");
  const [ducking, setDucking] = useState("-8");


  const hasSecondary = Boolean(settings.secondaryDevice);
  const monitorLabel = settings.monitorEnabled
    ? (settings.monitorDevice ?? "Padrão do sistema")
    : "Desligado";
  const virtualLabel = settings.secondaryDevice ?? "Não configurada";

  const secondaryOptions = [
    { value: "", label: "Não configurada" },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault ? `${d.name} (padrão)` : d.name,
    })),
  ];

  const monitorOptions = [
    { value: "", label: "Padrão do sistema" },
    ...devices.map((d) => ({
      value: d.name,
      label: d.isDefault ? `${d.name} (padrão)` : d.name,
    })),
  ];

  return (
    <div className="buddio-scroll flex h-full flex-col gap-[var(--space-gap)] overflow-y-auto px-[var(--space-pad-x)] py-[var(--space-pad-y)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[length:var(--heading-size)] font-bold leading-none">Roteamento</h1>
          <p className="mt-2 text-[13px] text-[var(--buddio-text-secondary)]">
            Veja e teste exatamente para onde cada áudio está indo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Search
            placeholder="Buscar"
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
            Ativar rota
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
            Diagnóstico
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void api
                .playTestSample()
                .then(() =>
                  push({ kind: "success", message: "Sample de teste reproduzido" }),
                )
                .catch((err: unknown) =>
                  push({
                    kind: "error",
                    message: err instanceof Error ? err.message : String(err),
                  }),
                );
            }}
          >
            Testar roteamento
          </Button>
        </div>
      </div>

      <section className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-4">
        <p className="mb-3 text-[15px] font-bold">Fluxo de áudio</p>
        <div className="flex flex-wrap items-stretch gap-2">
          <RouteCard
            title="Microfone"
            subtitle="Entrada do sistema"
            icon={<Microphone size={18} weight="duotone" />}
            ok
          />
          <Arrow />
          <RouteCard
            title="Mixer Buddio"
            subtitle="Voz + soundboard"
            icon={<WaveIcon size={18} weight="duotone" />}
            highlight
            ok
          />
          <Arrow />
          <RouteCard
            title="Microfone virtual"
            subtitle={virtualLabel}
            icon={<Lightning size={18} weight="duotone" />}
            ok={hasSecondary}
          />
          <Arrow />
          <RouteCard
            title="Monitor"
            subtitle={monitorLabel}
            icon={<SpeakerHigh size={18} weight="duotone" />}
            ok={settings.monitorEnabled}
          />
        </div>
      </section>

      <div className="grid gap-[var(--space-gap)] lg:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-4">
          <p className="mb-3 text-[15px] font-bold">Entrada e mixagem</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Microfone" className="sm:col-span-2">
              <Select
                aria-label="Microfone"
                value="system"
                options={[
                  { value: "system", label: "Microfone padrão do sistema" },
                ]}
                onChange={() => undefined}
              />
            </Field>
            <Field label="Ganho">
              <Select
                aria-label="Ganho"
                value={gain}
                options={[
                  { value: "60", label: "60%" },
                  { value: "82", label: "82%" },
                  { value: "100", label: "100%" },
                ]}
                onChange={setGain}
              />
            </Field>
            <Field label="Noise gate">
              <Select
                aria-label="Noise gate"
                value={noiseGate}
                options={[
                  { value: "on", label: "Ligado" },
                  { value: "off", label: "Desligado" },
                ]}
                onChange={setNoiseGate}
              />
            </Field>
            <Field label="Ducking">
              <Select
                aria-label="Ducking"
                value={ducking}
                options={[
                  { value: "0", label: "0 dB" },
                  { value: "-8", label: "-8 dB" },
                  { value: "-12", label: "-12 dB" },
                ]}
                onChange={setDucking}
              />
            </Field>
            <Field label="Microfone virtual">
              <Select
                aria-label="Microfone virtual"
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
            <Field label="Monitor" className="sm:col-span-2">
              <Select
                aria-label="Monitor"
                value={settings.monitorDevice ?? ""}
                options={monitorOptions}
                onChange={(next) =>
                  void setOutputs(true, next || null, settings.secondaryDevice)
                }
              />
            </Field>
            <div className="flex flex-col gap-3 sm:col-span-2">
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
              <Toggle
                label="Misturar microfone"
                checked={settings.micMixEnabled}
                onChange={async (enabled) => {
                  try {
                    await api.setMicMix(enabled);
                    await hydrate();
                  } catch (err) {
                    push({ kind: "error", message: String(err) });
                  }
                }}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-4">
          <p className="mb-3 text-[15px] font-bold">Saídas</p>
          <div className="flex flex-col gap-3">
            <OutputCard
              title="Microfone virtual"
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
              title="Monitor"
              subtitle={monitorLabel}
              icon={<Desktop size={16} weight="fill" />}
              tone={settings.monitorEnabled ? "ok" : "muted"}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDiagnosticsOpen(true)}>
              Executar diagnóstico
            </Button>
            <Button
              variant="primary"
              icon={<ArrowsClockwise size={16} weight="bold" />}
              onClick={() => setDiagnosticsOpen(true)}
            >
              Reparar rota
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
