import { createPortal } from "react-dom";
import { Flame, AlertTriangle } from "lucide-react";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { computeClearStreakBonus, type ClearStreakConfig } from "../lib/pricing";

/**
 * The friction point that guards a live Clear Streak. Adding ANY game resets the
 * streak to zero, so when the player clicks "Add game" with a streak going, this
 * intercepts and asks for an explicit confirmation first — spelling out exactly
 * what's forfeited (the bonus the next finish would have paid). Rendered by App
 * before the Add-game modal opens; confirming proceeds, cancelling backs out.
 */
export function StreakBreakWarningModal({
  streak,
  cfg,
  onCancel,
  onConfirm,
}: {
  streak: number;
  cfg: ClearStreakConfig;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onCancel);
  // The bonus the NEXT finish would pay if the streak carried on — what adding a
  // game now gives up (0 while the streak is still below the paying threshold).
  const nextBonus = computeClearStreakBonus(streak + 1, cfg);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pb-2 pt-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-danger">
            <AlertTriangle size={15} /> Break your Clear Streak?
          </span>
          <h2 className="mt-2 flex flex-wrap items-center gap-1.5 font-display text-lg leading-tight text-ink">
            You&apos;re on a
            <span className="inline-flex items-center gap-1 text-brand">
              <Flame size={17} /> {streak}
            </span>
            -game streak
          </h2>
          <p className="mt-1 text-sm text-muted">
            Adding a game to your library instantly resets your Clear Streak to zero
            {nextBonus > 0 ? (
              <>
                {" "}
                and forfeits the{" "}
                <span className="font-medium text-ink">+{nextBonus} coin</span> bonus your
                next finish would have paid
              </>
            ) : null}
            . Your all-time best streak is kept either way.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 px-5 pb-5 pt-2 sm:flex-row sm:justify-end">
          <button
            onClick={onConfirm}
            className="rounded-2xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10"
          >
            Add anyway
          </button>
          <button
            onClick={onCancel}
            className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:opacity-90 active:translate-y-px"
          >
            Keep my streak
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
