// Pure helpers for Challenges: monthly goals (pick 3 from a menu each month)
// and admin-run seasonal events. The server owns the rules (see the Challenges
// section of supabase/schema.sql): list_challenges returns the whole page as
// one JSON document, evaluate_challenges records completions, and
// claim_challenge_rewards pays them. This module only coerces that document
// and formats progress, so it's unit-tested without React/Supabase.

/** Every metric a challenge can count, with how to talk about it. Mirrors
 *  challenge_metric_keys() in schema.sql. */
export const CHALLENGE_METRICS = {
  games_finished: { label: "Games finished", unit: "games" },
  verified_clears: { label: "Verified clears", unit: "clears" },
  backlog_clears: { label: "Clears of games that waited a year+", unit: "clears" },
  hours_logged: { label: "Hours logged", unit: "hours" },
  play_days: { label: "Days with play logged", unit: "days" },
  stopwatch_sessions: { label: "Stopwatch sessions", unit: "sessions" },
  reviews_written: { label: "Games reviewed", unit: "reviews" },
  rotation_checkins: { label: "Rotation check-ins", unit: "check-ins" },
} as const;

export type ChallengeMetric = keyof typeof CHALLENGE_METRICS;

/** A goal on this month's menu, with your progress on it so far. */
export interface MenuGoal {
  key: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
}

/** One of your picked goals this month. */
export interface MonthlyPick {
  id: string;
  goalKey: string;
  name: string;
  target: number;
  progress: number;
  reward: number;
  completedAt: number | null;
  rewardPaidAt: number | null;
}

/** A completed reward from an earlier month that's still waiting. */
export interface EarlierReward {
  id: string;
  name: string;
  reward: number;
}

export interface SeasonalChallenge {
  id: string;
  name: string;
  description: string;
  metric: string;
  target: number;
  startsAt: number;
  endsAt: number;
  reward: number;
  badge: { name: string; icon: string } | null;
  progress: number;
  /** Your completion row (claim by this id), once completed. */
  entryId: string | null;
  completedAt: number | null;
  rewardPaidAt: number | null;
}

export interface ChallengesState {
  /** First of the month, "YYYY-MM-DD". */
  month: string;
  endsAt: number;
  goalReward: number;
  setBonus: number;
  menu: MenuGoal[];
  picks: MonthlyPick[];
  bonus: { id: string; reward: number; completedAt: number; rewardPaidAt: number | null } | null;
  unclaimedEarlier: EarlierReward[];
  seasonal: SeasonalChallenge[];
}

/** How many goals a player picks each month (the server enforces it too). */
export const PICKS_PER_MONTH = 3;

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function time(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function rows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : [];
}

/** Coerce the list_challenges document. Null for anything unusable. */
export function coerceChallenges(raw: unknown): ChallengesState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.month !== "string") return null;
  const bonus = r.bonus && typeof r.bonus === "object" ? (r.bonus as Record<string, unknown>) : null;
  return {
    month: r.month,
    endsAt: time(r.ends_at) ?? 0,
    goalReward: num(r.goal_reward),
    setBonus: num(r.set_bonus),
    menu: rows(r.menu).map((g) => ({
      key: str(g.key),
      name: str(g.name),
      description: str(g.description),
      icon: str(g.icon, "target"),
      target: num(g.target),
      progress: num(g.progress),
    })),
    picks: rows(r.picks).map((p) => ({
      id: str(p.id),
      goalKey: str(p.goal_key),
      name: str(p.name),
      target: num(p.target),
      progress: num(p.progress),
      reward: num(p.reward),
      completedAt: time(p.completed_at),
      rewardPaidAt: time(p.reward_paid_at),
    })),
    bonus: bonus
      ? {
          id: str(bonus.id),
          reward: num(bonus.reward),
          completedAt: time(bonus.completed_at) ?? 0,
          rewardPaidAt: time(bonus.reward_paid_at),
        }
      : null,
    unclaimedEarlier: rows(r.unclaimed_earlier).map((e) => ({
      id: str(e.id),
      name: str(e.name),
      reward: num(e.reward),
    })),
    seasonal: rows(r.seasonal).map((s) => {
      const badge = s.badge && typeof s.badge === "object" ? (s.badge as Record<string, unknown>) : null;
      return {
        id: str(s.id),
        name: str(s.name),
        description: str(s.description),
        metric: str(s.metric),
        target: num(s.target),
        startsAt: time(s.starts_at) ?? 0,
        endsAt: time(s.ends_at) ?? 0,
        reward: num(s.reward),
        badge: badge ? { name: str(badge.name), icon: str(badge.icon, "award") } : null,
        progress: num(s.progress),
        entryId: typeof s.entry_id === "string" ? s.entry_id : null,
        completedAt: time(s.completed_at),
        rewardPaidAt: time(s.reward_paid_at),
      };
    }),
  };
}

