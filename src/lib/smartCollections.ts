import type { ClipDto } from "./api";

export type SmartCollectionId = "recent" | "most-used" | "without-hotkey" | "unorganized";

export function filterSmartCollection(
  clips: ClipDto[],
  id: SmartCollectionId,
  usage: ReadonlyMap<string, number>,
): ClipDto[] {
  if (id === "without-hotkey") return clips.filter((clip) => !clip.hotkey);
  if (id === "unorganized") return clips.filter((clip) => clip.collectionIds.length === 0);
  if (id === "most-used") return [...clips].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0));
  return [...clips].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
