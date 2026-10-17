import { useState } from "react";
import { Check, Coins, PartyPopper } from "lucide-react";
import { useStore } from "../store";
import { boostedReward, rewardsBoost } from "../lib/bonusEvents";

/** A running coin event's boost on reward claims, if any (null otherwise). */
function useRewardsBoost() {
  const events = useStore((s) => s.bonusEvents);
  return rewardsBoost(events, Date.now());
}

/** A coin reward's state on a medal, goal or event: a Claim button while it
 *  waits, a quiet "claimed" mark once paid, or the reward on offer while it's
 *  still to be earned. With the coin economy off, a reward that's ready says
 *  it's waiting instead (the server pauses claims too). */
export function RewardClaim({
  reward,
  state,
  onClaim,
}: {
  reward: number;
  state: "locked" | "claimable" | "claimed";
  onClaim: () => Promise<void>;
}) {
  const economyEnabled = useStore((s) => s.economyEnabled);
  const boost = useRewardsBoost();
  const [busy, setBusy] = useState(false);
  if (reward <= 0) return null;
  if (state === "claimable") {
    if (!economyEnabled) {
      return (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-subtle"
          title="Rewards wait while your coin economy is off"
        >
          <Coins size={11} /> {reward} waiting
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onClaim();
          setBusy(false);
        }}
        title={boost ? `${boost.event}: claim now for ×${boost.mult}` : undefined}
        className={
          "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:opacity-90 disabled:opacity-60 " +
          (boost ? "bg-success text-surface" : "bg-brand text-brand-fg")
        }
      >
        {boost ? (
          <>
            <PartyPopper size={12} /> Claim <s className="font-normal opacity-70">+{reward}</s> +
            {boostedReward(reward, boost)}
          </>
        ) : (
          <>
            <Coins size={12} /> Claim +{reward}
          </>
        )}
      </button>
    );
  }
  if (state === "claimed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-success">
        <Check size={11} /> +{reward} claimed
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[11px] text-subtle"
      title={
        boost
          ? `Pays ${reward} coins when earned; ${boost.event} pays ×${boost.mult} on rewards claimed while it runs`
          : `Pays ${reward} coins when earned`
      }
    >
      <Coins size={11} /> {reward}
      {boost && economyEnabled && <span className="font-semibold text-success">×{boost.mult} now</span>}
    </span>
  );
}

/** The "rewards ready" banner with a Claim all, shared by the trophy room and
 *  Challenges. Hidden when nothing is waiting. */
export function ClaimAllBanner({
  count,
  coins,
  onClaimAll,
}: {
  count: number;
  coins: number;
  onClaimAll: () => Promise<void>;
}) {
  const economyEnabled = useStore((s) => s.economyEnabled);
  const boost = useRewardsBoost();
  const [busy, setBusy] = useState(false);
  if (count === 0) return null;
  const boosted = economyEnabled && boost ? boostedReward(coins, boost) : null;
  return (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 shadow-sm " +
        (boosted != null ? "border-2 border-success" : "border border-line")
      }
    >
      <div className="flex flex-col gap-1">
        <p className="inline-flex items-center gap-2 text-sm text-ink">
          <Coins size={16} className="shrink-0 text-accent" />
          {economyEnabled
            ? `${count} ${count === 1 ? "reward" : "rewards"} ready to claim — ${coins.toLocaleString()} coins`
            : `${coins.toLocaleString()} coins in rewards are waiting for when your coin economy is back on`}
        </p>
        {boost && boosted != null && (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
            <PartyPopper size={13} className="shrink-0" /> {boost.event}: claim now for ×{boost.mult},{" "}
            {boosted.toLocaleString()} coins
          </p>
        )}
      </div>
      {economyEnabled && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onClaimAll();
            setBusy(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:opacity-90 disabled:opacity-60"
        >
          <Coins size={14} /> Claim all
        </button>
      )}
    </div>
  );
}
