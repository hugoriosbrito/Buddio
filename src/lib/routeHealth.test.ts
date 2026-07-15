import { describe, expect, it } from "vitest";
import type { DiagnosticsDto } from "./api";
import { classifyRouteHealth, sanitizeDiagnostics } from "./routeHealth";

const base: DiagnosticsDto = {
  devices: [
    { name: "Speakers", isDefault: true },
    { name: "CABLE Input", isDefault: false },
  ],
  sampleRate: 48_000,
  warnings: [],
  monitorDevice: "Speakers",
  secondaryDevice: "CABLE Input",
  monitorEnabled: true,
};

describe("classifyRouteHealth", () => {
  it("blocks call routing when no virtual microphone is configured", () => {
    expect(classifyRouteHealth({ ...base, secondaryDevice: null })).toMatchObject({
      level: "blocked",
      problem: { id: "virtual-mic-missing", repair: "ensure-virtual-cable" },
    });
  });

  it("needs attention when the configured monitor device disappeared", () => {
    expect(
      classifyRouteHealth({ ...base, monitorDevice: "Old headset" }),
    ).toMatchObject({
      level: "attention",
      problem: { id: "monitor-missing", repair: "open-routing" },
    });
  });

  it("reports ready only for an available configured route", () => {
    expect(classifyRouteHealth(base)).toMatchObject({
      level: "ready",
      problem: { id: "route-ready", repair: "none" },
    });
  });
});

describe("sanitizeDiagnostics", () => {
  it("includes route facts without exposing unknown values", () => {
    const report = sanitizeDiagnostics({
      ...base,
      warnings: ["Monitor output is disabled"],
    });

    expect(report).toContain("CABLE Input");
    expect(report).toContain("48000 Hz");
    expect(report).toContain("Monitor output is disabled");
    expect(report).not.toContain("undefined");
  });
});
