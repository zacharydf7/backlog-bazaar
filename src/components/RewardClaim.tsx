import { useState } from "react";
import { Check, Coins } from "lucide-react";
import { useStore } from "../store";

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
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg shadow-sm transition hover:opacity-90 disabled:opacity-60"
      >
        <Coins size={12} /> Claim +{reward}
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
      title={`Pays ${reward} coins when earned`}
    >
      <Coins size={11} /> {reward}
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
  const [busy, setBusy] = useState(false);
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <p className="inline-flex items-center gap-2 text-sm text-ink">
        <Coins size={16} className="shrink-0 text-accent" />
        {economyEnabled
          ? `${count} ${count === 1 ? "reward" : "rewards"} ready to claim — ${coins.toLocaleString()} coins`
          : `${coins.toLocaleString()} coins in rewards are waiting for when your coin economy is back on`}
      </p>
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
