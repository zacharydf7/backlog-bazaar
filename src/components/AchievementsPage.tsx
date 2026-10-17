import { useEffect, useState } from "react";
import { Medal, Lock, Coins, Check, EyeOff } from "lucide-react";
import { useStore } from "../store";
import { SealMedal } from "./SealMedal";
import {
  TIER_META,
  tierLabel,
  groupAchievements,
  achievementProgress,
  progressLabel,
  rarityLabel,
  earnedSummary,
  achievementScore,
  isClaimable,
  unclaimedRewards,
} from "../lib/achievements";
import type { Achievement } from "../types";

function earnedDateLabel(earnedAt: number): string {
  return new Date(earnedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** A medal's coin reward: a Claim button while it waits, a quiet "claimed"
 *  mark once paid, or the reward on offer while the medal is still locked.
 *  With the coin economy off, earned rewards say they're waiting instead. */
function RewardTag({ achievement }: { achievement: Achievement }) {
  const economyEnabled = useStore((s) => s.economyEnabled);
  const claim = useStore((s) => s.claimAchievementRewards);
  const [busy, setBusy] = useState(false);
  const { reward } = achievement;
  if (reward <= 0) return null;
  if (isClaimable(achievement)) {
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
          await claim(achievement.id);
          setBusy(false);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg shadow-sm transition hover:opacity-90 disabled:opacity-60"
      >
        <Coins size={12} /> Claim +{reward}
      </button>
    );
  }
  if (achievement.earnedAt != null) {
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

/** One tier's row inside a family card: medal, name + requirement, then the
 *  earn date (earned), a progress bar (the next target), or a lock (further
 *  tiers); the reward sits on the right. */
function TierRow({ achievement, isNext }: { achievement: Achievement; isNext: boolean }) {
  const earned = achievement.earnedAt != null;
  const tier = TIER_META[achievement.tier];
  const progress = achievementProgress(achievement);
  const counts = progressLabel(achievement);
  return (
    <div className="flex items-start gap-3">
      <SealMedal achievement={achievement} size={52} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={"text-sm font-semibold " + (earned ? "text-ink" : "text-muted")}>
            {achievement.name}
          </span>
          <span
            className="rounded-full border px-1.5 py-px text-[10px] font-medium"
            style={
              earned && !achievement.hidden
                ? { borderColor: tier.color, color: tier.color }
                : { borderColor: "var(--line)", color: "var(--subtle)" }
            }
          >
            {achievement.hidden ? "Secret" : tierLabel(achievement.tier)}
          </span>
        </div>
        <p className="text-xs text-muted">{achievement.description}</p>
        {earned ? (
          <p className="mt-0.5 text-[11px] text-subtle">
            Earned {earnedDateLabel(achievement.earnedAt!)} · {rarityLabel(achievement)}
          </p>
        ) : isNext ? (
          <>
            {progress != null && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-panel">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
            <p className="mt-0.5 text-[11px] text-subtle">
              {counts ? `${counts} · ` : ""}
              {rarityLabel(achievement)}
            </p>
          </>
        ) : (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-subtle">
            <Lock size={10} /> {rarityLabel(achievement)}
          </p>
        )}
      </div>
      <RewardTag achievement={achievement} />
    </div>
  );
}

/** The trophy room: every achievement family with its Bronze/Silver/Gold tiers —
 *  earned seals in their metal with the earn date, the next target with a live
 *  progress bar, and further tiers as blind outlines — then the secret medals,
 *  masked until earned. The header carries the achievement score and a Claim
 *  all for rewards still waiting. Your own page only (the Profile hub shows
 *  the earned-medal summary for visitors). */
export function AchievementsPage() {
  const cloud = useStore((s) => s.cloud);
  const achievements = useStore((s) => s.achievements);
  const fetchAchievements = useStore((s) => s.fetchAchievements);
  const claimAll = useStore((s) => s.claimAchievementRewards);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const [claiming, setClaiming] = useState(false);

  // Boot already loaded these; refresh on entry so progress bars are current.
  useEffect(() => {
    if (cloud) void fetchAchievements();
  }, [cloud, fetchAchievements]);

  if (!cloud) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <p className="font-display text-xl text-ink">Achievements live in the cloud</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Sign in to start earning milestone medals for finishing games, logging time, and
          growing your library.
        </p>
      </div>
    );
  }

  const families = groupAchievements(achievements.filter((a) => !a.hidden));
  const secrets = achievements.filter((a) => a.hidden);
  const waiting = unclaimedRewards(achievements);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
            <Medal size={22} className="text-accent" /> Achievements
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Milestone medals earned automatically as you play. Bronze, Silver and Gold tiers —
            upgrade a medal by pushing its count higher. Each medal pays coins once you claim it.
          </p>
        </div>
        {achievements.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-panel px-3 py-1.5 text-sm font-medium text-ink">
              Score {achievementScore(achievements).toLocaleString()}
            </span>
            <span className="rounded-full bg-panel px-3 py-1.5 text-sm font-medium text-ink">
              {earnedSummary(achievements)}
            </span>
          </div>
        )}
      </div>

      {waiting.count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
          <p className="inline-flex items-center gap-2 text-sm text-ink">
            <Coins size={16} className="shrink-0 text-accent" />
            {economyEnabled
              ? `${waiting.count} ${waiting.count === 1 ? "reward" : "rewards"} ready to claim — ${waiting.coins.toLocaleString()} coins`
              : `${waiting.coins.toLocaleString()} coins in rewards are waiting for when your coin economy is back on`}
          </p>
          {economyEnabled && (
            <button
              type="button"
              disabled={claiming}
              onClick={async () => {
                setClaiming(true);
                await claimAll();
                setClaiming(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              <Coins size={14} /> Claim all
            </button>
          )}
        </div>
      )}

      {families.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          Loading your trophy room…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {families.map((f) => (
            <section
              key={f.family}
              data-testid={`achievement-family-${f.family}`}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm"
            >
              {f.tiers.map((t) => (
                <TierRow key={t.id} achievement={t} isNext={f.next?.id === t.id} />
              ))}
            </section>
          ))}
          {secrets.length > 0 && (
            <section
              data-testid="achievement-secrets"
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm"
            >
              <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
                <EyeOff size={12} /> Secret medals
              </h2>
              {secrets.map((t) => (
                <TierRow key={t.id} achievement={t} isNext={false} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
