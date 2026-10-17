import { useEffect, useState } from "react";
import {
  Target,
  Trophy,
  BadgeCheck,
  Clock,
  CalendarDays,
  Shovel,
  Timer,
  Star,
  RefreshCw,
  Flag,
  Award,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { ClaimAllBanner, RewardClaim } from "./RewardClaim";
import {
  PICKS_PER_MONTH,
  daysLeft,
  metricGoalLabel,
  progressCount,
  progressFraction,
  seasonalPhase,
  unclaimedChallengeRewards,
  type MenuGoal,
  type MonthlyPick,
  type SeasonalChallenge,
} from "../lib/challenges";

/** Icons the goal menu names (challenge_goals.icon); anything else is a target. */
const GOAL_ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  "badge-check": BadgeCheck,
  clock: Clock,
  calendar: CalendarDays,
  shovel: Shovel,
  timer: Timer,
  star: Star,
  "refresh-cw": RefreshCw,
};

function ProgressBar({ fraction, done }: { fraction: number; done: boolean }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
      <div
        className={"h-full rounded-full " + (done ? "bg-success" : "bg-accent/70")}
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </div>
  );
}

function monthName(month: string): string {
  // "YYYY-MM-DD" is a calendar date, so read it as local noon to keep the month.
  return new Date(`${month}T12:00:00`).toLocaleDateString(undefined, { month: "long" });
}

function shortDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One of your picked goals: progress, then its reward. */
function PickRow({ pick, icon }: { pick: MonthlyPick; icon: string }) {
  const claim = useStore((s) => s.claimChallengeRewards);
  const Icon = GOAL_ICONS[icon] ?? Target;
  const done = pick.completedAt != null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3">
      <span
        className={
          "grid size-10 shrink-0 place-items-center rounded-full " +
          (done ? "bg-success/15 text-success" : "bg-panel text-accent")
        }
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{pick.name}</p>
        <ProgressBar fraction={done ? 1 : progressFraction(pick.progress, pick.target)} done={done} />
        <p className="mt-0.5 text-[11px] text-subtle">
          {done ? "Complete" : progressCount(pick.progress, pick.target)}
        </p>
      </div>
      <RewardClaim
        reward={pick.reward}
        state={!done ? "locked" : pick.rewardPaidAt == null ? "claimable" : "claimed"}
        onClaim={() => claim(pick.id)}
      />
    </div>
  );
}

/** A goal you could still pick. Picks are final, so the first tap asks for a
 *  second to confirm. */
function MenuRow({ goal, reward }: { goal: MenuGoal; reward: number }) {
  const pick = useStore((s) => s.pickMonthlyGoal);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const Icon = GOAL_ICONS[goal.icon] ?? Target;
  const met = goal.progress >= goal.target;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-panel text-muted">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{goal.description}</p>
        <p className="text-[11px] text-subtle">
          {goal.name} · {met ? "already done this month" : `so far ${progressCount(goal.progress, goal.target)}`}
          {reward > 0 && ` · ${reward} coins`}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setBusy(true);
          await pick(goal.key);
          setBusy(false);
          setConfirming(false);
        }}
        onBlur={() => setConfirming(false)}
        className={
          "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 " +
          (confirming ? "bg-brand text-brand-fg" : "border border-line text-ink hover:bg-panel")
        }
      >
        {confirming ? "Confirm" : "Pick"}
      </button>
    </div>
  );
}

function SeasonalCard({ challenge, now }: { challenge: SeasonalChallenge; now: number }) {
  const claim = useStore((s) => s.claimChallengeRewards);
  const phase = seasonalPhase(challenge, now);
  const done = challenge.completedAt != null;
  const when =
    phase === "upcoming"
      ? `Starts ${shortDate(challenge.startsAt)}`
      : phase === "live"
        ? `${daysLeft(challenge.endsAt, now)} days left · ends ${shortDate(challenge.endsAt)}`
        : `Ended ${shortDate(challenge.endsAt)}`;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg text-ink">{challenge.name}</h3>
          <p className="text-[11px] uppercase tracking-wide text-subtle">{when}</p>
        </div>
        <RewardClaim
          reward={challenge.reward}
          state={!done ? "locked" : challenge.rewardPaidAt == null ? "claimable" : "claimed"}
          onClaim={async () => {
            if (challenge.entryId) await claim(challenge.entryId);
          }}
        />
      </div>
      {challenge.description && <p className="text-sm text-muted">{challenge.description}</p>}
      <p className="text-xs font-medium text-ink">{metricGoalLabel(challenge.metric, challenge.target)}</p>
      {phase !== "upcoming" && (
        <>
          <ProgressBar fraction={done ? 1 : progressFraction(challenge.progress, challenge.target)} done={done} />
          <p className="text-[11px] text-subtle">
            {done
              ? "Complete"
              : phase === "ended"
                ? `Finished at ${progressCount(challenge.progress, challenge.target)}`
                : progressCount(challenge.progress, challenge.target)}
          </p>
        </>
      )}
      {challenge.badge && (
        <p className="inline-flex items-center gap-1 text-[11px] text-muted">
          <Award size={12} className="text-accent" /> Earns the {challenge.badge.name} badge
        </p>
      )}
    </section>
  );
}

