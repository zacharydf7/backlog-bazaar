import { useState } from "react";
import { createPortal } from "react-dom";
import { HandCoins, X } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { CoinIcon } from "./CoinIcon";
import {
  activeBackersFor,
  backersTooltip,
  expiryLabel,
  myActiveStakeOn,
  pairBudgetUsed,
  soonestExpiry,
  totalStaked,
  validateStake,
} from "../lib/sponsorships";
import type { Game } from "../types";

/** Owner-side chip: this game carries active backings — finish it before they
 *  expire to claim the bonus coins. Self-hides when nothing is staked. */
export function SponsorChip({ game }: { game: Game }) {
  const { sponsorships, userId } = useStore();
  if (!userId) return null;
  const backers = activeBackersFor(sponsorships, game.id).filter((s) => s.recipient === userId);
  if (backers.length === 0) return null;
  const soonest = soonestExpiry(backers);
  return (
    <span
      title={backersTooltip(backers)}
      className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
    >
      <HandCoins size={10} /> Backed +{totalStaked(backers)}
      {soonest ? ` · ${expiryLabel(soonest)}` : ""}
    </span>
  );
}

/** Visitor-side affordance on a friend's backlog card: open the staking modal,
 *  or show your existing stake. Self-hides unless this is a friend's ordinary
 *  (non-pre-order) Bazaar game in cloud mode. */
export function BackGameButton({ game }: { game: Game }) {
  const { viewing, friends, userId, cloud, sponsorships, economyEnabled } = useStore();
  const [open, setOpen] = useState(false);
  if (!cloud || !userId || !viewing) return null;
  // No backing when either side has the coin economy off (frozen balances).
  if (!economyEnabled || viewing.economyEnabled === false) return null;
  if (game.status !== "backlog" || game.preorderedAt) return null;
  if (!friends.some((f) => f.id === viewing.userId)) return null;

  const mine = myActiveStakeOn(sponsorships, userId, game.id);
  if (mine) {
    return (
      <span
        title={`You staked ${mine.amount} coins on this — pays out if ${viewing.displayName} finishes it (${expiryLabel(mine.expiresAt)}).`}
        className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
      >
        <HandCoins size={10} /> You backed +{mine.amount}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`Stake coins on ${game.title} — ${viewing.displayName} claims them as a bonus by finishing it`}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted transition hover:border-brand/50 hover:text-ink"
      >
        <HandCoins size={10} /> Back it
      </button>
      {open &&
        createPortal(<SponsorModal game={game} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** The staking modal: pick an amount inside every limit, see when it returns
 *  if unclaimed, and confirm. The server re-enforces all guards. */
function SponsorModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const {
    sponsorGame,
    sponsorships,
    userId,
    viewing,
    coins,
    sponsorMaxStake,
    sponsorMonthlyPairCap,
    sponsorExpiryDays,
  } = useStore();
  useScrollLock(true);
  const [amountStr, setAmountStr] = useState("10");
  const [busy, setBusy] = useState(false);

  const amount = Number(amountStr);
  const pairUsed =
    userId && viewing ? pairBudgetUsed(sponsorships, userId, viewing.userId) : 0;
  const error = validateStake(amount, {
    maxStake: sponsorMaxStake,
    balance: coins,
    pairUsed,
    pairCap: sponsorMonthlyPairCap,
  });
  const expires = new Date(Date.now() + sponsorExpiryDays * 24 * 60 * 60 * 1000);

  async function submit() {
    if (error || busy) return;
    setBusy(true);
    const ok = await sponsorGame(game.id, amount);
    setBusy(false);
    if (ok) onClose();
  }

  return (
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
            <HandCoins size={16} className="shrink-0 text-accent" />
            <span className="truncate">Back {game.title}</span>
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
            Stake coins on this game — {viewing?.displayName ?? "your friend"} claims them as a
            bonus on top of the bounty by finishing it. Unclaimed by{" "}
            {expires.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, the stake
            comes back to you.
          </p>

          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-subtle">
              Stake (coins)
            </span>
            <input
              type="number"
              min={1}
              max={sponsorMaxStake}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand/60"
            />
          </label>

          <p className="text-[11px] text-subtle">
            Max {sponsorMaxStake} per stake · you have{" "}
            <span className="inline-flex items-center gap-0.5">
              <CoinIcon size={11} /> {coins}
            </span>{" "}
            · {Math.max(0, sponsorMonthlyPairCap - pairUsed)} left on this friend&apos;s monthly
            limit
          </p>

          {error && Number.isFinite(amount) && amountStr !== "" && (
            <p className="text-[11px] text-danger">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
            >
              Cancel
            </button>
            <button
              onClick={() => void submit()}
              disabled={!!error || busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              <HandCoins size={14} /> {busy ? "Staking…" : "Stake it"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
