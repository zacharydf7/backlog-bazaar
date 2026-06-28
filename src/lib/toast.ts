import { create } from "zustand";
import type { LucideIcon } from "lucide-react";

/** An optional action button on a toast (e.g. "Undo"). */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface Toast {
  id: number;
  message: string;
  icon?: LucideIcon;
  action?: ToastAction;
  /** How long the toast lives, in ms. Defaults to DEFAULT_TOAST_MS. */
  durationMs: number;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, icon?: LucideIcon, opts?: { action?: ToastAction; durationMs?: number }) => void;
  dismiss: (id: number) => void;
}

/** Default lifetime for a plain toast. Action toasts pass a longer window. */
export const DEFAULT_TOAST_MS = 2600;

let counter = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, icon, opts) => {
    const id = ++counter;
    const durationMs = opts?.durationMs ?? DEFAULT_TOAST_MS;
    set((s) => ({ toasts: [...s.toasts, { id, message, icon, action: opts?.action, durationMs }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere (e.g. store actions). */
export function toast(message: string, icon?: LucideIcon): void {
  useToasts.getState().push(message, icon);
}

/** Fire a toast carrying an action button (e.g. an "Undo" affordance) that lives
 *  for `durationMs` (default 15s — long enough to act on, short enough to expire). */
export function toastAction(
  message: string,
  action: ToastAction,
  icon?: LucideIcon,
  durationMs = 15000,
): void {
  useToasts.getState().push(message, icon, { action, durationMs });
}
