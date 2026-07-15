// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticsDto } from "../lib/api";
import { useHelpStore } from "../stores/helpStore";
import { HelpDiagnosticsModal } from "./HelpDiagnosticsModal";

const missing: DiagnosticsDto = {
  devices: [{ name: "Speakers", isDefault: true }], sampleRate: 48_000,
  warnings: ["Secondary output device is not configured"],
  monitorDevice: "Speakers", secondaryDevice: null, monitorEnabled: true,
};
const ready: DiagnosticsDto = { ...missing, secondaryDevice: "CABLE Input", devices: [...missing.devices, { name: "CABLE Input", isDefault: false }], warnings: [] };

const { getDiagnostics, ensureVirtualCable } = vi.hoisted(() => ({
  getDiagnostics: vi.fn<() => Promise<DiagnosticsDto>>(),
  ensureVirtualCable: vi.fn<() => Promise<{ message: string; rebootRequired: boolean }>>(),
}));

vi.mock("../lib/api", () => ({ getDiagnostics, ensureVirtualCable }));

describe("HelpDiagnosticsModal", () => {
  beforeEach(() => {
    getDiagnostics.mockReset();
    ensureVirtualCable.mockReset();
    useHelpStore.setState({ isOpen: false, problemId: null });
  });

  it("shows resolved only after a repair triggers a fresh health check", async () => {
    getDiagnostics.mockResolvedValueOnce(missing).mockResolvedValueOnce(ready);
    ensureVirtualCable.mockResolvedValue({ message: "Configured", rebootRequired: false });
    render(<HelpDiagnosticsModal />);
    useHelpStore.getState().open("virtual-mic-missing");
    fireEvent.click(await screen.findByRole("button", { name: /repair virtual/i }));
    await waitFor(() => expect(getDiagnostics).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Resolved")).toBeTruthy();
  });
});
