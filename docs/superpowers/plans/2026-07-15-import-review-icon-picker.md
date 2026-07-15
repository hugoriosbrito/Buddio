# Import Review Icon Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make import review resilient to long names and replace free-form icon entry with an offline, searchable emoji picker plus an optional custom-image URL.

**Architecture:** Keep the persisted `emoji` property unchanged while separating a draft into `emoji` and `iconUrl`; on save, a non-empty image URL wins. A focused picker component owns the local audio-relevant emoji catalog, search, keyboard navigation, and selection. `ClipIcon` remains the single renderer for text emojis and URLs, with an explicit fallback for failed custom images.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, React Testing Library.

---

## File structure

- Create `src/components/EmojiPicker.tsx`: offline, searchable popover and its fixed audio-oriented emoji catalog.
- Create `src/components/EmojiPicker.test.tsx`: keyboard and selection tests for the picker.
- Modify `src/components/ClipIcon.tsx`: optional fallback emoji after custom-image load failure.
- Modify `src/components/ImportReviewModal.tsx`: constrained grid, long-name handling, draft split, picker, and image URL field.
- Create `src/components/ImportReviewModal.test.tsx`: import icon rendering and long-name regression coverage.
- Modify `src/i18n/pt.ts` and `src/i18n/en.ts`: labels and errors for emoji selection/custom image.

### Task 1: Offline emoji picker

**Files:**
- Create: `src/components/EmojiPicker.tsx`
- Test: `src/components/EmojiPicker.test.tsx`

- [ ] **Step 1: Write the failing picker interaction test**

```tsx
it("filters and selects an emoji with the keyboard", async () => {
  const onChange = vi.fn();
  render(<EmojiPicker value="🔊" onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: /escolher emoji/i }));
  await userEvent.type(screen.getByRole("searchbox"), "risada");
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(onChange).toHaveBeenCalledWith("😂");
});
```

- [ ] **Step 2: Run the test and confirm it fails because `EmojiPicker` does not exist**

Run: `bun run test src/components/EmojiPicker.test.tsx`

Expected: failure resolving `./EmojiPicker`.

- [ ] **Step 3: Implement the picker with bundled data**

```tsx
const AUDIO_EMOJIS = [
  ["🔊", "Som"], ["🎵", "Música"], ["😂", "Risada"],
  ["👏", "Aplausos"], ["📣", "Alerta"], ["🎮", "Jogo"],
];

export function EmojiPicker({ value, onChange }: Props) {
  // Trigger button, searchbox, filtered grid of buttons, ArrowUp/ArrowDown
  // active index, Enter to call onChange, Escape to close, and focus return.
}
```

Use `role="dialog"`, `role="searchbox"`, labelled controls, and no network data source.

- [ ] **Step 4: Run picker tests and confirm they pass**

Run: `bun run test src/components/EmojiPicker.test.tsx`

Expected: `1 passed`.

- [ ] **Step 5: Commit the picker**

```powershell
git add src/components/EmojiPicker.tsx src/components/EmojiPicker.test.tsx
git commit -m "feat: add offline emoji picker"
```

### Task 2: Correct icon preview and custom-image fallback

**Files:**
- Modify: `src/components/ClipIcon.tsx`
- Modify: `src/components/ImportReviewModal.tsx`
- Test: `src/components/ImportReviewModal.test.tsx`

- [ ] **Step 1: Write failing tests for emoji preview and broken image fallback**

```tsx
it("shows the selected emoji instead of treating it as an image URL", () => {
  render(<ImportReviewModal />);
  expect(screen.getByText("🔊")).toBeVisible();
  expect(screen.queryByRole("img", { name: /prévia/i })).not.toBeInTheDocument();
});

it("falls back to the selected emoji when the custom image fails", () => {
  render(<ClipIcon emoji="https://example.test/icon.png" fallbackEmoji="🎵" />);
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByText("🎵")).toBeVisible();
});
```

- [ ] **Step 2: Run the tests and confirm current behavior fails**

Run: `bun run test src/components/ImportReviewModal.test.tsx`

