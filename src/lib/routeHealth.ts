import type { DiagnosticsDto } from "./api";

export type RouteProblemId =
  | "virtual-mic-missing"
  | "monitor-disabled"
  | "monitor-missing"
  | "device-changed"
  | "route-ready";

export type RouteHealthLevel = "ready" | "attention" | "blocked";

export type RouteRepair = "ensure-virtual-cable" | "open-routing" | "none";

export type RouteHealth = {
  level: RouteHealthLevel;
  problem: {
    id: RouteProblemId;
    repair: RouteRepair;
  };
};

function hasDevice(snapshot: DiagnosticsDto, name: string | null): boolean {
  return name !== null && snapshot.devices.some((device) => device.name === name);
}

export function classifyRouteHealth(snapshot: DiagnosticsDto): RouteHealth {
  if (!snapshot.secondaryDevice) {
    return {
      level: "blocked",
      problem: { id: "virtual-mic-missing", repair: "ensure-virtual-cable" },
    };
  }

  if (!hasDevice(snapshot, snapshot.secondaryDevice)) {
    return {
      level: "blocked",
      problem: { id: "device-changed", repair: "open-routing" },
    };
  }

  if (!snapshot.monitorEnabled) {
    return {
      level: "attention",
      problem: { id: "monitor-disabled", repair: "open-routing" },
    };
  }

  if (!hasDevice(snapshot, snapshot.monitorDevice)) {
    return {
      level: "attention",
      problem: { id: "monitor-missing", repair: "open-routing" },
    };
  }

  return {
    level: "ready",
    problem: { id: "route-ready", repair: "none" },
  };
}

export function sanitizeDiagnostics(snapshot: DiagnosticsDto): string {
  const deviceNames = snapshot.devices.map((device) => device.name).join(", ");
  const sampleRate = snapshot.sampleRate ? `${snapshot.sampleRate} Hz` : "Unknown";
  const monitor = snapshot.monitorEnabled
    ? (snapshot.monitorDevice ?? "System default")
    : "Off";
  const secondary = snapshot.secondaryDevice ?? "Not configured";
  const warnings = snapshot.warnings.length
    ? snapshot.warnings.map((warning) => `- ${warning}`).join("\n")
    : "- None";

  return [
    "Buddio diagnostics",
    `Devices: ${deviceNames || "None"}`,
    `Sample rate: ${sampleRate}`,
    `Virtual microphone: ${secondary}`,
    `Monitor: ${monitor}`,
    "Warnings:",
    warnings,
  ].join("\n");
}
