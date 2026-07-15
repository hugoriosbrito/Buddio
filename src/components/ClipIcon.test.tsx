// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ClipIcon } from "./ClipIcon";

it("falls back to the selected emoji when a custom image cannot load", () => {
  const { container } = render(
    <ClipIcon
      emoji="https://example.test/icon.png"
      fallbackEmoji="🎵"
    />,
  );

  fireEvent.error(container.querySelector("img")!);

  expect(screen.getByText("🎵")).toBeTruthy();
});
