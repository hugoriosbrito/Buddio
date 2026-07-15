const RULES: Array<[RegExp, string]> = [
  [/airhorn|horn|alert|siren/i, "📣"],
  [/laugh|haha|funny/i, "😂"],
  [/applause|clap/i, "👏"],
  [/music|song|beat/i, "🎵"],
  [/drum|kick/i, "🥁"],
  [/wow|surprise/i, "😮"],
];

export function suggestClipEmoji(name: string): string {
  return RULES.find(([pattern]) => pattern.test(name))?.[1] ?? "🔊";
}
