import { expect, it } from "vitest";
import type { ClipDto } from "./api";
import { filterSmartCollection } from "./smartCollections";

const clips = [
  { id: "recent", name: "Recent", hotkey: "Ctrl+1", collectionIds: ["c1"], createdAt: "2026-07-14" },
  { id: "loose", name: "Loose", hotkey: null, collectionIds: [], createdAt: "2026-07-01" },
] as ClipDto[];

it("derives unorganized and without-hotkey views without changing membership", () => {
  expect(filterSmartCollection(clips, "unorganized", new Map()).map((clip) => clip.id)).toEqual(["loose"]);
  expect(filterSmartCollection(clips, "without-hotkey", new Map()).map((clip) => clip.id)).toEqual(["loose"]);
});

it("orders recent usage locally", () => {
  expect(filterSmartCollection(clips, "most-used", new Map([["loose", 3], ["recent", 1]])).map((clip) => clip.id)).toEqual(["loose", "recent"]);
});
