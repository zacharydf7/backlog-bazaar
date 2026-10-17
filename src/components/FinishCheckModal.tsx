import { useState } from "react";
import { Check, Clock, History } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { formatPlaytime, parsePlaytime } from "../lib/playtime";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { CoinIcon } from "./CoinIcon";

/** The check before a finish that would hold part of its bounty (coin
 *  outliers, 2026-10-17): with little of the game logged, offer to log the
 *  time first; or, for a game beaten before joining, file it under Finished
 *  without a bounty (the activation coins come back); or finish anyway, with
 *  the rest unlocking as time is logged. */
export function FinishCheckModal({
  game,
  length,
  gateHours,
  payNow,
  held,
  onFinish,
  onClose,
}: {
  game: Game;
  /** The length the finish pays on (after any main + extras settle). */
  length: number;
  /** Logged hours that release the whole bounty. */
  gateHours: number;
  /** Coins the finish pays now, and the coins it would hold. */
  payNow: number;
  held: number;
  /** Finishes the game (the caller's usual path, stopwatch handling included). */
  onFinish: () => void;
  onClose: () => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onClose);
  const logPlaytime = useStore((s) => s.logPlaytime);
  const abandonGame = useStore((s) => s.abandonGame);
  const bazaarToFinished = useStore((s) => s.bazaarToFinished);
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = parsePlaytime(hours);
  const played = game.playedHours ?? 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Finish ${game.title}`}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg text-ink">Log your time first?</h2>
        <p className="mt-1 text-sm text-muted">
          You&apos;ve logged {formatPlaytime(played)} of about {formatPlaytime(length)} on{" "}
          <span className="font-medium text-ink">{game.title}</span>. Finishing now pays{" "}
          <CoinIcon size={12} /> {payNow}; the other <CoinIcon size={12} /> {held} unlock as you
          log your time, all of it at {formatPlaytime(gateHours)}. A clear with that much logged
          also counts toward your Clear Streak.
        </p>

        <div className="mt-4 rounded-xl border border-line bg-panel/40 p-3">
          <label className="block text-xs font-medium text-ink" htmlFor="finish-check-hours">
            Time you played that isn&apos;t logged yet
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              id="finish-check-hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="e.g. 12h 30m"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
            <button
              type="button"
              disabled={busy || parsed == null || parsed <= 0}
              onClick={() =>
                void run(async () => {
                  await logPlaytime(game.id, parsed as number);
                  onFinish();
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
            >
              <Clock size={14} /> Log &amp; finish
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await abandonGame(game.id);
                await bazaarToFinished(game.id, "beaten");
              })
            }
            className="flex items-start gap-2 rounded-xl border border-line bg-panel/40 p-3 text-left transition hover:border-brand/50 disabled:opacity-50"
          >
            <History size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <span className="block text-sm font-medium text-ink">I beat this before I joined</span>
              <span className="block text-xs text-muted">
                Your activation coins come back and it goes to Finished, without a bounty.
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onClose();
              onFinish();
            }}
            className="flex items-start gap-2 rounded-xl border border-line bg-panel/40 p-3 text-left transition hover:border-brand/50 disabled:opacity-50"
          >
            <Check size={16} className="mt-0.5 shrink-0 text-success" />
            <span>
              <span className="block text-sm font-medium text-ink">Finish anyway</span>
              <span className="block text-xs text-muted">
                Get <CoinIcon size={11} /> {payNow} now and the rest as you log your time.
              </span>
            </span>
          </button>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