/** Monthly goals (pick 3 from the menu; progress counts from the 1st) and the
 *  seasonal events an admin runs, with every reward claimed by hand. */
export function ChallengesPage() {
  const cloud = useStore((s) => s.cloud);
  const challenges = useStore((s) => s.challenges);
  const fetchChallenges = useStore((s) => s.fetchChallenges);
  const evaluateChallenges = useStore((s) => s.evaluateChallenges);
  const claimAll = useStore((s) => s.claimChallengeRewards);

  useEffect(() => {
    if (!cloud) return;
    // Record anything just completed, then load the page with fresh progress.
    void evaluateChallenges().then(() => fetchChallenges());
  }, [cloud, evaluateChallenges, fetchChallenges]);

  if (!cloud) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <p className="font-display text-xl text-ink">Challenges live in the cloud</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Sign in to pick monthly goals and join seasonal challenges for coins and badges.
        </p>
      </div>
    );
  }

  if (!challenges) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
        Loading your challenges…
      </div>
    );
  }

  const now = Date.now();
  const picked = new Set(challenges.picks.map((p) => p.goalKey));
  const iconFor = (key: string) => challenges.menu.find((g) => g.key === key)?.icon ?? "target";
  const openSlots = PICKS_PER_MONTH - challenges.picks.length;
  const doneCount = challenges.picks.filter((p) => p.completedAt != null).length;
  const waiting = unclaimedChallengeRewards(challenges);
  const bonus = challenges.bonus;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <h1 className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
          <Target size={22} className="text-accent" /> Challenges
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Pick three goals each month and take on seasonal challenges. Each one pays coins once you
          claim it.
        </p>
      </div>

      <ClaimAllBanner count={waiting.count} coins={waiting.coins} onClaimAll={() => claimAll()} />

      <section className="flex flex-col gap-3" data-testid="monthly-goals">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-xl text-ink">{monthName(challenges.month)} goals</h2>
          <p className="text-xs text-subtle">
            {daysLeft(challenges.endsAt, now)} days left · {challenges.goalReward} coins each,{" "}
            {challenges.setBonus} more for all three
          </p>
        </div>

        {challenges.picks.map((p) => (
          <PickRow key={p.id} pick={p} icon={iconFor(p.goalKey)} />
        ))}

        {challenges.picks.length === PICKS_PER_MONTH && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel/60 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-accent">
              <Flag size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">All three goals</p>
              <p className="text-[11px] text-subtle">{bonus ? "Complete" : `${doneCount} of 3 done`}</p>
            </div>
            <RewardClaim
              reward={bonus?.reward ?? challenges.setBonus}
              state={!bonus ? "locked" : bonus.rewardPaidAt == null ? "claimable" : "claimed"}
              onClaim={async () => {
                if (bonus) await claimAll(bonus.id);
              }}
            />
          </div>
        )}

        {openSlots > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Pick {openSlots} more · progress counts from the 1st, and picks are final for the month
            </p>
            {challenges.menu
              .filter((g) => !picked.has(g.key))
              .map((g) => (
                <MenuRow key={g.key} goal={g} reward={challenges.goalReward} />
              ))}
          </div>
        )}

        {challenges.unclaimedEarlier.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">From earlier months</p>
            {challenges.unclaimedEarlier.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                <p className="text-sm font-semibold text-ink">{e.name}</p>
                <RewardClaim reward={e.reward} state="claimable" onClaim={() => claimAll(e.id)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" data-testid="seasonal-challenges">
        <h2 className="font-display text-xl text-ink">Seasonal challenges</h2>
        {challenges.seasonal.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
            No seasonal challenges right now. Check back soon.
          </p>
        ) : (
          challenges.seasonal.map((c) => <SeasonalCard key={c.id} challenge={c} now={now} />)
        )}
      </section>
    </div>
  );
}