/** Progress toward a target, 0..1. */
export function progressFraction(progress: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, progress / target));
}

/** "12 / 20" — hours keep one decimal, everything else is whole. */
export function progressCount(progress: number, target: number): string {
  const shown = Number.isInteger(progress) ? String(progress) : (Math.floor(progress * 10) / 10).toString();
  return `${shown} / ${target}`;
}

/** "Hours logged: 10" — a seasonal event's goal in a few words. */
export function metricGoalLabel(metric: string, target: number): string {
  const m = CHALLENGE_METRICS[metric as ChallengeMetric];
  return m ? `${m.label}: ${target}` : `${target}`;
}

/** Whole days left until `endsAt` (rounded up), never negative. */
export function daysLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 86_400_000));
}

export type SeasonalPhase = "upcoming" | "live" | "ended";

export function seasonalPhase(c: Pick<SeasonalChallenge, "startsAt" | "endsAt">, now: number): SeasonalPhase {
  if (now < c.startsAt) return "upcoming";
  return now < c.endsAt ? "live" : "ended";
}

/** Everything waiting to be claimed on the page: completed goals, the
 *  all-three bonus, earlier months' leftovers and completed events. */
export function unclaimedChallengeRewards(state: ChallengesState | null): { count: number; coins: number } {
  if (!state) return { count: 0, coins: 0 };
  const amounts = [
    ...state.picks.filter((p) => p.completedAt != null && p.rewardPaidAt == null).map((p) => p.reward),
    ...(state.bonus && state.bonus.rewardPaidAt == null ? [state.bonus.reward] : []),
    ...state.unclaimedEarlier.map((e) => e.reward),
    ...state.seasonal.filter((s) => s.entryId != null && s.rewardPaidAt == null).map((s) => s.reward),
  ].filter((n) => n > 0);
  return { count: amounts.length, coins: amounts.reduce((a, b) => a + b, 0) };
}

/** Toast copy for fresh completions: name one or two, count a burst, and
 *  point at the coins waiting (0 = say nothing of coins). */
export function completionToastMessage(names: string[], coins = 0): string | null {
  if (names.length === 0) return null;
  const claim = coins > 0 ? ` Claim ${coins} coins in Challenges.` : "";
  if (names.length === 1) return `Challenge complete — ${names[0]}!${claim}`;
  if (names.length === 2) return `Challenges complete — ${names[0]} and ${names[1]}!${claim}`;
  return `${names.length} challenges complete!${claim}`;
}

/** A seasonal event as the admin list shows it (archived included). */
export interface AdminSeasonalChallenge {
  id: string;
  name: string;
  description: string;
  metric: string;
  target: number;
  startsAt: number;
  endsAt: number;
  reward: number;
  badgeId: string | null;
  archivedAt: number | null;
  completions: number;
}

export function coerceAdminSeasonal(raw: unknown): AdminSeasonalChallenge[] {
  return rows(raw).map((r) => ({
    id: str(r.id),
    name: str(r.name),
    description: str(r.description),
    metric: str(r.metric),
    target: num(r.target),
    startsAt: time(r.starts_at) ?? 0,
    endsAt: time(r.ends_at) ?? 0,
    reward: num(r.reward),
    badgeId: typeof r.badge_id === "string" ? r.badge_id : null,
    archivedAt: time(r.archived_at),
    completions: num(r.completions),
  }));
}

/** The admin form's values; `id` null creates a new event. */
export interface SeasonalDraft {
  id: string | null;
  name: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  startsAt: number;
  endsAt: number;
  reward: number;
  badgeId: string | null;
}

/** Why a draft can't be saved yet, or null when it's ready. Mirrors the
 *  seasonal_challenges checks so the form explains instead of erroring. */
export function seasonalDraftProblem(d: SeasonalDraft): string | null {
  if (!d.name.trim()) return "Give the challenge a name.";
  if (d.name.trim().length > 80) return "Keep the name to 80 characters.";
  if (d.description.length > 500) return "Keep the description to 500 characters.";
  if (!(d.target > 0)) return "The target must be more than 0.";
  if (!Number.isFinite(d.startsAt) || !Number.isFinite(d.endsAt)) return "Pick a start and an end.";
  if (d.endsAt <= d.startsAt) return "The end must come after the start.";
  if (!(d.reward >= 0 && d.reward <= 100000)) return "The reward must be between 0 and 100,000 coins.";
  return null;
}
