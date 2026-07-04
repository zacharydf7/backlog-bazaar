import { useEffect } from "react";
import { Medal, Lock } from "lucide-react";
import { useStore } from "../store";
import { resolveBadgeIcon } from "../lib/badges";
import {
  TIER_META,
  tierLabel,
  groupAchievements,
  achievementProgress,
  progressLabel,
  rarityLabel,
  earnedSummary,
} from "../lib/achievements";
import type { Achievement } from "../types";

/** The tier-ringed medal icon for one achievement. Earned medals take their
 *  metal's fixed colour; locked ones render as a greyed silhouette, so unearned
 *  targets are visible but unmistakably not held (per the request's mock-up). */
export function AchievementMedallion({
  achievement,
  size = 48,
}: {
  achievement: Achievement;
  size?: number;
}) {
  const Icon = resolveBadgeIcon(achievement.icon);
  const earned = achievement.earnedAt != null;
  const tier = TIER_META[achievement.tier];
  return (
    <span
      title={`${achievement.name} (${tier.label}) — ${achievement.description}`}
      className={
        "grid shrink-0 place-items-center rounded-full border-2 bg-panel " +
        (earned ? "shadow-sm" : "border-line opacity-50 grayscale")
      }
      style={{
        width: size,
        height: size,
        ...(earned ? { borderColor: tier.color, color: tier.color } : undefined),
      }}
    >
      <Icon size={Math.round(size * 0.45)} />
    </span>
  );
}

function earnedDateLabel(earnedAt: number): string {
  return new Date(earnedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** One tier's row inside a family card: medal, name + requirement, then the
 *  earn date (earned), a progress bar (the next target), or a lock (further
 *  tiers). */
function TierRow({ achievement, isNext }: { achievement: Achievement; isNext: boolean }) {
  const earned = achievement.earnedAt != null;
  const tier = TIER_META[achievement.tier];
  const progress = achievementProgress(achievement);
  const counts = progressLabel(achievement);
  return (
    <div className="flex items-start gap-3">
      <AchievementMedallion achievement={achievement} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={"text-sm font-semibold " + (earned ? "text-ink" : "text-muted")}>
            {achievement.name}
          </span>
          <span
            className="rounded-full border px-1.5 py-px text-[10px] font-medium"
            style={
              earned
                ? { borderColor: tier.color, color: tier.color }
                : { borderColor: "var(--line)", color: "var(--subtle)" }
            }
          >
            {tierLabel(achievement.tier)}
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
    </div>
  );
}

/** The trophy room: every achievement family with its Bronze/Silver/Gold tiers —
 *  earned medals in their metal with the earn date, the next target with a live
 *  progress bar, and further tiers greyed. Your own page only (the Profile hub
 *  shows the earned-medal summary for visitors). */
export function AchievementsPage() {
  const cloud = useStore((s) => s.cloud);
  const achievements = useStore((s) => s.achievements);
  const fetchAchievements = useStore((s) => s.fetchAchievements);

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

  const families = groupAchievements(achievements);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
            <Medal size={22} className="text-accent" /> Achievements
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Milestone medals earned automatically as you play. Bronze, Silver and Gold tiers —
            upgrade a medal by pushing its count higher.
          </p>
        </div>
        {achievements.length > 0 && (
          <span className="rounded-full bg-panel px-3 py-1.5 text-sm font-medium text-ink">
            {earnedSummary(achievements)}
          </span>
        )}
      </div>

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
        </div>
      )}
    </div>
  );
}
