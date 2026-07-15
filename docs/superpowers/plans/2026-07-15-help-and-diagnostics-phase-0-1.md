# Help and diagnostics center — Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use \`superpowers:executing-plans\` to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Give every Buddio user a persistent, offline-first route-health journey that explains failures, runs only explicit safe repairs, and verifies the resulting state.

**Architecture:** Keep native audio probing in \`get_diagnostics\`; add a pure frontend classifier that turns its snapshot into stable, localized problem data. A Zustand Help store owns dialog state and requested symptom. The Help dialog, Routing, sidebar, and status bar consume that same classification.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri 2, existing Tailwind design tokens.

## Global Constraints

- Windows only; preserve the real-time audio callback path.
- Essential guidance is bundled and works offline; links are supplemental.
- No telemetry, account, automatic diagnostic upload, or support promise.
- Never label a repair successful before a fresh diagnostic snapshot passes.
- Never modify Windows configuration or install VB-CABLE without explicit confirmation.
- Use English and Portuguese catalog keys in exact parity.
- Preserve keyboard access, visible focus, reduced-motion behavior, and live status messages.

---

## File structure

- Create \`src/lib/routeHealth.ts\`: pure DTO-to-health/problem classification and diagnostic sanitization.
- Create \`src/lib/routeHealth.test.ts\`: classifier, repair eligibility, and sanitizer behavior.
- Create \`src/stores/helpStore.ts\`: Help dialog state, requested symptom, and preferred app in local storage.
- Create \`src/components/HelpDiagnosticsModal.tsx\`: health check, problem explanation, offline guides, safe repair, and refreshed verification UI.
- Modify \`src/components/layout/Sidebar.tsx\`, \`src/components/layout/StatusBar.tsx\`, \`src/views/Routing.tsx\`, \`src/views/Library.tsx\`, \`src/App.tsx\`, and both i18n catalogs.
- Delete \`src/components/DiagnosticsModal.tsx\` only after every caller uses the new modal.

## Task 1: Route-health domain

**Files:**
- Create: \`src/lib/routeHealth.ts\`
- Create: \`src/lib/routeHealth.test.ts\`

**Interfaces:**
- Consumes: \`DiagnosticsDto\` from \`src/lib/api.ts\`.
- Produces: \`classifyRouteHealth(snapshot): RouteHealth\`, \`sanitizeDiagnostics(snapshot): string\`, and \`RouteProblemId\`.

- [ ] **Step 1: Write failing tests.**

~~~ts
import { describe, expect, it } from "vitest";
import { classifyRouteHealth, sanitizeDiagnostics } from "./routeHealth";

const base = {
  devices: [{ name: "Speakers", isDefault: true }],
  sampleRate: 48000, warnings: [], monitorDevice: "Speakers",
  secondaryDevice: "CABLE Input", monitorEnabled: true,
};

describe("classifyRouteHealth", () => {
  it("blocks a call route when the virtual microphone is absent", () => {
    expect(classifyRouteHealth({ ...base, secondaryDevice: null }).problem.id)
      .toBe("virtual-mic-missing");
  });
  it("does not report ready when the selected monitor disappeared", () => {
    expect(classifyRouteHealth({ ...base, monitorDevice: "Old headset" }).problem.id)
      .toBe("monitor-missing");
  });
  it("sanitizes only allowed diagnostic fields", () => {
    expect(sanitizeDiagnostics(base)).not.toContain("undefined");
  });
});
~~~

- [ ] **Step 2: Run RED.**

Run: \`bun run test src/lib/routeHealth.test.ts\`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write minimal implementation.**

~~~ts
export type RouteProblemId =
  | "virtual-mic-missing" | "monitor-disabled" | "monitor-missing"
  | "device-changed" | "route-ready";
export type RouteHealth = {
  level: "ready" | "attention" | "blocked";
  problem: { id: RouteProblemId; repair: "ensure-virtual-cable" | "open-routing" | "none" };
};

export function classifyRouteHealth(snapshot: DiagnosticsDto): RouteHealth {
  const has = (name: string | null) =>
    name !== null && snapshot.devices.some((device) => device.name === name);
  if (!snapshot.secondaryDevice) return {
    level: "blocked", problem: { id: "virtual-mic-missing", repair: "ensure-virtual-cable" },
  };
  if (!has(snapshot.secondaryDevice)) return {
    level: "blocked", problem: { id: "device-changed", repair: "open-routing" },
  };
  if (snapshot.monitorEnabled && !has(snapshot.monitorDevice)) return {
    level: "attention", problem: { id: "monitor-missing", repair: "open-routing" },
  };
  if (!snapshot.monitorEnabled) return {
    level: "attention", problem: { id: "monitor-disabled", repair: "open-routing" },
  };
  return { level: "ready", problem: { id: "route-ready", repair: "none" } };
}
~~~

Implement \`sanitizeDiagnostics\` as formatted text containing only device names, sample rate, selected route, monitor state, and warnings.

- [ ] **Step 4: Run GREEN and regression tests.**

Run: \`bun run test src/lib/routeHealth.test.ts && bun run test\`

Expected: PASS.

- [ ] **Step 5: Commit.**

~~~powershell
git add src/lib/routeHealth.ts src/lib/routeHealth.test.ts
git commit -m "feat: classify route health"
~~~

## Task 2: Help state and localized content

**Files:**
- Create: \`src/stores/helpStore.ts\`
- Create: \`src/stores/helpStore.test.ts\`
- Modify: \`src/i18n/en.ts\`, \`src/i18n/pt.ts\`, \`src/i18n/i18n.test.ts\`

**Interfaces:**
- Consumes: \`RouteProblemId\`.
- Produces: \`useHelpStore.open(problemId?: RouteProblemId)\`, \`close()\`, \`problemId\`, \`preferredApp\`, and \`setPreferredApp(app)\`.

- [ ] **Step 1: Write failing state test.**

~~~ts
beforeEach(() => useHelpStore.setState({
  open: false, problemId: null, preferredApp: "discord",
}));
it("opens Help for the detected problem", () => {
  useHelpStore.getState().open("virtual-mic-missing");
  expect(useHelpStore.getState()).toMatchObject({
    open: true, problemId: "virtual-mic-missing",
  });
});
~~~

- [ ] **Step 2: Run RED.**

Run: \`bun run test src/stores/helpStore.test.ts\`

Expected: FAIL because \`helpStore\` is absent.

- [ ] **Step 3: Implement the store and catalog keys.**

Use local-storage key \`buddio.preferred-app\`. Add exact-parity keys for Help, Ready, Attention needed, Blocked, each supported problem title/detail/action, manual symptoms, offline guide names, diagnostic preview, Copy, Save, and sidebar Help. Never show raw native warning text as the primary UI copy.

- [ ] **Step 4: Run GREEN.**

Run: \`bun run test src/stores/helpStore.test.ts src/i18n/i18n.test.ts\`

Expected: PASS; catalog parity passes.

- [ ] **Step 5: Commit.**

~~~powershell
git add src/stores/helpStore.ts src/stores/helpStore.test.ts src/i18n/en.ts src/i18n/pt.ts src/i18n/i18n.test.ts
git commit -m "feat: add help state and localized guidance"
~~~

## Task 3: Help modal and verified repair

**Files:**
- Create: \`src/components/HelpDiagnosticsModal.tsx\`
- Create: \`src/components/HelpDiagnosticsModal.test.tsx\`
- Modify: \`src/App.tsx\`
- Delete: \`src/components/DiagnosticsModal.tsx\`

**Interfaces:**
- Consumes: \`api.getDiagnostics\`, \`api.ensureVirtualCable\`, \`classifyRouteHealth\`, \`sanitizeDiagnostics\`, and \`useHelpStore\`.
- Produces: one modal with an \`aria-live="polite"\` repair result.

- [ ] **Step 1: Write failing interaction test.**

~~~tsx
it("shows resolved only after repair triggers a second health check", async () => {
  // The api boundary returns missing cable, then a healthy snapshot.
  render(<HelpDiagnosticsModal />);
  useHelpStore.getState().open("virtual-mic-missing");
  await userEvent.click(await screen.findByRole("button", { name: /repair/i }));
  expect(api.getDiagnostics).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/resolved/i)).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run RED.**

Run: \`bun run test src/components/HelpDiagnosticsModal.test.tsx\`

Expected: FAIL because the Help modal is absent.

- [ ] **Step 3: Implement minimal behavior.**

On open, call \`getDiagnostics\`, classify it, and render one title, consequence, and primary action. \`ensureVirtualCable\` runs only after its button is clicked; show the native result message, then call \`getDiagnostics\` again. Render Resolved only when the second classification is \`route-ready\`. For \`open-routing\`, close Help then call \`useUiStore.getState().setView("routing")\`. A healthy route renders manual symptom choices and bundled Discord, Teams, Zoom, Meet, OBS, and Other steps. Render sanitized diagnostics inside \`details\` before Copy or Save; Copy requires a click. Keep Close available while loading.

- [ ] **Step 4: Mount it and remove obsolete modal.**

Replace \`<DiagnosticsModal />\` in \`src/App.tsx\` with \`<HelpDiagnosticsModal />\`; remove the old import and delete DiagnosticsModal after TypeScript finds no references.

- [ ] **Step 5: Run GREEN.**

Run: \`bun run test src/components/HelpDiagnosticsModal.test.tsx && bun run build && bun run test\`

Expected: PASS and build exit 0.

- [ ] **Step 6: Commit.**

~~~powershell
git add src/components/HelpDiagnosticsModal.tsx src/components/HelpDiagnosticsModal.test.tsx src/App.tsx src/components/DiagnosticsModal.tsx
git commit -m "feat: add verified help diagnostics"
~~~

## Task 4: Entry points and foundational corrections

**Files:**
- Modify: \`src/components/layout/Sidebar.tsx\`
- Modify: \`src/components/layout/StatusBar.tsx\`
- Modify: \`src/views/Routing.tsx\`
- Modify: \`src/views/Library.tsx\`
- Create: \`src/components/layout/Sidebar.test.tsx\`
- Create: \`src/views/Library.test.tsx\`
- Modify: both i18n catalogs.

**Interfaces:**
- Consumes: \`useHelpStore.open\` and \`classifyRouteHealth\`.
- Produces: Help beside Settings, a clickable status-health summary, a contextual Repair route entry, and a no-results library state.

- [ ] **Step 1: Write failing entry-point tests.**

~~~tsx
it("opens Help from the sidebar", async () => {
  render(<Sidebar />);
  await userEvent.click(screen.getByRole("button", { name: /help/i }));
  expect(useHelpStore.getState().open).toBe(true);
});

it("shows no results instead of library empty after search", () => {
  render(<LibraryView />);
  expect(screen.getByText(/no results/i)).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run RED.**

Run: \`bun run test src/components/layout/Sidebar.test.tsx src/views/Library.test.tsx\`

Expected: FAIL with absent Help button/no-results text.

- [ ] **Step 3: Implement only the specified integration.**

Add the Help button directly above Settings. In StatusBar, derive lightweight health from settings and render an accessible button labelled with the health level that opens Help; preserve profile/output/mic information. In Routing remove \`Search\`, \`query\`, and their imports. Both diagnostics and Repair route open Help; only pass \`"virtual-mic-missing"\` to Repair route when no secondary output is selected. In Library, with nonempty query and no matches, render \`library.noResultsTitle\`, the query, and a Clear search button that calls \`setQuery("")\`.

- [ ] **Step 4: Run GREEN.**

Run: \`bun run test src/components/layout/Sidebar.test.tsx src/views/Library.test.tsx && bun run build && bun run test\`

Expected: PASS.

- [ ] **Step 5: Commit.**

~~~powershell
git add src/components/layout/Sidebar.tsx src/components/layout/StatusBar.tsx src/views/Routing.tsx src/views/Library.tsx src/components/layout/Sidebar.test.tsx src/views/Library.test.tsx src/i18n/en.ts src/i18n/pt.ts
git commit -m "feat: expose help across route health UI"
~~~

## Task 5: Application validation

**Files:**
- Create: \`docs/verification/2026-07-15-help-diagnostics-phase-0-1.md\`

- [ ] **Step 1: Run the complete automated suite.**

Run: \`bun run test && bun run build && cargo test --workspace\`

Expected: all commands exit 0.

- [ ] **Step 2: Verify the desktop journey using deterministic devices.**

Run: \`$env:BUDDIO_TEST_FAKE_DEVICES='1'; bun run dev:app\`

Verify Help from sidebar/status; missing virtual cable explanation; repair only after click; fresh verification after repair; offline manual guide; Library no-results; keyboard focus return.

- [ ] **Step 3: Write non-sensitive verification evidence.**

Record commands, platform, and pass/fail observations. Do not place device paths, library content, or copied diagnostic text in the report.

- [ ] **Step 4: Commit.**

~~~powershell
git add docs/verification/2026-07-15-help-diagnostics-phase-0-1.md
git commit -m "docs: verify help diagnostics phase 0 and 1"
~~~

## Plan self-review

- Phase 0 corrections and every Phase 1 requirement map to Tasks 1–5.
- Backup, profiles, recording, clip icons, smart collections, and sound packs deliberately receive their own implementation plans after this verified delivery.
- The plan contains no deferred behavior marker, unspecified validation step, or inconsistent interface name.

