import { type ReactNode } from "react";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

// A small reusable confirmation modal. Backdrop click and Back both cancel; the
// inner panel stops propagation. `tone` picks the confirm button's emphasis.
export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "brand",
  hideCancel = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "brand" | "danger";
  /** Informational dialogs (a single acknowledging button) hide the cancel. */
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onCancel);

  const confirmCls =
    tone === "danger"
      ? "bg-danger/15 text-danger hover:bg-danger/25"
      : "bg-brand text-brand-fg hover:brightness-105 active:brightness-95";

  return (
    // z-[90]: confirms portal out of ANY modal (FamilyHub and friends sit at
    // z-[60]-z-[80]), so this must outrank them all — at z-[55] the dialog
    // rendered BEHIND the Family Breakdown and "Sever family link" looked dead
    // (issue 9f420872). Toasts (z-[100]) stay on top.
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg text-ink">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-muted">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          {!hideCancel && (
            <button
              onClick={onCancel}
              className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={"rounded-xl px-4 py-2 text-sm font-semibold transition " + confirmCls}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
