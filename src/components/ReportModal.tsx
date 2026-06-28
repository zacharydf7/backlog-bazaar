import { useState } from "react";
import { Flag, X, Loader2 } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { REPORT_REASONS, validateReport } from "../lib/reports";
import type { ReportKind, ReportReason } from "../types";

// The standardized report form, opened from "Report user" (kind='user') or the
// "Report image" flag on another player's custom cover (kind='cover'). Pick a
// reason, optionally add detail, and it goes to the moderation queue. The report
// is anonymous — the reported player is never told who flagged them.
export function ReportModal({
  target,
  kind,
  game,
  onClose,
}: {
  target: { id: string; name: string };
  kind: ReportKind;
  game?: { id: string; title: string } | null;
  onClose: () => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onClose);
  const submitReport = useStore((s) => s.submitReport);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const error = touched ? validateReport({ reason }) : null;

  const submit = async () => {
    const err = validateReport({ reason });
    if (err) {
      setTouched(true);
      return;
    }
    setSubmitting(true);
    const ok = await submitReport({
      reportedUser: target.id,
      kind,
      reason: reason!,
      details: details.trim() || undefined,
      gameId: kind === "cover" ? (game?.id ?? null) : null,
    });
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Flag size={18} className="text-danger" />
            {kind === "cover" ? "Report cover art" : "Report player"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition hover:bg-panel hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <p className="text-sm text-muted">
            {kind === "cover" ? (
              <>
                Flag the custom cover on{" "}
                <span className="text-ink">{game?.title ?? "this game"}</span> on{" "}
                <span className="text-ink">{target.name}</span>&apos;s board for our moderators.
              </>
            ) : (
              <>
                Flag <span className="text-ink">{target.name}</span> for our moderators.
              </>
            )}{" "}
            Reports are anonymous — they&apos;ll never know who reported them.
          </p>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-subtle">Reason</div>
            <div className="flex flex-col gap-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={
                    "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition " +
                    (reason === r.value
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-line bg-panel text-ink hover:bg-surface")
                  }
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r.value}
                    onChange={() => {
                      setReason(r.value);
                      setTouched(true);
                    }}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] uppercase tracking-wide text-subtle">
              Details <span className="normal-case text-subtle">(optional)</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Add anything that would help a moderator review this."
              className="w-full resize-none rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none placeholder:text-subtle focus:border-brand"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-danger/15 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/25 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Flag size={15} />}
            Send report
          </button>
        </div>
      </div>
    </div>
  );
}
