/**
 * Mic route mode UI — exclusive Mix / Ducking / Sound only on Routing.
 * Requires a hydrated settings store (e2e fixture).
 */
describe("Routing mic modes", () => {
  it("exposes the three exclusive mic route modes", async () => {
    await $("button=Roteamento").click();
    const mode = await $('select[aria-label="Modo do microfone"], [aria-label="Modo do microfone"]');
    await expect(mode).toBeExisting();

    // Custom Select uses a button trigger — open and assert options exist.
    await mode.click();
    const mix = await $("*=Misturar");
    const duck = await $("*=Ducking");
    const only = await $("*=Só som");
    await expect(mix).toBeExisting();
    await expect(duck).toBeExisting();
    await expect(only).toBeExisting();
  });
});
