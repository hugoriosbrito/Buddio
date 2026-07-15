// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { useHelpStore } from "./helpStore";

describe("helpStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useHelpStore.setState({
      isOpen: false,
      problemId: null,
      preferredApp: "discord",
    });
  });

  it("opens Help for the detected problem", () => {
    useHelpStore.getState().open("virtual-mic-missing");

    expect(useHelpStore.getState()).toMatchObject({
      isOpen: true,
      problemId: "virtual-mic-missing",
    });
  });

  it("remembers the preferred app locally", () => {
    useHelpStore.getState().setPreferredApp("obs");

    expect(useHelpStore.getState().preferredApp).toBe("obs");
    expect(localStorage.getItem("buddio.preferred-app")).toBe("obs");
  });
});
