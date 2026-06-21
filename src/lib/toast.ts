import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  icon?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, icon?: string) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, icon) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, icon }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2600);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere (e.g. store actions). */
export function toast(message: string, icon?: string): void {
  useToasts.getState().push(message, icon);
}
