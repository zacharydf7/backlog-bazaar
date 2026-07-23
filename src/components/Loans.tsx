import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, HandCoins, PiggyBank, X } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { CoinIcon } from "./CoinIcon";
import { evaluateMathExpression } from "../lib/mathInput";
import {
  loanOwed,
  openLoanForGame,
  pendingLoansForLender,
  validateLoanRequest,
  type Loan,
  type LoanLenderOption,
} from "../lib/loans";
import type { Game } from "../types";

/** Borrower-side entry on a Bazaar card you can't afford: ask a friend to
 *  front the difference. Shows the open loan's state instead once one exists —
 *  a pending ask can be withdrawn; a granted one is about to auto-start the
 *  game (or it's simply buyable again). Cloud + live-economy only; who can
 *  actually be asked is the modal's server-fetched list, so the button never
 *  depends on the Friends panel having been opened. */
export function AskLoanButton({ game, need }: { game: Game; need: number }) {
  const { cloud, userId, economyEnabled, loans, cancelLoanRequest } = useStore();
  const [open, setOpen] = useState(false);
  if (!cloud || !userId || !economyEnabled) return null;

  const existing = openLoanForGame(loans, game.id);
  if (existing?.status === "pending") {
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-subtle">
        <span className="inline-flex items-center gap-1">
          <PiggyBank size={12} className="text-accent" />
          Asked {existing.lenderName} for {existing.amount} coins
        </span>
        <button
          onClick={() => void cancelLoanRequest(existing.id)}
          className="text-muted underline decoration-dotted underline-offset-2 transition hover:text-danger"
        >
          Withdraw
        </button>
      </p>
    );
  }
  if (existing?.status === "active") {
    return (
      <p className="text-center text-[11px] text-success">
        <PiggyBank size={12} className="mr-1 inline" />
        {existing.lenderName} lent you {existing.amount} coins — ready to start.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-ink transition hover:border-brand/50"
      >
        <PiggyBank size={14} className="text-accent" /> Ask a friend for a loan
      </button>
      {open && <LoanModal game={game} need={need} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Pick a friend, pick an amount (defaults to exactly what you're short),
 *  see the repayment terms, ask. Eligible lenders come fresh from the server
 *  (hidden and economy-off accounts filtered; balances only when shared);
 *  the server re-verifies everything again on submit. */
function LoanModal({ game, need, onClose }: { game: Game; need: number; onClose: () => void }) {
  const { loanInterestPct, requestLoan, fetchLoanLenderOptions } = useStore();
  useScrollLock(true);
  const [options, setOptions] = useState<LoanLenderOption[] | null>(null);
  const [lenderId, setLenderId] = useState("");
  const [amountStr, setAmountStr] = useState(String(Math.max(1, need)));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchLoanLenderOptions().then((opts) => {
      if (!live) return;
      setOptions(opts);
      setLenderId((cur) => cur || (opts[0]?.id ?? ""));
    });
    return () => {
      live = false;
    };
  }, [fetchLoanLenderOptions]);

  const lender = options?.find((f) => f.id === lenderId);
  const amount = evaluateMathExpression(amountStr) ?? NaN;
  const error =
    options == null
      ? null // still loading — the submit stays disabled via `lender == null`
      : lender == null
        ? "Pick a friend to ask."
        : validateLoanRequest(amount, { lenderCoins: lender.coins });
  const owed = Number.isFinite(amount) && amount >= 1 ? loanOwed(amount, loanInterestPct) : null;

  async function submit() {
    if (error || busy || !lender) return;
    setBusy(true);
    const ok = await requestLoan(game.id, lender.id, amount);
    setBusy(false);
    if (ok) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex min-w-0 items-center gap-2 font-display text-lg text-ink">
            <PiggyBank size={16} className="shrink-0 text-accent" />
            <span className="truncate">Loan for {game.title}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">
            A friend fronts the coins, the game buys itself into Now Playing, and when you
            finish it the loan repays <span className="font-medium text-ink">from your bounty
            with {loanInterestPct}% interest</span>.
          </p>

          {options != null && options.length === 0 ? (
            <p className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-muted">
              None of your friends can lend right now.
            </p>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-subtle">
                Ask
              </span>
              <select
                value={lenderId}
                onChange={(e) => setLenderId(e.target.value)}
                disabled={options == null}
                className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand/60 disabled:opacity-60"
              >
                {options == null ? (
                  <option value="">Loading friends…</option>
                ) : (
                  options.map((f) => (
                    <option key={f.id} value={f.id}>
                      {/* A private balance shows no number — the server judges
                          "has enough" when the ask lands. */}
                      {f.coins != null ? `${f.displayName} — has ${f.coins} coins` : f.displayName}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-subtle">
              Coins to borrow
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              title="Math works here — try 10*3"
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand/60"
            />
          </label>

          <p className="text-[11px] text-subtle">
            You&apos;re {need} short of the fee.{" "}
            {owed != null && (
              <>
                Borrow{" "}
                <span className="inline-flex items-center gap-0.5 text-muted">
                  <CoinIcon size={11} /> {amount}
                </span>{" "}
                and{" "}
                <span className="inline-flex items-center gap-0.5 text-muted">
                  <CoinIcon size={11} /> {owed}
                </span>{" "}
                repays from your finish bounty.
              </>
            )}
          </p>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={() => void submit()}
            disabled={!!error || busy || lender == null}
            className={
              "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition " +
              (error || busy || lender == null
                ? "cursor-not-allowed bg-panel text-subtle"
                : "bg-brand text-brand-fg hover:brightness-105")
            }
          >
            <HandCoins size={15} /> Ask for the loan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Lender-side strip on the Bazaar board: loan requests waiting on you.
 *  Grant moves the coins immediately; the borrower's app buys the game. */
export function LoanRequestStrip() {
  const { cloud, userId, coins, loans, respondLoan } = useStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!cloud || !userId) return null;
  const pending = pendingLoansForLender(loans, userId);
  if (pending.length === 0) return null;

  const act = async (l: Loan, grant: boolean) => {
    if (busyId) return;
    setBusyId(l.id);
    await respondLoan(l.id, grant);
    setBusyId(null);
  };

  return (
    <div className="mb-3 flex flex-col gap-2">
      {pending.map((l) => {
        const owed = loanOwed(l.amount, l.interestPct);
        const short = coins < l.amount;
        return (
          <div
            key={l.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2"
          >
            <PiggyBank size={16} className="shrink-0 text-accent" />
            <p className="min-w-0 flex-1 text-sm text-muted">
              <span className="font-medium text-ink">{l.borrowerName}</span> asks to borrow{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-ink">
                <CoinIcon size={12} /> {l.amount}
              </span>{" "}
              for <span className="font-medium text-ink">{l.gameTitle}</span> — {owed} coins
              repay from their finish bounty ({l.interestPct}% interest).
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                onClick={() => void act(l, true)}
                disabled={busyId === l.id || short}
                title={short ? "You don't have that many coins right now" : undefined}
                className={
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition " +
                  (short
                    ? "cursor-not-allowed bg-panel text-subtle"
                    : "bg-brand text-brand-fg hover:brightness-105")
                }
              >
                <Check size={13} /> Lend it
              </button>
              <button
                onClick={() => void act(l, false)}
                disabled={busyId === l.id}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-danger"
              >
                <X size={13} /> Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
