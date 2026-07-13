import {
  ArrowsLeftRight,
  Check,
  Moon,
  Play,
  Sun,
  WarningCircle,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import markUrl from "../assets/brand/mark.svg";
import * as api from "../lib/api";
import { playClip, playTestSample, resumeHotkeys, suspendHotkeys } from "../lib/api";
import type { DiagnosticsDto } from "../lib/api";
import { cn } from "../lib/cn";
import { useLibraryStore } from "../stores/libraryStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";
import { ClipIcon } from "./ClipIcon";
import { ImportDropzone } from "./ImportDropzone";
import { Waveform } from "./Waveform";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import { Toggle } from "./ui/Toggle";

export type Screen =
  | "welcome"
  | "output"
  | "mic"
  | "virtual"
  | "routing"
  | "routeError"
  | "import"
  | "hotkey"
  | "ready";

const STEPPER = [
  { id: 1, label: "Saída de áudio", screens: ["welcome", "output"] as const },
  { id: 2, label: "Microfone", screens: ["mic"] as const },
  {
    id: 3,
    label: "Roteamento",
    screens: ["virtual", "routing", "routeError"] as const,
  },
  { id: 4, label: "Primeiro som", screens: ["import"] as const },
  { id: 5, label: "Atalho global", screens: ["hotkey", "ready"] as const },
] as const;

const VB_CABLE_URL = "https://vb-audio.com/Cable/";

export function isVirtualDeviceName(name: string): boolean {
  return /virtual|cable|voicemeeter|buddio|vb-?audio/i.test(name);
}

/** Capture endpoints that feedback if mixed into CABLE Input (Discord's mic). */
export function isLoopbackCaptureName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    (n.includes("cable") && n.includes("output")) ||
    n.includes("vb-audio virtual cable") ||
    n.includes("voicemeeter out") ||
    n.includes("voicemeeter vaio") ||
    n.includes("stereo mix") ||
    n.includes("what u hear") ||
    n.includes("wave out mix") ||
    n.includes("loopback")
  );
}

export function pickVirtualCandidate(
  devices: Array<{ name: string }>,
  monitorDevice: string | null,
): { name: string } | null {
  const candidates = devices.filter(
    (d) => isVirtualDeviceName(d.name) && d.name !== monitorDevice,
  );
  return (
    candidates.find((d) => /cable input/i.test(d.name)) ??
    candidates.find((d) => /vb-?audio|voicemeeter/i.test(d.name)) ??
    candidates[0] ??
    null
  );
}

export function isValidVirtualSecondary(
  secondary: string | null,
  monitorDevice: string | null,
  devices: Array<{ name: string }>,
): boolean {
  if (!secondary) return false;
  if (secondary === monitorDevice) return false;
  if (!isVirtualDeviceName(secondary)) return false;
  return devices.some((d) => d.name === secondary);
}

type RouteHealth = {
  micOk: boolean;
  mixerOk: boolean;
  virtualOk: boolean;
  monitorOk: boolean;
  failureTitle: string;
  failureDetail: string;
  needsVirtualInstall: boolean;
};

export function analyzeRouteHealth(args: {
  secondaryDevice: string | null;
  monitorDevice: string | null;
  monitorEnabled: boolean;
  devices: Array<{ name: string; isDefault?: boolean }>;
  diagnostics: DiagnosticsDto | null;
  micOk: boolean;
}): RouteHealth {
  const {
    secondaryDevice,
    monitorDevice,
    monitorEnabled,
    devices,
    diagnostics,
    micOk,
  } = args;

  const monitorOk =
    monitorEnabled &&
    (!monitorDevice || devices.some((d) => d.name === monitorDevice));
  const virtualOk = isValidVirtualSecondary(
    secondaryDevice,
    monitorDevice,
    devices,
  );
  const hasCandidate = Boolean(pickVirtualCandidate(devices, monitorDevice));

  let failureTitle = "Roteamento incompleto";
  let failureDetail = "Revise os dispositivos e tente novamente.";
  let needsVirtualInstall = false;

  if (!virtualOk) {
    if (!hasCandidate) {
      failureTitle = "Nenhum cabo virtual encontrado";
      failureDetail =
        "Para enviar sons ao Discord, Zoom ou jogos, instale o VB-CABLE (gratuito), reinicie o PC e use Reparar rota.";
      needsVirtualInstall = true;
    } else if (secondaryDevice && !isVirtualDeviceName(secondaryDevice)) {
      failureTitle = "Saída virtual apontando para alto-falantes";
      failureDetail = `${secondaryDevice} não é um cabo virtual. O reparo pode selecionar o dispositivo certo automaticamente.`;
    } else if (
      secondaryDevice &&
      !devices.some((d) => d.name === secondaryDevice)
    ) {
      failureTitle = `${secondaryDevice} indisponível`;
      failureDetail =
        "O dispositivo pode estar desativado nas configurações de som do Windows.";
    } else {
      failureTitle = "Microfone virtual não configurado";
      failureDetail =
        "Há um cabo virtual no sistema, mas ele ainda não foi selecionado como saída secundária.";
    }
  } else if (!monitorOk) {
    failureTitle = monitorDevice
      ? `${monitorDevice} indisponível`
      : "Monitor desativado";
    failureDetail =
      "O dispositivo de monitor pode estar desativado nas configurações de som do Windows.";
  } else if ((diagnostics?.warnings.length ?? 0) > 0) {
    failureTitle = "Diagnóstico encontrou avisos";
    failureDetail = diagnostics!.warnings[0]!;
  }

  return {
    micOk,
    mixerOk: true,
    virtualOk,
    monitorOk,
    failureTitle,
    failureDetail,
    needsVirtualInstall,
  };
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 0) return "-";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function displayHotkey(value: string): string {
  return value
    .replace(/CommandOrControl/gi, "Ctrl")
    .replace(/Control/gi, "Ctrl")
    .replace(/Meta/gi, "Ctrl");
}

export function formatChord(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const code = e.code;
  if (
    code === "ControlLeft" ||
    code === "ControlRight" ||
    code === "AltLeft" ||
    code === "AltRight" ||
    code === "ShiftLeft" ||
    code === "ShiftRight" ||
    code === "MetaLeft" ||
    code === "MetaRight"
  ) {
    return null;
  }

  let mapped: string;
  if (code.startsWith("Key") && code.length === 4) {
    mapped = code.slice(3);
  } else if (code.startsWith("Digit") && code.length === 6) {
    mapped = code.slice(5);
  } else if (code.startsWith("Numpad")) {
    mapped = code;
  } else if (/^F\d{1,2}$/.test(code)) {
    mapped = code;
  } else if (code === "Space") {
    mapped = "Space";
  } else {
    mapped = code;
  }

  if (parts.length === 0) return null;
  parts.push(mapped);
  return parts.join("+");
}

export function screenStepIndex(screen: Screen): number {
  const idx = STEPPER.findIndex((s) =>
    (s.screens as readonly string[]).includes(screen),
  );
  return idx < 0 ? 0 : idx;
}

