import {
  invoke,
  completeOnboardingQuickly,
  importTestClip,
  deleteAllClips,
  listClips,
} from "../helpers/appActions.mjs";

async function goto(view) {
  const labels = {
    soundboard: "Soundboard",
    library: "Biblioteca",
    profiles: "Perfis",
    routing: "Roteamento",
    settings: "Configurações",
  };
  await $(`button=${labels[view]}`).click();
}

describe("Main window — core functionality", () => {
  before(async () => {
    await completeOnboardingQuickly(browser);
    await $("main").waitForExist({ timeout: 15000 });
  });

  beforeEach(async () => {
    await deleteAllClips(browser);
    await importTestClip(browser);
  });

  describe("Soundboard", () => {
    it("plays and stops a pad", async () => {
      await goto("soundboard");
      const clips = await listClips(browser);
      const clip = clips[0];
      await expect($(`h3=${clip.name}`)).toBeExisting();

      const playBtn = await $('button[aria-label="Tocar"]');
      await playBtn.waitForExist({ timeout: 5000 });
      await playBtn.click();
      await $('button[aria-label="Parar"]').waitForExist({ timeout: 5000 });
      await $('button[aria-label="Parar"]').click();
      await $('button[aria-label="Tocar"]').waitForExist({ timeout: 5000 });
    });

    it("filters pads via quick search", async () => {
      await goto("soundboard");
      const clips = await listClips(browser);
      const clip = clips[0];
      await $('input[placeholder="Buscar"]').setValue(clip.name);
      await expect($(`h3=${clip.name}`)).toBeExisting();
      await $('input[placeholder="Buscar"]').setValue("no-such-clip-xyz");
      await expect($(`h3=${clip.name}`)).not.toBeExisting();
    });

    it("stops all playback with 'Parar todos'", async () => {
      await goto("soundboard");
      await $('button[aria-label="Tocar"]').click();
      await $("button=Parar todos").click();
      await $('button[aria-label="Tocar"]').waitForExist({ timeout: 5000 });
    });
  });

  describe("Library", () => {
    it("lists, and deletes a clip", async () => {
      await goto("library");
      const clips = await listClips(browser);
      const clip = clips[0];
      await expect($(`*=${clip.name}`)).toBeExisting();

      await $(`*=${clip.name}`).click();
      await $("button=Excluir").click();
      await browser.waitUntil(async () => (await listClips(browser)).length === 0, {
        timeout: 5000,
        timeoutMsg: "clipe nao foi removido da biblioteca",
      });
    });
  });

  describe("Profiles", () => {
    it("creates, saves and deletes a profile", async () => {
      await goto("profiles");
      await $("button=Novo perfil").click();
      await $('input[placeholder="Streaming, Jogos…"]').setValue("Teste E2E");
      await $("button=Criar perfil").click();

      await expect($("h2=Teste E2E")).toBeExisting({ wait: 5000 });
      await $("h2=Teste E2E").click();
      await $("button=Salvar alterações").click();

      await $("button=Excluir").click();
      await expect($("h2=Teste E2E")).not.toBeExisting();
    });
  });

  describe("Routing", () => {
    it("opens the diagnostics modal", async () => {
      await goto("routing");
      await $("button=Testar roteamento").click();
      await expect($("h2=Diagnóstico de áudio")).toBeExisting({ wait: 10000 });
      await browser.keys(["Escape"]);
    });
  });

  describe("Settings", () => {
    it("switches theme and accent, and records a stop-all hotkey", async () => {
      await goto("settings");
      await $("button=Aparência").click();
      await $("button=Claro").click();
      await expect($("button=Claro")).toHaveAttribute("aria-pressed", "true");
      await $('button[aria-label="Azul"]').click();

      await $("button=Atalhos").click();
      await $("button=Capturar").click();
      await expect($("h2=Capturar atalho")).toBeExisting({ wait: 5000 });
      await browser.keys(["Escape"]);
    });

    it("shows the update-check control", async () => {
      await goto("settings");
      await $("button=Sobre").click();
      await expect($("button=Verificar atualizações")).toBeExisting();
    });
  });

  describe("Command palette", () => {
    it("opens with Ctrl+K and navigates to Library", async () => {
      await goto("soundboard");
      await browser.keys(["Control", "k"]);
      await expect($("h2=Command palette")).toBeExisting({ wait: 5000 });
      await $("button=Ir para Biblioteca").click();
      await expect($("h1=Biblioteca")).toBeExisting({ wait: 5000 });
    });
  });
});
