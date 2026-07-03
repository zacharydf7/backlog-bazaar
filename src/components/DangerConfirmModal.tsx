import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { phraseMatches } from "../lib/dangerConfirm";

// The heavy-duty destructive confirmation, for actions where ConfirmDialog is
// not enough (the account Danger Zone: Fresh Start / Delete Account). Three
// explicit opt-ins before the confirm button arms: opening the modal, ticking
// the "I understand" checkbox, and typing the exact phrase.
export function DangerConfirmModal({
  title,
  children,
  phrase,
  confirmLabel,
  busyLabel = "Working…",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode; // consequence copy: what happens / what's kept
  phrase: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onCancel);
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const armed = acknowledged && phraseMatches(typed, phrase) && !busy;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-danger/40 bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="flex items-center gap-2 font-display text-lg text-danger">
          <AlertTriangle size={18} aria-hidden />
          {title}
        </h2>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted">{children}</div>

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 accent-[var(--danger)]"
          />
          <span>I understand this cannot be undone.</span>
        </label>

        <label className="mt-3 block text-sm text-muted">
          Type <span className="font-mono font-semibold text-danger">{phrase}</span> to confirm:
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 font-mono text-sm text-ink outline-none focus:border-danger/60"
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!armed}
            className="rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