function footerLabel(screen: Screen): string {
  switch (screen) {
    case "welcome":
      return "Boas-vindas";
    case "output":
      return "Saída de áudio";
    case "mic":
      return "Microfone";
    case "virtual":
      return "Microfone virtual";
    case "routing":
      return "Teste de roteamento";
    case "routeError":
      return "Correção de rota";
    case "import":
      return "Primeiro som";
    case "hotkey":
      return "Atalho global";
    case "ready":
      return "Configuração concluída";
    default: {
      const _exhaustive: never = screen;
      return _exhaustive;
    }
  }
}

export function OnboardingModal() {
  const open = useUiStore((s) => s.onboardingOpen);
  const setOpen = useUiStore((s) => s.setOnboardingOpen);
  const theme = useUiStore((s) => s.theme);
  const themeMode = useUiStore((s) => s.themeMode);
  const setThemeMode = useUiStore((s) => s.setThemeMode);
  const startMinimized = useUiStore((s) => s.startMinimized);
  const setStartMinimized = useUiStore((s) => s.setStartMinimized);

  const settings = useSettingsStore((s) => s.settings);
  const devices = useSettingsStore((s) => s.devices);
  const setOutputs = useSettingsStore((s) => s.setOutputs);
  const setMasterVolume = useSettingsStore((s) => s.setMasterVolume);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const pushToast = useToastStore((s) => s.push);

  const clips = useLibraryStore((s) => s.clips);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const importFiles = useLibraryStore((s) => s.importFiles);
  const setHotkey = useLibraryStore((s) => s.setHotkey);

  const [screen, setScreen] = useState<Screen>("welcome");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsDto | null>(null);
  const [checkingRoute, setCheckingRoute] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [ensuringVirtual, setEnsuringVirtual] = useState(false);
  const [virtualEnsureMessage, setVirtualEnsureMessage] = useState<string | null>(
    null,
  );
  const [captureHint, setCaptureHint] = useState(
    "CABLE Output (VB-Audio Virtual Cable)",
  );
  const [monitorVolume, setMonitorVolume] = useState(
    () => settings.masterVolume ?? 0.68,
  );
  const [inputDevices, setInputDevices] = useState<
    Array<{ value: string; label: string }>
  >([{ value: "default", label: "Microfone padrão do sistema" }]);
  const [selectedMic, setSelectedMic] = useState("default");
  const [hotkeyDraft, setHotkeyDraft] = useState<string | null>(null);
  const [hotkeyListening, setHotkeyListening] = useState(false);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [launchWithWindows, setLaunchWithWindows] = useState(true);
  const hotkeyArmed = useRef(false);

  const firstClip = useMemo(
    () => clips.find((c) => c.id === selectedId) ?? clips[0] ?? null,
    [clips, selectedId],
  );

  const virtualDevice = useMemo(
    () => pickVirtualCandidate(devices, settings.monitorDevice),
    [devices, settings.monitorDevice],
  );

  const virtualConfigured = isValidVirtualSecondary(
    settings.secondaryDevice,
    settings.monitorDevice,
    devices,
  );

  const routeHealth = useMemo(
    () =>
      analyzeRouteHealth({
        secondaryDevice: settings.secondaryDevice,
        monitorDevice: settings.monitorDevice,
        monitorEnabled: settings.monitorEnabled,
        devices,
        diagnostics,
        micOk: selectedMic.length > 0,
      }),
    [
      settings.secondaryDevice,
      settings.monitorDevice,
      settings.monitorEnabled,
      devices,
      diagnostics,
      selectedMic,
    ],
  );

  const recommendedDevice = useMemo(() => {
    if (settings.monitorDevice) {
      return devices.find((d) => d.name === settings.monitorDevice) ?? null;
    }
    return devices.find((d) => d.isDefault) ?? devices[0] ?? null;
  }, [devices, settings.monitorDevice]);

  const otherDevices = useMemo(
    () => devices.filter((d) => d.name !== recommendedDevice?.name).slice(0, 1),
    [devices, recommendedDevice],
  );

  const runDiagnostics = useCallback(async () => {
    setCheckingRoute(true);
    try {
      const data = await api.getDiagnostics();
      setDiagnostics(data);
      return data;
    } catch {
      setDiagnostics(null);
      return null;
    } finally {
      setCheckingRoute(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setScreen("welcome");
    setHotkeyDraft(null);
    setHotkeyError(null);
    setRepairError(null);
    setVirtualEnsureMessage(null);
    setMonitorVolume(useSettingsStore.getState().settings.masterVolume ?? 0.68);
    void runDiagnostics();
    void (async () => {
      try {
        const cable = await api.getVirtualCableStatus();
        setCaptureHint(cable.captureHint);
        if (cable.pendingAfterReboot && cable.installed && !cable.configured) {
          // Mirror applyVirtual's busy state so "Ativar rota" is disabled
          // while this automatic post-reboot resume is in flight — otherwise
          // a user landing on the "virtual" screen could click it and race
          // this call into a second concurrent VB-CABLE install attempt.
          setEnsuringVirtual(true);
          try {
            const result = await api.ensureVirtualCable();
            await hydrate();
            setCaptureHint(result.status.captureHint);
            setVirtualEnsureMessage(result.message);
            if (!result.rebootRequired) {
              pushToast({ kind: "success", message: result.message });
              setScreen("routing");
            } else {
              setScreen("virtual");
            }
          } catch (err) {
            setVirtualEnsureMessage(
              err instanceof Error ? err.message : String(err),
            );
            setScreen("virtual");
          } finally {
            setEnsuringVirtual(false);
          }
        } else if (cable.pendingAfterReboot && !cable.installed) {
          setVirtualEnsureMessage(
            "Reinício detectado, mas o cabo virtual ainda não apareceu. Tente ativar de novo ou reinicie o PC.",
          );
          setScreen("virtual");
        }
      } catch {
        /* ignore status probe */
      }
      try {
        const list = await api.listInputDevices();
        const physical = list.filter((d) => !isLoopbackCaptureName(d.name));
        const mics = physical.map((d) => ({
          value: d.name,
          label: d.isDefault ? `${d.name} (padrão)` : d.name,
        }));
        if (mics.length > 0) {
          setInputDevices(mics);
          const preferred =
            mics.find((m) =>
              physical.some((d) => d.name === m.value && d.isDefault),
            )?.value ?? mics[0].value;
          setSelectedMic(preferred);
        }
      } catch {
        setInputDevices([
          { value: "default", label: "Microfone padrão do sistema" },
        ]);
        setSelectedMic("default");
      }
    })();
    // Only reset wizard state when the modal opens — not when masterVolume
    // changes mid-flow (the monitor slider would otherwise bounce to welcome).
  }, [open, runDiagnostics, hydrate, pushToast]);

  const runPlayTestSample = useCallback(async () => {
    try {
      await playTestSample();
    } catch (err) {
      pushToast({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [pushToast]);

  const onMonitorVolume = useCallback(
    (volume: number) => {
      setMonitorVolume(volume);
      void setMasterVolume(volume).catch((err: unknown) => {
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    },
    [pushToast, setMasterVolume],
  );

  useEffect(() => {
    if (firstClip?.hotkey) setHotkeyDraft(firstClip.hotkey);
  }, [firstClip?.id, firstClip?.hotkey]);

  const finish = async () => {
    try {
      await api.setOnboardingDone(true);
      await hydrate();
    } catch (err) {
      pushToast({
        kind: "warning",
        message: `Não foi possível salvar a conclusão do onboarding: ${String(err)}. Ele pode reaparecer na próxima abertura.`,
        sticky: true,
      });
    }
    setOpen(false);
    setScreen("welcome");
  };

  const repairRoute = async () => {
    setRepairing(true);
    setRepairError(null);
    try {
      const result = await api.ensureVirtualCable();
      await hydrate();
      setCaptureHint(result.status.captureHint);
      if (result.rebootRequired) {
        pushToast({ kind: "warning", message: result.message });
        setRepairError(result.message);
        return;
      }
      pushToast({ kind: "success", message: result.message });
      setScreen("routing");
    } catch (err) {
      setRepairError(err instanceof Error ? err.message : String(err));
    } finally {
      setRepairing(false);
    }
  };

  const openWindowsSoundSettings = () => {
    void openUrl("ms-settings:sound").catch(() => undefined);
  };

  const openVbCableDownload = () => {
    void openUrl(VB_CABLE_URL).catch(() => undefined);
  };

  const openRouteProblems = async () => {
    setRepairError(null);
    await hydrate();
    await runDiagnostics();
    setScreen("routeError");
  };

  const testRoute = async () => {
    await hydrate();
    const { devices: freshDevices, settings: freshSettings } =
      useSettingsStore.getState();
    const data = await runDiagnostics();
    const ok =
      isValidVirtualSecondary(
        freshSettings.secondaryDevice,
        freshSettings.monitorDevice,
        freshDevices,
      ) && (data?.warnings.length ?? 0) === 0;
    if (!ok) {
      setScreen("routeError");
      return;
    }
    await runPlayTestSample();
  };

  const applyVirtual = async () => {
    setEnsuringVirtual(true);
    setVirtualEnsureMessage(null);
    try {
      const result = await api.ensureVirtualCable();
      await hydrate();
      setCaptureHint(result.status.captureHint);
      setVirtualEnsureMessage(result.message);
      if (result.rebootRequired) {
        pushToast({ kind: "warning", message: result.message });
        return;
      }
      pushToast({ kind: "success", message: result.message });
      setScreen("routing");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setVirtualEnsureMessage(message);
      pushToast({ kind: "error", message });
    } finally {
      setEnsuringVirtual(false);
    }
  };

  const saveHotkeyAndContinue = async () => {
    if (firstClip && hotkeyDraft) {
      try {
        await setHotkey(firstClip.id, hotkeyDraft);
      } catch (err) {
        setHotkeyError(String(err));
        return;
      }
    }
    setScreen("ready");
  };

  useEffect(() => {
    if (!hotkeyListening) return;

    hotkeyArmed.current = false;
    const arm = window.setTimeout(() => {
      hotkeyArmed.current = true;
    }, 120);

    void suspendHotkeys().catch(() => undefined);

    const onKey = (e: KeyboardEvent) => {
      if (!hotkeyArmed.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setHotkeyDraft(null);
        setHotkeyListening(false);
        void resumeHotkeys().catch(() => undefined);
        return;
      }
      const chord = formatChord(e);
      if (!chord) return;
      setHotkeyDraft(chord);
      setHotkeyError(null);
      setHotkeyListening(false);
      void resumeHotkeys().catch(() => undefined);
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(arm);
      window.removeEventListener("keydown", onKey, true);
      void resumeHotkeys().catch(() => undefined);
    };
  }, [hotkeyListening]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeMode(next);
    void api.setTheme(next).catch(() => undefined);
  };

  const stepIndex = screenStepIndex(screen);
  const isReady = screen === "ready";

  if (!open) return null;

  const micLabel =
    inputDevices.find((d) => d.value === selectedMic)?.label ??
    "Microfone do sistema";
  const virtualLabel =
    (virtualConfigured ? settings.secondaryDevice : null) ??
    virtualDevice?.name ??
    "Cabo virtual não configurado";
  const monitorLabel =
    settings.monitorDevice ?? recommendedDevice?.name ?? "Padrão do sistema";

  return (
    <div className="flex h-full bg-[var(--buddio-window)] text-[var(--buddio-text)]">
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--buddio-border-subtle)] bg-[var(--buddio-sidebar)] px-5 pb-5 pt-5">
        <div className="mb-8 flex items-center gap-2.5">
          <img src={markUrl} alt="" className="size-9" />
          <span className="font-brand text-[20px] font-extrabold leading-none">
            Buddio
          </span>
        </div>

        <p className="mb-4 text-[10px] font-semibold tracking-[0.1em] text-[var(--buddio-text-muted)]">
          CONFIGURAÇÃO INICIAL
        </p>

        <ol className="relative flex flex-col gap-0">
          {STEPPER.map((step, i) => {
            const active = !isReady && i === stepIndex;
            const done = isReady || i < stepIndex;
            const upcoming = !done && !active;
            return (
              <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < STEPPER.length - 1 ? (
                  <span
                    className={cn(
                      "absolute left-[13px] top-7 h-[calc(100%-12px)] w-px",
                      done || active
                        ? "bg-[var(--buddio-brand)]"
                        : "bg-[var(--buddio-border)]",
                    )}
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                    done || active
                      ? "bg-[var(--buddio-brand)] text-white"
                      : "bg-[var(--buddio-surface-secondary)] text-[var(--buddio-text-muted)]",
                  )}
                >
                  {done ? <Check size={13} weight="bold" /> : step.id}
                </span>
                <span
                  className={cn(
                    "pt-1 text-[13px]",
                    active
                      ? "font-semibold text-[var(--buddio-text)]"
                      : upcoming
                        ? "font-medium text-[var(--buddio-text-muted)]"
                        : "font-medium text-[var(--buddio-text-secondary)]",
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-auto text-[11px] text-[var(--buddio-text-muted)]">
          {footerLabel(screen)}
        </p>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute right-6 top-5 z-10">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-3 text-[12px] font-semibold text-[var(--buddio-text-secondary)] hover:text-[var(--buddio-text)]"
          >
            {theme === "dark" ? (
              <Moon size={14} weight="fill" />
            ) : (
              <Sun size={14} weight="fill" />
            )}
            {theme === "dark" ? "Escuro" : "Claro"}
            {themeMode === "system" ? (
              <span className="text-[var(--buddio-text-muted)]">· sistema</span>
            ) : null}
          </button>
        </div>

        <div className="buddio-scroll min-h-0 flex-1 overflow-y-auto px-10 pb-6 pt-8">
          {screen === "welcome" ? (
            <WelcomeScreen
              onStart={() => setScreen("output")}
              onSkip={() => void finish()}
            />
          ) : null}

          {screen === "output" ? (
            <OutputScreen
              recommended={recommendedDevice}
              other={otherDevices[0] ?? null}
              selectedName={settings.monitorDevice ?? recommendedDevice?.name ?? ""}
              monitorVolume={monitorVolume}
              onSelect={(name) =>
                void setOutputs(
                  true,
                  name || null,
                  settings.secondaryDevice &&
                    settings.secondaryDevice !== name &&
                    isVirtualDeviceName(settings.secondaryDevice)
                    ? settings.secondaryDevice
                    : null,
                )
              }
              onVolume={onMonitorVolume}
              onPlayTest={() => void runPlayTestSample()}
              onBack={() => setScreen("welcome")}
              onNext={() => setScreen("mic")}
            />
          ) : null}

          {screen === "mic" ? (
            <MicScreen
              options={inputDevices}
              selected={selectedMic}
              onSelect={setSelectedMic}
              onBack={() => setScreen("output")}
              onNext={() => {
                void (async () => {
                  const device =
                    !selectedMic || selectedMic === "default"
                      ? null
                      : selectedMic;
                  try {
                    await api.setMicDevice(device);
                  } catch (err) {
                    pushToast({
                      kind: "error",
                      message: err instanceof Error ? err.message : String(err),
                    });
                    return;
                  }
                  setScreen("virtual");
                })();
              }}
            />
          ) : null}

          {screen === "virtual" ? (
            <VirtualScreen
              virtualLabel={virtualLabel}
              available={Boolean(virtualDevice || virtualConfigured)}
              configured={virtualConfigured}
              captureHint={captureHint}
              ensuring={ensuringVirtual}
              statusMessage={virtualEnsureMessage}
              sampleRate={diagnostics?.sampleRate}
              onActivate={() => void applyVirtual()}
              onInstallManual={openVbCableDownload}
              onBack={() => setScreen("mic")}
              onNext={() => setScreen("routing")}
            />
          ) : null}

          {screen === "routing" ? (
            <RoutingScreen
              micLabel={micLabel}
              virtualLabel={virtualLabel}
              monitorLabel={monitorLabel}
              routeReady={virtualConfigured && routeHealth.monitorOk}
              checking={checkingRoute}
              onTest={() => void testRoute()}
              onProblems={() => void openRouteProblems()}
              onBack={() => setScreen("virtual")}
              onNext={() => setScreen("import")}
            />
          ) : null}

          {screen === "routeError" ? (
            <RouteErrorScreen
              failureTitle={routeHealth.failureTitle}
              failureDetail={routeHealth.failureDetail}
              micOk={routeHealth.micOk}
              mixerOk={routeHealth.mixerOk}
              virtualOk={routeHealth.virtualOk}
              monitorOk={routeHealth.monitorOk}
              needsVirtualInstall={routeHealth.needsVirtualInstall}
              repairing={repairing}
              repairError={repairError}
              onRepair={() => void repairRoute()}
              onInstallVirtual={openVbCableDownload}
              onWindows={openWindowsSoundSettings}
              onBack={() => setScreen("routing")}
              onRetry={() =>
                void testRoute().then(() => {
                  const { devices: freshDevices, settings: freshSettings } =
                    useSettingsStore.getState();
                  if (
                    isValidVirtualSecondary(
                      freshSettings.secondaryDevice,
                      freshSettings.monitorDevice,
                      freshDevices,
                    )
                  ) {
                    void runDiagnostics().then((data) => {
                      if (data && data.warnings.length === 0) {
                        setScreen("routing");
                      }
                    });
                  }
                })
              }
            />
          ) : null}

          {screen === "import" ? (
            <ImportScreen
              clip={firstClip}
              onImport={importFiles}
              onBack={() => setScreen("routing")}
              onNext={() => setScreen("hotkey")}
            />
          ) : null}

          {screen === "hotkey" ? (
            <HotkeyScreen
              clip={firstClip}
              hotkey={hotkeyDraft}
              listening={hotkeyListening}
              error={hotkeyError}
              onListen={() => setHotkeyListening(true)}
              onPlay={() => {
                if (firstClip) void playClip(firstClip.id);
              }}
              onBack={() => setScreen("import")}
              onSave={() => void saveHotkeyAndContinue()}
            />
          ) : null}

          {screen === "ready" ? (
            <ReadyScreen
              monitorLabel={monitorLabel}
              micLabel={micLabel}
              virtualLabel={virtualLabel}
              clipName={firstClip?.name ?? "—"}
              hotkey={hotkeyDraft ?? firstClip?.hotkey}
              launchWithWindows={launchWithWindows}
              startMinimized={startMinimized}
              onLaunchWindows={setLaunchWithWindows}
              onStartMinimized={setStartMinimized}
              onOpen={() => void finish()}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ThemeStepHeader({
  eyebrow,
  title,
  subtitle,
  step,
  total = 5,
  success,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  step?: number;
  total?: number;
  success?: boolean;
}) {
  return (
    <div className="mb-7 max-w-2xl pr-28">
      <div className="mb-3 flex items-start justify-between gap-4">
        <p
          className={cn(
            "text-[11px] font-bold tracking-[0.12em]",
            success
              ? "text-[var(--buddio-success)]"
              : "text-[var(--buddio-brand)]",
          )}
        >
          {eyebrow}
        </p>
        {step != null ? (
          <p className="shrink-0 text-[11px] font-semibold tracking-[0.08em] text-[var(--buddio-text-muted)]">
            ETAPA {step} DE {total}
          </p>
        ) : null}
      </div>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--buddio-text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}

function FooterNav({
  onBack,
  onNext,
  nextLabel = "Continuar",
  nextDisabled,
  backLabel = "Voltar",
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  backLabel?: string;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--buddio-border-subtle)] pt-5">
      {onBack ? (
        <Button variant="secondary" onClick={onBack}>
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      <Button variant="primary" disabled={nextDisabled} onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}

function WelcomeScreen({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex min-h-full items-center gap-10">
      <div className="max-w-xl flex-1">
        <p className="mb-3 text-[11px] font-bold tracking-[0.12em] text-[var(--buddio-brand)]">
          BUDDIO
        </p>
        <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.03em]">
          Seu soundboard, pronto em poucos minutos.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--buddio-text-secondary)]">
          Vamos configurar o áudio, testar a rota e adicionar seu primeiro som.
          Sem conta e sem nuvem.
        </p>

        <ul className="mt-8 flex flex-col gap-4">
          <WelcomeFeature
            title="Atalhos globais"
            body="Toque sons mesmo com o Buddio em segundo plano."
          />
          <WelcomeFeature
            title="Roteamento simples"
            body="Envie o som para chamadas, jogos e transmissões."
          />
          <WelcomeFeature
            title="Tudo local"
            body="Sua biblioteca permanece no computador."
          />
        </ul>

        <div className="mt-9 flex flex-col items-start gap-3">
          <Button variant="primary" className="h-11 min-w-[220px]" onClick={onStart}>
            Começar configuração
          </Button>
          <Button variant="secondary" className="h-11 min-w-[220px]" onClick={onSkip}>
            Configurar depois
          </Button>
          <p className="text-[12px] text-[var(--buddio-text-muted)]">
            Leva cerca de 2 minutos
          </p>
        </div>
      </div>

      <div className="hidden w-[280px] shrink-0 lg:block">
        <div className="flex aspect-square flex-col items-center justify-center rounded-[28px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-8 shadow-[var(--shadow-modal)]">
          <img src={markUrl} alt="" className="mb-6 size-20" />
          <Waveform playing className="mb-8 h-12 w-full" />
          <span className="rounded-[var(--radius-hotkey)] border border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)] px-3 py-1 font-mono text-[13px] font-bold text-[var(--buddio-brand-deep)]">
            F1
          </span>
        </div>
      </div>
    </div>
  );
}

function WelcomeFeature({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--buddio-brand)] text-white">
        <Check size={12} weight="bold" />
      </span>
      <div>
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-[13px] text-[var(--buddio-text-secondary)]">{body}</p>
      </div>
    </li>
  );
}

function OutputScreen({
  recommended,
  other,
  selectedName,
  monitorVolume,
  onSelect,
  onVolume,
  onPlayTest,
  onBack,
  onNext,
}: {
  recommended: { name: string; isDefault: boolean } | null;
  other: { name: string; isDefault: boolean } | null;
  selectedName: string;
  monitorVolume: number;
  onSelect: (name: string) => void;
  onVolume: (v: number) => void;
  onPlayTest: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <ThemeStepHeader
        eyebrow="ÁUDIO"
        title="Onde você quer ouvir os sons?"
        subtitle="Escolha o dispositivo usado para monitorar o Buddio. Isso não altera a saída das chamadas."
        step={1}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {recommended ? (
          <DevicePickCard
            selected={selectedName === recommended.name}
            title={recommended.name}
            subtitle="Dispositivo recomendado"
            footer="Saída padrão do sistema"
            footerAccent
            onClick={() => onSelect(recommended.name)}
          />
        ) : (
          <DevicePickCard
            selected
            title="Padrão do sistema"
            subtitle="Dispositivo recomendado"
            footer="Saída padrão do sistema"
            footerAccent
            onClick={() => onSelect("")}
          />
        )}
        {other ? (
          <DevicePickCard
            selected={selectedName === other.name}
            title={other.name}
            subtitle="Alto-falantes / outro dispositivo"
            footer="Disponível"
            onClick={() => onSelect(other.name)}
          />
        ) : (
          <DevicePickCard
            selected={false}
            title="Nenhum outro dispositivo"
            subtitle="Conecte fones ou alto-falantes"
            footer="Indisponível"
            disabled
          />
        )}
      </div>

      <section className="rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">Teste de monitor</p>
            <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
              Reproduza um som curto para confirmar que você consegue ouvir.
            </p>
            <Waveform playing className="mt-4 h-10 max-w-md" />
            <div className="mt-4 max-w-md">
              <div className="mb-1.5 flex justify-between text-[12px]">
                <span className="text-[var(--buddio-text-secondary)]">
                  Volume do monitor
                </span>
                <span className="font-semibold">
                  {Math.round(monitorVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={monitorVolume}
                onChange={(e) => onVolume(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--buddio-surface-secondary)] accent-[var(--buddio-brand)]"
                aria-label="Volume do monitor"
              />
            </div>
          </div>
          <Button variant="primary" onClick={onPlayTest}>
            Reproduzir teste
          </Button>
        </div>
      </section>

      <FooterNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function DevicePickCard({
  selected,
  title,
  subtitle,
  footer,
  footerAccent,
  onClick,
  disabled,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  footer: string;
  footerAccent?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-card)] border p-4 text-left transition-colors disabled:opacity-50",
        selected
          ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)]"
          : "border-[var(--buddio-border)] bg-[var(--buddio-surface)] hover:border-[var(--buddio-brand-border)]",
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand)] text-white"
              : "border-[var(--buddio-border)]",
          )}
        >
          {selected ? <Check size={12} weight="bold" /> : null}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold">{title}</p>
          <p className="mt-0.5 text-[12px] text-[var(--buddio-text-secondary)]">
            {subtitle}
          </p>
        </div>
      </div>
      <p
        className={cn(
          "text-[12px] font-medium",
          footerAccent
            ? "text-[var(--buddio-brand)]"
            : "text-[var(--buddio-text-muted)]",
        )}
      >
        {footer}
      </p>
    </button>
  );
}

function MicScreen({
  options,
  selected,
  onSelect,
  onBack,
  onNext,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [meterStatus, setMeterStatus] = useState<
    "starting" | "live" | "error"
  >("starting");
  const [meterMessage, setMeterMessage] = useState<string | null>(null);

  return (
    <div>
      <ThemeStepHeader
        eyebrow="MICROFONE"
        title="Escolha e teste seu microfone"
        subtitle="Use o microfone físico (nunca CABLE Output). O Buddio mistura sua voz com os sons no cabo virtual — CABLE Output é só para o Discord."
        step={2}
      />

      <div className="mb-5 max-w-xl">
        <p className="mb-1.5 text-[12px] text-[var(--buddio-text-secondary)]">
          Microfone
        </p>
        <Select
          size="lg"
          aria-label="Microfone"
          value={selected}
          options={
            options.length > 0
              ? options
              : [{ value: "default", label: "Microfone padrão do sistema" }]
          }
          onChange={onSelect}
        />
      </div>

      <section className="mb-4 max-w-xl rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
        <p className="text-[15px] font-bold">Teste sua voz</p>
        <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
          Fale normalmente. O nível deve permanecer na área roxa, sem alcançar o
          amarelo.
        </p>
        {options.some((o) => o.value === selected) ? (
          <LevelMeter
            deviceName={selected === "default" ? null : selected}
            onStatus={(status, message) => {
              setMeterStatus(status);
              setMeterMessage(message);
            }}
          />
        ) : (
          <p className="mt-4 text-[13px] text-[var(--buddio-text-secondary)]">
            Detectando microfones…
          </p>
        )}
        <div className="mt-3 flex justify-between text-[11px]">
          <span className="text-[var(--buddio-text-muted)]">Silêncio</span>
          <span className="font-semibold text-[var(--buddio-brand)]">Ideal</span>
          <span className="text-[var(--buddio-warning)]">Muito alto</span>
        </div>
      </section>

      <div className="max-w-xl rounded-[14px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-4 py-3">
        {meterStatus === "live" ? (
          <>
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <span className="size-2 rounded-full bg-[var(--buddio-success)]" />
              Microfone detectado e funcionando
            </p>
            <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
              Noise gate será ativado automaticamente e poderá ser ajustado
              depois.
            </p>
          </>
        ) : meterStatus === "starting" ? (
          <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--buddio-text-secondary)]">
            <span className="size-2 rounded-full bg-[var(--buddio-text-muted)]" />
            Abrindo microfone…
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--buddio-warning)]">
              <span className="size-2 rounded-full bg-[var(--buddio-warning)]" />
              Microfone indisponível
            </p>
            <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
              {meterMessage ??
                "Verifique se outro app não está usando o microfone e tente novamente."}
            </p>
          </>
        )}
      </div>

      <FooterNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function VirtualScreen({
  virtualLabel,
  available,
  configured,
  captureHint,
  ensuring,
  statusMessage,
  sampleRate,
  onActivate,
  onInstallManual,
  onBack,
  onNext,
}: {
  virtualLabel: string;
  available: boolean;
  configured: boolean;
  captureHint: string;
  ensuring: boolean;
  statusMessage: string | null;
  sampleRate: number | null | undefined;
  onActivate: () => void;
  onInstallManual: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <ThemeStepHeader
        eyebrow="ROTEAMENTO"
        title="Ativar sons nas chamadas"
        subtitle="O Buddio configura a rota automaticamente. No Discord ou Zoom, basta escolher o microfone indicado abaixo."
        step={3}
      />

      <section className="mb-4 max-w-2xl rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand)]">
              <ArrowsLeftRight size={18} weight="bold" />
            </span>
            <div>
              <p className="text-[15px] font-bold">
                {configured || available ? virtualLabel : "Rota para chamadas"}
              </p>
              <p className="text-[12px] text-[var(--buddio-text-secondary)]">
                Configuração automática
              </p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              configured
                ? "bg-[color-mix(in_oklab,var(--buddio-success)_14%,transparent)] text-[var(--buddio-success)]"
                : available
                  ? "bg-[color-mix(in_oklab,var(--buddio-brand)_14%,transparent)] text-[var(--buddio-brand)]"
                  : "bg-[color-mix(in_oklab,var(--buddio-warning)_14%,transparent)] text-[var(--buddio-warning)]",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                configured
                  ? "bg-[var(--buddio-success)]"
                  : available
                    ? "bg-[var(--buddio-brand)]"
                    : "bg-[var(--buddio-warning)]",
              )}
            />
            {configured
              ? "Pronta"
              : available
                ? "Detectada"
                : "Não instalada"}
          </span>
        </div>
        <div className="grid gap-2 border-t border-[var(--buddio-border-subtle)] pt-4 text-[13px]">
          <MetaLine label="Formato" value={`${sampleRate ?? 48000} Hz · estéreo`} />
          <MetaLine label="No Discord/Zoom" value={captureHint} />
          <MetaLine
            label="Tecnologia"
            value="VB-CABLE (vb-cable.com)"
          />
        </div>
      </section>

      <div className="mb-4 max-w-2xl space-y-3 rounded-[14px] border border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)] px-4 py-3">
        <p className="text-[13px] font-semibold text-[var(--buddio-brand-deep)]">
          Um clique configura tudo
        </p>
        <p className="text-[13px] text-[var(--buddio-text-secondary)]">
          Se o cabo ainda não existir, o Windows pedirá permissão de
          administrador. Pode ser necessário reiniciar depois da instalação.
          Com a mixagem ligada, sua voz e os sons saem juntos no Discord.
        </p>
        <p className="text-[12px] text-[var(--buddio-text-secondary)]">
          Usa VB-CABLE de{" "}
          <button
            type="button"
            className="font-semibold text-[var(--buddio-brand)] underline-offset-2 hover:underline"
            onClick={onInstallManual}
          >
            vb-cable.com
          </button>{" "}
          (donationware — contribuições são bem-vindas).
        </p>
        <Button
          variant="primary"
          loading={ensuring}
          onClick={onActivate}
        >
          {configured
            ? "Rechecar rota"
            : available
              ? "Ativar rota"
              : "Instalar e ativar"}
        </Button>
      </div>

      {statusMessage ? (
        <p className="mb-4 max-w-2xl text-[13px] text-[var(--buddio-text-secondary)]">
          {statusMessage}
        </p>
      ) : null}

      <FooterNav
        onBack={onBack}
        onNext={onNext}
        nextLabel={configured ? "Testar roteamento" : "Continuar sem rota"}
        nextDisabled={ensuring}
      />
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--buddio-text-secondary)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function RoutingScreen({
  micLabel,
  virtualLabel,
  monitorLabel,
  routeReady,
  checking,
  onTest,
  onProblems,
  onBack,
  onNext,
}: {
  micLabel: string;
  virtualLabel: string;
  monitorLabel: string;
  routeReady: boolean;
  checking: boolean;
  onTest: () => void;
  onProblems: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <ThemeStepHeader
        eyebrow="ROTEAMENTO"
        title="Vamos testar o caminho completo"
        subtitle="O teste reproduz um tom curto e verifica cada etapa sem abrir outro aplicativo."
        step={3}
      />

      <section className="mb-4 rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
        <p className="mb-4 text-[15px] font-bold">Fluxo de áudio</p>
        <div className="flex flex-wrap items-stretch gap-2">
          <FlowNode title="Microfone" subtitle={micLabel} ok />
          <FlowArrow />
          <FlowNode title="Mixer Buddio" subtitle="Voz + efeitos" ok />
          <FlowArrow />
          <FlowNode
            title="Virtual Mic"
            subtitle={virtualLabel}
            ok={routeReady}
          />
          <FlowArrow />
          <FlowNode title="Monitor" subtitle={monitorLabel} ok />
        </div>
      </section>

      <section className="mb-3 rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14px] font-semibold">
              <span
                className={cn(
                  "size-2 rounded-full",
                  routeReady
                    ? "bg-[var(--buddio-success)]"
                    : "bg-[var(--buddio-warning)]",
                )}
              />
              {routeReady
                ? "Tudo parece pronto"
                : "Rota virtual ainda incompleta"}
            </p>
            <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
              {routeReady
                ? "Execute o teste para confirmar a rota e ouvir o retorno no monitor."
                : "Sem um cabo virtual configurado, o teste de chamada vai falhar. Você ainda pode continuar só com o monitor."}
            </p>
            <div className="mt-3 h-1.5 max-w-sm overflow-hidden rounded-full bg-[var(--buddio-surface-secondary)]">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  checking
                    ? "w-2/3 animate-pulse bg-[var(--buddio-brand)]"
                    : routeReady
                      ? "w-full bg-[var(--buddio-success)]"
                      : "w-1/3 bg-[var(--buddio-warning)]",
                )}
              />
            </div>
          </div>
          <Button variant="primary" loading={checking} onClick={onTest}>
            Executar teste
          </Button>
        </div>
      </section>

      <Button variant="secondary" onClick={onProblems}>
        Estou com problemas
      </Button>

      <FooterNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function RouteErrorScreen({
  failureTitle,
  failureDetail,
  micOk,
  mixerOk,
  virtualOk,
  monitorOk,
  needsVirtualInstall,
  repairing,
  repairError,
  onRepair,
  onInstallVirtual,
  onWindows,
  onBack,
  onRetry,
}: {
  failureTitle: string;
  failureDetail: string;
  micOk: boolean;
  mixerOk: boolean;
  virtualOk: boolean;
  monitorOk: boolean;
  needsVirtualInstall: boolean;
  repairing: boolean;
  repairError: string | null;
  onRepair: () => void;
  onInstallVirtual: () => void;
  onWindows: () => void;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <div>
      <ThemeStepHeader
        eyebrow="DIAGNÓSTICO"
        title="Problema no roteamento"
        subtitle="O Buddio identificou o ponto da falha. Se houver um cabo virtual instalado, o reparo automático pode corrigir a seleção."
        step={3}
      />

      <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-[var(--buddio-danger)]/50 bg-[color-mix(in_oklab,var(--buddio-danger)_12%,transparent)] px-4 py-3">
        <WarningCircle
          size={28}
          weight="fill"
          className="shrink-0 text-[var(--buddio-danger)]"
        />
        <div>
          <p className="text-[14px] font-bold">{failureTitle}</p>
          <p className="mt-1 text-[13px] text-[var(--buddio-text-secondary)]">
            {failureDetail}
          </p>
        </div>
      </div>

      <section className="mb-4 max-w-xl rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
        <p className="mb-3 text-[15px] font-bold">Diagnóstico</p>
        <DiagRow label="Microfone de entrada" ok={micOk} />
        <DiagRow label="Mixer Buddio" ok={mixerOk} />
        <DiagRow
          label="Cabo virtual"
          ok={virtualOk}
          failLabel="Não encontrado"
        />
        <DiagRow label="Monitor" ok={monitorOk} />
      </section>

      {repairError ? (
        <p className="mb-3 text-[13px] text-[var(--buddio-danger)]">{repairError}</p>
      ) : null}

      <div className="mb-2 flex flex-wrap gap-2">
        <Button variant="primary" loading={repairing} onClick={onRepair}>
          Reparar rota automaticamente
        </Button>
        {needsVirtualInstall ? (
          <Button variant="secondary" onClick={onInstallVirtual}>
            Baixar VB-CABLE
          </Button>
        ) : (
          <Button variant="secondary" onClick={onWindows}>
            Abrir configurações do Windows
          </Button>
        )}
      </div>

      <FooterNav
        onBack={onBack}
        onNext={onRetry}
        nextLabel="Tentar novamente"
      />
    </div>
  );
}

function DiagRow({
  label,
  ok,
  failLabel = "Falha",
}: {
  label: string;
  ok: boolean;
  failLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--buddio-border-subtle)] py-2.5 last:border-none">
      <span className="flex items-center gap-2 text-[13px]">
        <span
          className={cn(
            "size-2 rounded-full",
            ok ? "bg-[var(--buddio-success)]" : "bg-[var(--buddio-danger)]",
          )}
        />
        {label}
      </span>
      <span
        className={cn(
          "text-[13px] font-semibold",
          ok ? "text-[var(--buddio-success)]" : "text-[var(--buddio-danger)]",
        )}
      >
        {ok ? "Funcionando" : failLabel}
      </span>
    </div>
  );
}

function ImportScreen({
  clip,
  onImport,
  onBack,
  onNext,
}: {
  clip: {
    id: string;
    name: string;
    ext: string;
    durationMs: number;
    peaks: number[] | null;
    emoji: string | null;
  } | null;
  onImport: (paths?: string[] | null) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <ThemeStepHeader
        eyebrow="BIBLIOTECA"
        title="Adicione seu primeiro som"
        subtitle="Você pode arrastar um arquivo ou escolher um áudio do computador. O original permanece intacto."
        step={4}
      />

      <ImportDropzone
        onImport={onImport}
        variant="hero"
        label="Selecionar arquivo"
      />

      {clip ? (
        <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-4 py-3">
          <ClipIcon
            emoji={clip.emoji}
            size={36}
            className="shrink-0 overflow-hidden rounded-lg"
          />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold">{clip.name}</p>
            <p className="text-[12px] text-[var(--buddio-text-secondary)]">
              {formatDuration(clip.durationMs)} · {clip.ext.toUpperCase()} · 48
              kHz
            </p>
          </div>
          <Waveform peaks={clip.peaks} className="mx-4 hidden h-8 flex-1 sm:flex" />
          <button
            type="button"
            aria-label="Tocar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--buddio-brand)] text-white"
            onClick={() => void playClip(clip.id)}
          >
            <Play size={16} weight="fill" className="translate-x-px" />
          </button>
        </div>
      ) : null}

      <FooterNav onBack={onBack} onNext={onNext} nextDisabled={!clip} />
    </div>
  );
}

function HotkeyScreen({
  clip,
  hotkey,
  listening,
  error,
  onListen,
  onPlay,
  onBack,
  onSave,
}: {
  clip: {
    id: string;
    name: string;
    durationMs: number;
    peaks: number[] | null;
    emoji: string | null;
  } | null;
  hotkey: string | null;
  listening: boolean;
  error: string | null;
  onListen: () => void;
  onPlay: () => void;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div>
      <ThemeStepHeader
        eyebrow="ATALHO GLOBAL"
        title="Escolha uma tecla para tocar o som"
        subtitle="O atalho funcionará mesmo com o Buddio minimizado no tray."
        step={5}
      />

      {clip ? (
        <div className="mb-5 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-4 py-3">
          <ClipIcon
            emoji={clip.emoji}
            size={36}
            className="shrink-0 overflow-hidden rounded-lg"
          />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold">{clip.name}</p>
            <p className="text-[12px] text-[var(--buddio-text-secondary)]">
              {formatDuration(clip.durationMs)} · Chamadas
            </p>
          </div>
          <Waveform peaks={clip.peaks} className="mx-4 hidden h-8 flex-1 sm:flex" />
          <button
            type="button"
            aria-label="Tocar"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--buddio-brand)] text-white"
            onClick={onPlay}
          >
            <Play size={16} weight="fill" className="translate-x-px" />
          </button>
        </div>
      ) : (
        <p className="mb-5 text-[13px] text-[var(--buddio-warning)]">
          Importe um som na etapa anterior para definir o atalho.
        </p>
      )}

      <section className="mb-4 max-w-xl rounded-[var(--radius-card)] border border-[var(--buddio-brand-border)] bg-[var(--buddio-surface)] p-5">
        <p className="mb-3 text-[13px] text-[var(--buddio-text-secondary)]">
          Pressione a combinação desejada
        </p>
        <button
          type="button"
          onClick={onListen}
          className={cn(
            "flex h-14 w-full items-center justify-center rounded-[12px] border text-[18px] font-semibold transition-colors",
            listening
              ? "border-[var(--buddio-brand)] bg-[var(--buddio-brand-soft)] text-[var(--buddio-brand)]"
              : "border-[var(--buddio-border)] bg-[var(--buddio-window)] text-[var(--buddio-brand)]",
          )}
        >
          {listening
            ? "Aguardando combinação…"
            : hotkey
              ? displayHotkey(hotkey)
              : "Clique e pressione as teclas"}
        </button>
        {hotkey && !listening ? (
          <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--buddio-success)]">
            <Check size={14} weight="bold" /> Atalho disponível
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-[12px] text-[var(--buddio-danger)]">{error}</p>
        ) : null}
      </section>

      <div className="max-w-xl rounded-[14px] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="size-2 rounded-full bg-[var(--buddio-success)]" />
          Atalhos globais serão ativados quando o Buddio iniciar.
        </p>
        <p className="mt-1 text-[12px] text-[var(--buddio-text-secondary)]">
          Você poderá alterar este comportamento nas configurações.
        </p>
      </div>

      <FooterNav
        onBack={onBack}
        onNext={onSave}
        nextLabel="Salvar atalho"
        nextDisabled={!clip || !hotkey}
      />
    </div>
  );
}

