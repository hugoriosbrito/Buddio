import {
  invoke,
  openFreshOnboarding,
  importTestClip,
  deleteAllClips,
} from "../helpers/appActions.mjs";

describe("Onboarding", () => {
  beforeEach(async () => {
    await deleteAllClips(browser);
    await invoke(browser, "set_output_devices", {
      config: { monitorEnabled: true, monitor: null, secondary: null },
    });
  });

  it("welcome: 'Configurar depois' skips straight to the main app", async () => {
    await openFreshOnboarding(browser);
    await $("button=Configurar depois").click();

    await $(".buddio-scroll").waitForExist({ timeout: 10000, reverse: true }).catch(() => {});
    const done = await invoke(browser, "get_settings", {});
    expect(done.onboardingDone).toBe(true);

    // Reopening (refresh) must not show onboarding again.
    await browser.refresh();
    await expect($("h1*=soundboard")).not.toBeExisting();
  });

  it("walks through output -> mic -> virtual -> routing -> import -> hotkey -> ready", async () => {
    await openFreshOnboarding(browser);

    // 1. Welcome
    await expect($("h1*=soundboard")).toBeExisting();
    await $("button=Começar configuração").click();

    // 2. Output
    await expect($("h1*=Onde você quer ouvir")).toBeExisting();
    await $("button=Reproduzir teste").click();
    const volumeSlider = await $('input[aria-label="Volume do monitor"]');
    await volumeSlider.waitForExist();
    await $("button=Continuar").click();

    // 3. Mic
    await expect($("h1*=Escolha e teste seu microfone")).toBeExisting();
    await $("button=Continuar").click();

    // 4. Virtual (BUDDIO_TEST_FAKE_DEVICES=full provides a virtual device)
    await expect($("h1*=Configure a saída virtual")).toBeExisting();
    await expect($("*=Disponível")).toBeExisting();
    await $("button*=Testar roteamento").click();

    // 5. Routing
    await expect($("h1*=Vamos testar o caminho completo")).toBeExisting();
    await $("button=Executar teste").click();
    await browser.waitUntil(
      async () => (await $("*=Tudo parece pronto").isExisting()),
      { timeout: 10000, timeoutMsg: "rota nao ficou pronta a tempo" },
    );
    await $("button=Continuar").click();

    // 6. Import — native file dialog can't be automated, so we import
    // directly through the backend command like a successful drag-drop would.
    await expect($("h1*=Adicione seu primeiro som")).toBeExisting();
    const nextBtnBefore = await $("button=Continuar");
    expect(await nextBtnBefore.isEnabled()).toBe(false);
    await importTestClip(browser);
    await browser.waitUntil(
      async () => (await $("button=Continuar").isEnabled()),
      { timeout: 10000, timeoutMsg: "clipe importado nao habilitou Continuar" },
    );
    await $("button=Continuar").click();

    // 7. Hotkey
    await expect($("h1*=Escolha uma tecla")).toBeExisting();
    const saveBtnBefore = await $("button=Salvar atalho");
    expect(await saveBtnBefore.isEnabled()).toBe(false);
    await $("button=Clique e pressione as teclas").click();
    await browser.pause(200); // arm delay in HotkeyScreen listener
    await browser.keys(["F13"]);
    await browser.waitUntil(
      async () => (await $("button=Salvar atalho").isEnabled()),
      { timeout: 5000, timeoutMsg: "atalho nao foi capturado" },
    );
    await $("button=Salvar atalho").click();

    // 8. Ready
    await expect($("h1*=Tudo pronto")).toBeExisting();
    await $("button=Abrir soundboard").click();

    await browser.waitUntil(
      async () => !(await $("h1*=Tudo pronto").isExisting()),
      { timeout: 10000 },
    );
    const settings = await invoke(browser, "get_settings", {});
    expect(settings.onboardingDone).toBe(true);
  });

  it("hotkey capture cancels with Escape and leaves Save disabled", async () => {
    await openFreshOnboarding(browser);
    await $("button=Começar configuração").click();
    await $("button=Continuar").click(); // output
    await $("button=Continuar").click(); // mic
    await $("button*=Testar roteamento").click(); // virtual
    await $("button=Continuar").click(); // routing -> import
    await importTestClip(browser);
    await browser.waitUntil(async () => (await $("button=Continuar").isEnabled()));
    await $("button=Continuar").click(); // hotkey

    await $("button=Clique e pressione as teclas").click();
    await browser.pause(200);
    await browser.keys(["Escape"]);
    await expect($("button=Salvar atalho")).not.toBeEnabled();
  });
});
