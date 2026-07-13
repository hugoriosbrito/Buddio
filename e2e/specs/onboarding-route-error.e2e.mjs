import { invoke, openFreshOnboarding } from "../helpers/appActions.mjs";

// This spec runs under wdio.routeerror.conf.mjs, which starts the app with
// BUDDIO_TEST_FAKE_DEVICES=novirtual (no virtual-cable device present) so
// the routing test deterministically fails and lands on the route-error
// screen, instead of depending on whether a real virtual cable is
// installed on the machine running the suite.
describe("Onboarding — route error branch (no virtual device)", () => {
  beforeEach(async () => {
    await invoke(browser, "set_output_devices", {
      config: { monitorEnabled: true, monitor: null, secondary: null },
    });
  });

  it("shows the route-error screen and reports 'no virtual cable found'", async () => {
    await openFreshOnboarding(browser);
    await $("button=Começar configuração").click();
    await $("button=Continuar").click(); // output
    await $("button=Continuar").click(); // mic

    // Virtual screen: no candidate device -> "Continuar mesmo assim"
    await expect($("h1*=Configure a saída virtual")).toBeExisting();
    await expect($("*=Não encontrado")).toBeExisting();
    await $("button=Continuar mesmo assim").click();

    await $("button=Executar teste").click();
    await expect($("h1*=Problema no roteamento")).toBeExisting({ wait: 10000 });
    await expect($("*=Nenhum cabo virtual encontrado")).toBeExisting();

    // Auto-repair can't find a candidate either — it should surface an
    // actionable error instead of silently doing nothing.
    await $("button=Reparar rota automaticamente").click();
    await browser.waitUntil(
      async () => (await $("*=Nenhum cabo virtual encontrado").isExisting()),
      { timeout: 10000 },
    );
  });
});