function ReadyScreen({
  monitorLabel,
  micLabel,
  virtualLabel,
  clipName,
  hotkey,
  launchWithWindows,
  startMinimized,
  onLaunchWindows,
  onStartMinimized,
  onOpen,
}: {
  monitorLabel: string;
  micLabel: string;
  virtualLabel: string;
  clipName: string;
  hotkey: string | null | undefined;
  launchWithWindows: boolean;
  startMinimized: boolean;
  onLaunchWindows: (v: boolean) => void;
  onStartMinimized: (v: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <div>
      <ThemeStepHeader
        eyebrow="CONFIGURAÇÃO CONCLUÍDA"
        title="Tudo pronto para tocar."
        subtitle="Seu áudio está roteado, o primeiro som foi importado e o atalho global está ativo."
        success
      />

      <section className="mb-4 max-w-xl rounded-[var(--radius-card)] border border-[var(--buddio-border)] bg-[var(--buddio-surface)] p-5">
        <p className="mb-2 text-[15px] font-bold">Resumo</p>
        <SummaryRow label="Saída" value={monitorLabel} />
        <SummaryRow label="Microfone" value={micLabel} />
        <SummaryRow label="Rota" value={virtualLabel} />
        <SummaryRow
          label="Primeiro som"
          value={`${clipName}${hotkey ? ` · ${displayHotkey(hotkey)}` : ""}`}
        />
      </section>

      <div className="mb-6 flex max-w-xl items-center justify-between gap-4 rounded-[14px] border border-[var(--buddio-brand-border)] bg-[var(--buddio-brand-soft)] px-4 py-3">
        <div>
          <p className="text-[14px] font-semibold text-[var(--buddio-brand-deep)]">
            Buddio Mini no tray
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--buddio-text-secondary)]">
            Acesse seus sons fixados sem abrir a janela completa.
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--buddio-brand)] font-brand text-[16px] font-bold text-white">
          B
        </span>
      </div>

      <div className="flex max-w-xl flex-wrap items-end justify-between gap-4">
        <div>
          <Toggle
            label="Iniciar com o Windows"
            checked={launchWithWindows}
            onChange={onLaunchWindows}
          />
          <div className="mt-2">
            <Toggle
              label="Iniciar minimizado na bandeja"
              checked={startMinimized}
              onChange={onStartMinimized}
            />
          </div>
          <p className="mt-2 text-[12px] text-[var(--buddio-text-muted)]">
            Você pode refazer o teste a qualquer momento em Roteamento.
          </p>
        </div>
        <Button variant="primary" className="h-11 px-5" onClick={onOpen}>
          Abrir soundboard
        </Button>
      </div>
    </div>
  );
}

