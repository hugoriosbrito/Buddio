/** Desktop shell guards: block browser-like DevTools / shortcuts / context menu. */

const DEVTOOLS_KEYS = new Set([
  "F12",
  "F5",
  "KeyI",
  "KeyJ",
  "KeyC",
  "KeyU",
  "KeyR",
]);

function isDevtoolsChord(e: KeyboardEvent): boolean {
  if (e.key === "F12" || e.key === "F5") return true;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return false;
  if (e.shiftKey && ["KeyI", "KeyJ", "KeyC"].includes(e.code)) return true;
  if (e.code === "KeyU") return true;
  // Block Ctrl+R reload in product builds; allow when BUDDIO_DEVTOOLS is active in debug UI.
  if (e.code === "KeyR" && !import.meta.env.DEV) return true;
  if (e.code === "KeyR" && import.meta.env.DEV && !devtoolsAllowed()) return true;
  return false;
}

function devtoolsAllowed(): boolean {
  try {
    return (
      import.meta.env.DEV &&
      typeof window !== "undefined" &&
      window.localStorage?.getItem("BUDDIO_DEVTOOLS") === "1"
    );
  } catch {
    return false;
  }
}

export function installNativeShellGuards(): () => void {
  const onContextMenu = (e: MouseEvent) => {
    if (devtoolsAllowed()) return;
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (devtoolsAllowed()) return;
    if (!isDevtoolsChord(e) && !DEVTOOLS_KEYS.has(e.key) && !DEVTOOLS_KEYS.has(e.code)) {
      return;
    }
    if (isDevtoolsChord(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onDragStart = (e: DragEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.closest("input, textarea, [contenteditable='true']")) return;
    // Prevent dragging UI chrome / images like a web page.
    if (t.closest("img, a, button, [data-no-drag]")) {
      e.preventDefault();
    }
  };

  window.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("dragstart", onDragStart, true);

  return () => {
    window.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("dragstart", onDragStart, true);
  };
}
