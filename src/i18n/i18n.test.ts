import { describe, expect, it } from "vitest";
import { en } from "./en";
import { pt } from "./pt";
import { translate } from "./index";
import { localizeSeedName } from "./seedNames";

describe("i18n catalogs", () => {
  it("keeps en and pt keys in parity", () => {
    const enKeys = Object.keys(en).sort();
    const ptKeys = Object.keys(pt).sort();
    expect(ptKeys).toEqual(enKeys);
  });

  it("interpolates {name} placeholders", () => {
    expect(
      translate("en", "common.deviceDefaultSuffix", { name: "Speakers" }),
    ).toBe("Speakers (default)");
    expect(
      translate("pt", "common.deviceDefaultSuffix", { name: "Alto-falantes" }),
    ).toBe("Alto-falantes (padrão)");
    expect(
      translate("en", "onboarding.route.speakersAsVirtualDetail", {
        name: "Realtek",
      }),
    ).toContain("Realtek");
  });

  it("localizes seed collection/profile names", () => {
    expect(localizeSeedName("Padrão", (k) => translate("en", k))).toBe(
      "Default",
    );
    expect(localizeSeedName("Favoritos", (k) => translate("en", k))).toBe(
      "Favorites",
    );
    expect(localizeSeedName("Favorites", (k) => translate("pt", k))).toBe(
      "Favoritos",
    );
    expect(localizeSeedName("My Custom", (k) => translate("en", k))).toBe(
      "My Custom",
    );
  });
});