function FlowArrow() {
  return (
    <span className="self-center text-[var(--buddio-text-muted)]" aria-hidden>
      →
    </span>
  );
}

function FlowNode({
  title,
  subtitle,
  ok,
}: {
  title: string;
  subtitle: string;
  ok?: boolean;
}) {
  return (
    <div className="relative min-w-[110px] flex-1 rounded-[14px] border border-[var(--buddio-brand-border)] bg-[var(--buddio-surface-secondary)] px-3 py-3">
      {ok ? (
        <span className="absolute left-2.5 top-2.5 size-1.5 rounded-full bg-[var(--buddio-success)]" />
      ) : null}
      <p className="mt-2 text-[13px] font-semibold">{title}</p>
      <p className="mt-1 truncate text-[11px] text-[var(--buddio-text-secondary)]">
        {subtitle}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--buddio-border-subtle)] py-2.5 text-[13px] last:border-none">
      <span className="flex items-center gap-2 text-[var(--buddio-text-secondary)]">
        <span className="flex size-4 items-center justify-center rounded-full bg-[var(--buddio-success)] text-white">
          <Check size={10} weight="bold" />
        </span>
        {label}
      </span>
      <span className="max-w-[60%] truncate font-semibold">{value}</span>
    </div>
  );
}

function LevelMeter({
  deviceName,
  onStatus,
}: {
  deviceName?: string | null;
  onStatus?: (
    status: "starting" | "live" | "error",
    message: string | null,
  ) => void;
}) {
  const barCount = 14;
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => 0.08),
  );
  const [meterLevel, setMeterLevel] = useState(0);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const generationRef = useRef(0);
  const opChainRef = useRef(Promise.resolve());

  useEffect(() => {
    const generation = ++generationRef.current;
    let timer = 0;
    onStatusRef.current?.("starting", null);

    const target =
      deviceName && deviceName !== "default" ? deviceName : null;

    opChainRef.current = opChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (generation !== generationRef.current) return;
        try {
          await api.startMicMeter(target);
          if (generation !== generationRef.current) return;

          onStatusRef.current?.("live", null);
          const tick = async () => {
            if (generation !== generationRef.current) return;
            try {
              const level = await api.getMicLevel();
              if (generation !== generationRef.current) return;
              const clamped = Math.max(0, Math.min(1, level));
              setMeterLevel(clamped);
              setLevels(
                Array.from({ length: barCount }, (_, i) => {
                  const threshold = (i + 1) / barCount;
                  const active = clamped >= threshold * 0.85;
                  return active
                    ? Math.max(0.12, clamped * (0.55 + (i / barCount) * 0.45))
                    : 0.08;
                }),
              );
            } catch {
              /* keep last */
            }
            if (generation === generationRef.current) {
              timer = window.setTimeout(() => void tick(), 50);
            }
          };
          void tick();
        } catch (err) {
          if (generation !== generationRef.current) return;
          const message = err instanceof Error ? err.message : String(err);
          onStatusRef.current?.("error", message);
          setLevels(Array.from({ length: barCount }, () => 0.08));
          setMeterLevel(0);
        }
      });

    return () => {
      window.clearTimeout(timer);
      opChainRef.current = opChainRef.current
        .catch(() => undefined)
        .then(async () => {
          await api.stopMicMeter().catch(() => undefined);
        });
    };
  }, [deviceName]);

  return (
    <div className="mt-4">
      <div
        className="flex h-16 items-end justify-center gap-1"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(meterLevel * 100)}
        aria-label="Nível do microfone"
      >
        {levels.map((level, i) => (
          <span
            key={i}
            className={cn(
              "w-2 rounded-full transition-[height] duration-75",
              level > 0.78
                ? "bg-[var(--buddio-warning)]"
                : "bg-[var(--buddio-brand)]",
            )}
            style={{ height: `${Math.round(level * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--buddio-surface-secondary)]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-75",
            meterLevel > 0.78
              ? "bg-[var(--buddio-warning)]"
              : "bg-[var(--buddio-brand)]",
          )}
          style={{ width: `${Math.round(meterLevel * 100)}%` }}
        />
      </div>
    </div>
  );
}
