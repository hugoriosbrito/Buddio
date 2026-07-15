// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import type { ClipDto, ImportResult } from "../lib/api";
import { useUiStore } from "../stores/uiStore";
import { ImportReviewModal } from "./ImportReviewModal";

const longName = "Guns N' Roses - Welcome to the Jungle (Studio Version) High Quality ".repeat(4);

function review(name = longName): ImportResult {
  return {
    imported: [{
      id: "clip-1", name, fileHash: "hash", ext: "mp3", durationMs: 274_000,
      volume: 1, loopEnabled: false, hotkey: "Ctrl+Alt+1", createdAt: "2026-07-15",
      position: 0, peaks: null, trimStartMs: 0, trimEndMs: null, fadeInMs: 0,
      fadeOutMs: 0, gainDb: 0, restartOnPress: false, stopOthers: false,
      emoji: "🔊", pinned: false, collectionIds: [], integratedLufs: null,
      normGainDb: 0, loudnessRefined: false,
    } as ClipDto],
    duplicates: [],
    errors: [],
  };
}

beforeEach(() => {
  cleanup();
  useUiStore.setState({ importReviewOpen: true, importReview: review() });
});

it("renders emoji preview without treating it as an image URL", () => {
  render(<ImportReviewModal />);

  expect(screen.getAllByText("🔊").length).toBeGreaterThan(0);
  expect(document.querySelector('img[src="🔊"]')).toBeNull();
});

it("contains a long imported name inside a titled, shrinkable row", () => {
  render(<ImportReviewModal />);

  const row = screen.getByTitle(/Guns N' Roses - Welcome to the Jungle/);
  expect(row.className).toContain("min-w-0");
  expect(row.querySelector("p")?.className).toContain("truncate");
});
