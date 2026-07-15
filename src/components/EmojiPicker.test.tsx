// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EmojiPicker } from "./EmojiPicker";

it("filters and selects an emoji with the keyboard", () => {
  const onChange = vi.fn();
  render(<EmojiPicker value="🔊" onChange={onChange} />);

  fireEvent.click(screen.getByRole("button", { name: /escolher emoji/i }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "risada" },
  });
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "ArrowDown" });
  fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });

  expect(onChange).toHaveBeenCalledWith("😂");
});
