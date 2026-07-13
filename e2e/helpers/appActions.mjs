import path from "node:path";

/**
 * Requires `app.withGlobalTauri: true` in tauri.conf.json.
 *
 * Uses the classic WebDriver "execute async script" command instead of
 * `browser.execute()`: webdriverio routes any `execute()` call whose script
 * returns a promise through WebDriver BiDi's `script.callFunction`, but
 * tauri-driver only proxies classic HTTP WebDriver — it doesn't proxy the
 * BiDi WebSocket msedgedriver advertises, and connecting to that socket
 * directly fails with "Origin header is not a valid URL". executeAsync's
 * callback-style script avoids BiDi entirely.
 */
export async function invoke(browser, cmd, args = {}) {
  await waitForTauriReady(browser);
  const result = await browser.executeAsync(
    (cmd, args, done) => {
      window.__TAURI__.core.invoke(cmd, args).then(
        (value) => done({ ok: true, value }),
        (error) => done({ ok: false, error: String(error) }),
      );
    },
    cmd,
    args,
  );
  if (!result.ok) throw new Error(`invoke(${cmd}) failed: ${result.error}`);
  return result.value;
}

/**
 * `window.__TAURI__` is injected by Tauri's init script; right after a fresh
 * session/navigation there's a brief window where it isn't attached yet.
 */
export async function waitForTauriReady(browser) {
  await browser.waitUntil(
    async () => browser.execute(() => typeof window.__TAURI__?.core?.invoke === "function"),
    { timeout: 10000, timeoutMsg: "window.__TAURI__ nunca ficou disponivel" },
  );
}

export async function openFreshOnboarding(browser) {
  await invoke(browser, "set_onboarding_done", { done: false });
  await browser.refresh();
  await $("h1*=soundboard").waitForExist({ timeout: 15000 });
}

export async function completeOnboardingQuickly(browser) {
  await invoke(browser, "set_onboarding_done", { done: true });
  await browser.refresh();
}

export const TEST_SAMPLE_PATH = path.resolve(
  "src-tauri/resources/samples/sound-test-sample.wav",
);

export async function importTestClip(browser) {
  return invoke(browser, "import_clips", { paths: [TEST_SAMPLE_PATH] });
}

export async function listClips(browser) {
  return invoke(browser, "list_clips", {});
}

export async function deleteAllClips(browser) {
  const clips = await listClips(browser);
  for (const clip of clips) {
    await invoke(browser, "delete_clip", { id: clip.id });
  }
}
