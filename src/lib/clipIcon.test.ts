import { expect, it } from "vitest";
import { suggestClipEmoji } from "./clipIcon";

it("suggests a deterministic emoji from an audio name", () => {
  expect(suggestClipEmoji("airhorn loud")).toBe("📣");
  expect(suggestClipEmoji("laugh track")).toBe("😂");
  expect(suggestClipEmoji("unknown recording")).toBe("🔊");
});
