import {
  invoke,
  completeOnboardingQuickly,
  importTestClip,
  deleteAllClips,
  listClips,
} from "../helpers/appActions.mjs";

// Technical spike: the `main` and `mini` windows are two separate Tauri
// WebviewWindows. Whether tauri-driver/msedgedriver exposes them as
// switchable WebDriver window handles is unconfirmed for Tauri v2 — if it
// doesn't, every test below is skipped with a clear reason instead of
// failing the whole suite, and the same behaviour is covered instead by the
// MiniApp.test.tsx Vitest component tests (see e2e/README.md).
describe("Mini window", () => {
  let miniHandle = null;

  before(async () => {
    await completeOnboardingQuickly(browser);
    await $("main").waitForExist({ timeout: 15000 });
    await deleteAllClips(browser);
    await importTestClip(browser);
    const clips = await listClips(browser);
    await invoke(browser, "set_pinned_clips", { clipIds: [clips[0].id] });
    await invoke(browser, "show_mini_window", {});

    const mainHandle = await browser.getWindowHandle();
    const handles = await browser.getWindowHandles();
    miniHandle = handles.find((h) => h !== mainHandle) ?? null;
  });

  beforeEach(async function () {
    if (!miniHandle) {
      this.skip();
      return;
    }
    await browser.switchToWindow(miniHandle);
  });

  it("shows the pinned clip and toggles play/stop", async () => {
    const clips = await listClips(browser);
    const pad = await $(`button*=${clips[0].name}`);
    await pad.waitForExist({ timeout: 5000 });
    await pad.click();
    await browser.waitUntil(
      async () => (await pad.getAttribute("class")).includes("surface-selected"),
      { timeout: 5000, timeoutMsg: "pad did not enter playing state" },
    );
    await pad.click();
    await browser.waitUntil(
      async () => !(await pad.getAttribute("class")).includes("surface-selected"),
      { timeout: 5000, timeoutMsg: "pad did not return to stopped state" },
    );
  });

  it("stops everything via 'Stop all'", async () => {
    const clips = await listClips(browser);
    await $(`button*=${clips[0].name}`).click();
    await $("button*=Stop all").click();
    const pad = await $(`button*=${clips[0].name}`);
    await browser.waitUntil(
      async () => !(await pad.getAttribute("class")).includes("surface-selected"),
      { timeout: 5000 },
    );
  });

  it("filters the pinned list via quick search", async () => {
    const clips = await listClips(browser);
    await $('input[placeholder="Search sounds or shortcuts"]').setValue(
      clips[0].name,
    );
    await expect($(`*=${clips[0].name}`)).toBeExisting();
    await $('input[placeholder="Search sounds or shortcuts"]').setValue(
      "no-such-clip-xyz",
    );
    await expect($(`*=${clips[0].name}`)).not.toBeExisting();
    await $('input[placeholder="Search sounds or shortcuts"]').setValue("");
  });

  it("toggles ultra-compact mode", async () => {
    await $("button[aria-label='Mini menu']").click();
    await $("button=Compact mode").click();
    await expect($("button=Expand")).toBeExisting({ wait: 5000 });
    await $("button=Expand").click();
    await expect($("button[aria-label='Mini menu']")).toBeExisting({
      wait: 5000,
    });
  });

  it("opens the main window from 'Open Buddio'", async () => {
    await $("button*=Open Buddio").click();
    const handles = await browser.getWindowHandles();
    const mainHandle = handles.find((h) => h !== miniHandle);
    await browser.switchToWindow(mainHandle);
    await $("main").waitForExist({ timeout: 5000 });
  });
});
