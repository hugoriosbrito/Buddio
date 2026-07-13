import { create } from "zustand";

export type ToastKind = "success" | "info" | "warning" | "error";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  sticky?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  leaving?: boolean;
};

type ToastState = {
  items: ToastItem[];
  push: (toast: Omit<ToastItem, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

export const TOAST_DURATION_MS = 3000;
const EXIT_MS = 120;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push: (toast) => {
    const id = toast.id ?? crypto.randomUUID();
    const items = [...get().items, { ...toast, id }].slice(-3);
    set({ items });
    if (!toast.sticky) {
      window.setTimeout(() => {
        get().dismiss(id);
      }, TOAST_DURATION_MS);
    }
    return id;
  },
  dismiss: (id) => {
    const items = get().items;
    if (!items.some((t) => t.id === id && !t.leaving)) return;
    set({
      items: items.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    });
    window.setTimeout(() => {
      set({ items: get().items.filter((t) => t.id !== id) });
    }, EXIT_MS);
  },
  clear: () => set({ items: [] }),
}));