Expected: emoji preview test fails because the modal creates an `img` from `🔊`.

- [ ] **Step 3: Implement draft separation and renderer reuse**

```tsx
type Draft = {
  name: string;
  hotkey: string | null;
  collectionId: string | null;
  emoji: string;
  iconUrl: string;
};

const persistedIcon = draft.iconUrl.trim() || draft.emoji;
<ClipIcon emoji={persistedIcon} fallbackEmoji={draft.emoji} size={40} />
```

Initial drafts classify existing `clip.emoji` with `isIconUrl`; `finish` persists
`draft.iconUrl.trim() || draft.emoji || null`. Place the custom URL in a
separate labelled field below the picker.

- [ ] **Step 4: Run the preview tests and confirm they pass**

Run: `bun run test src/components/ImportReviewModal.test.tsx`

Expected: all preview tests pass.

- [ ] **Step 5: Commit the preview fix**

```powershell
git add src/components/ClipIcon.tsx src/components/ImportReviewModal.tsx src/components/ImportReviewModal.test.tsx
git commit -m "fix: preview import icons correctly"
```

### Task 3: Make the import modal contain long names

**Files:**
- Modify: `src/components/ImportReviewModal.tsx`
- Test: `src/components/ImportReviewModal.test.tsx`

- [ ] **Step 1: Write the failing long-name regression test**

```tsx
it("keeps a long imported name within its selectable row", () => {
  renderImportReview({ name: "A very long audio name ".repeat(20) });
  const row = screen.getByRole("button", { name: /A very long audio name/i });
  expect(row).toHaveClass("min-w-0");
  expect(row.querySelector("p")?.className).toContain("truncate");
  expect(row).toHaveAttribute("title", expect.stringContaining("A very long"));
});
```

- [ ] **Step 2: Run the test and confirm it fails on the missing row title**

Run: `bun run test src/components/ImportReviewModal.test.tsx`

Expected: failure because the import-row button has no `title` attribute.

- [ ] **Step 3: Apply the containment classes and title**

```tsx
className="max-w-[min(920px,calc(100vw-32px))] overflow-x-hidden"
<div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)]">
<div className="min-w-0 overflow-hidden ...">
<button title={name} className="min-w-0 ...">
```

Apply `min-w-0` to both panels and list children. Do not truncate the editable
input; only the summary row clips visual overflow.

- [ ] **Step 4: Run the regression test and all frontend tests**

Run: `bun run test src/components/ImportReviewModal.test.tsx; bun run test`

Expected: all tests pass.

- [ ] **Step 5: Commit layout containment**

```powershell
git add src/components/ImportReviewModal.tsx src/components/ImportReviewModal.test.tsx
git commit -m "fix: contain long import names"
```

### Task 4: Localized UX and final verification

**Files:**
- Modify: `src/i18n/pt.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/components/ImportReviewModal.tsx`

- [ ] **Step 1: Add translated labels**

```ts
"import.chooseEmoji": "Escolher emoji",
"import.searchEmoji": "Buscar emoji",
"import.customImageUrl": "Imagem personalizada (URL)",
"import.customImageHint": "Use uma URL de imagem para substituir o emoji.",
"import.imageUnavailable": "Não foi possível carregar a imagem. O emoji será usado.",
```

Add corresponding concise English values in `src/i18n/en.ts`.

- [ ] **Step 2: Run production checks**

Run: `bun run test; bun run build; cargo fmt --all -- --check; cargo clippy --workspace -- -D warnings; cargo test --workspace`

Expected: exit code 0 for every command.

- [ ] **Step 3: Perform a focused manual check**

Open the app, import an audio file with a name longer than 150 characters,
select an emoji, paste a valid image URL, then paste an invalid URL. Confirm:
no horizontal scrollbar; selected emoji persists; valid image previews; invalid
image falls back to the selected emoji with the localized message.

- [ ] **Step 4: Commit and publish**

```powershell
git add src/i18n/pt.ts src/i18n/en.ts src/components/ImportReviewModal.tsx
git commit -m "feat: improve import icon selection"
git push origin main
```
