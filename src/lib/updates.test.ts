import { describe, expect, it } from "vitest";
import {
  compareSemver,
  normalizeVersion,
  parseVersion,
  pickNewestRelease,
} from "./updates";

describe("normalizeVersion", () => {
  it("strips leading v", () => {
    expect(normalizeVersion("v1.0.0-rc2")).toBe("1.0.0-rc2");
    expect(normalizeVersion("  V1.2.3  ")).toBe("1.2.3");
  });
});

describe("parseVersion", () => {
  it("splits rcN into tokens", () => {
    expect(parseVersion("1.0.0-rc2")).toEqual({
      core: [1, 0, 0],
      pre: ["rc", "2"],
    });
    expect(parseVersion("v1.0.0-rc.1")).toEqual({
      core: [1, 0, 0],
      pre: ["rc", "1"],
    });
  });
});

describe("compareSemver", () => {
  it("orders release candidates", () => {
    expect(compareSemver("1.0.0-rc1", "1.0.0-rc2")).toBeLessThan(0);
    expect(compareSemver("1.0.0-rc2", "1.0.0-rc1")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-rc2", "1.0.0-rc2")).toBe(0);
  });

  it("treats final release as newer than any RC of the same core", () => {
    expect(compareSemver("1.0.0", "1.0.0-rc2")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0-rc2", "1.0.0")).toBeLessThan(0);
  });

  it("does not collapse rc into plain patch (legacy bug)", () => {
    // Old code used parseInt("0-rc2") === 0 → equal to 1.0.0
    expect(compareSemver("1.0.0-rc2", "1.0.0")).not.toBe(0);
  });
});

describe("pickNewestRelease", () => {
  it("skips drafts and prefers the most recently published", () => {
    const picked = pickNewestRelease([
      {
        tag_name: "v1.0.0-rc1",
        prerelease: true,
        published_at: "2026-07-13T22:00:00Z",
      },
      {
        tag_name: "v1.0.0-rc2",
        prerelease: false,
        published_at: "2026-07-13T23:40:00Z",
      },
      {
        tag_name: "v9.9.9",
        draft: true,
        published_at: "2026-07-14T00:00:00Z",
      },
    ]);
    expect(picked?.tag_name).toBe("v1.0.0-rc2");
  });

  it("includes prereleases when they are the newest (unlike /releases/latest)", () => {
    const picked = pickNewestRelease([
      {
        tag_name: "v1.0.0-rc1",
        prerelease: true,
        published_at: "2026-07-13T22:00:00Z",
      },
    ]);
    expect(picked?.tag_name).toBe("v1.0.0-rc1");
  });
});
