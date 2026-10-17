// The weekly recap ("Your week"): the server builds it from the event logs the
// first time a player opens the app in a new week (weekly_recap in
// supabase/schema.sql) and stores it; this module coerces that row and shapes
// it for the card, so it's unit-tested without React/Supabase.

import { TIER_META } from "./achievements";
import type { AchievementTier } from "../types";

export interface WeeklyRecap {
  id: string;
  /** Monday the week started, "YYYY-MM-DD". */
  weekStart: string;
  seenAt: number | null;
  play: {
    hours: number;
    days: number;
    sessions: number;
    topGame: { id: string; title: string; hours: number } | null;
    /** Live-service (Rotation) play and check-ins. */
    rotation: { hours: number; games: number; checkins: number; regularStreak: number | null };
  };
  clears: { finished: number; verified: number; titles: string[]; streak: number; bestStreak: number };
  /** Null when the player's coin economy is off. */
  coins: { earned: number; spent: number; topSources: { kind: string; coins: number }[] } | null;
  progress: {
    achievements: { name: string; tier: AchievementTier }[];
    goals: string[];
    /** Daily and weekly goals completed in the week. */
    quickDone: number;
    close: { name: string; description: string; value: number; threshold: number }[];
    unclaimed: number;
  };
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Coerce a recap: the weekly_recap() document ({id, week_start, data,
 *  seen_at}) or a weekly_recaps row. Null for anything unusable. */
export function coerceWeeklyRecap(raw: unknown): WeeklyRecap | null {
  const r = obj(raw);
  if (typeof r.id !== "string" || typeof r.week_start !== "string") return null;
  const d = obj(r.data);
  const play = obj(d.play);
  const top = d.play && play.top_game ? obj(play.top_game) : null;
  const rotation = obj(play.rotation);
  const clears = obj(d.clears);
  const coins = d.coins ? obj(d.coins) : null;
  const progress = obj(d.progress);
  const seen = typeof r.seen_at === "string" ? Date.parse(r.seen_at) : NaN;
  return {
    id: r.id,
    weekStart: r.week_start,
    seenAt: Number.isFinite(seen) ? seen : null,
    play: {
      hours: num(play.hours),
      days: num(play.days),
      sessions: num(play.sessions),
      topGame: top ? { id: str(top.id), title: str(top.title), hours: num(top.hours) } : null,
      rotation: {
        hours: num(rotation.hours),
        games: num(rotation.games),
        checkins: num(rotation.checkins),
        regularStreak: rotation.regular_streak == null ? null : num(rotation.regular_streak),
      },
    },
    clears: {
      finished: num(clears.finished),
      verified: num(clears.verified),
      titles: list(clears.titles).map(str).filter(Boolean),
      streak: num(clears.streak),
      bestStreak: num(clears.best_streak),
    },
    coins: coins
      ? {
          earned: num(coins.earned),
          spent: num(coins.spent),
          topSources: list(coins.top_sources).map((s) => ({ kind: str(obj(s).kind), coins: num(obj(s).coins) })),
        }
      : null,
    progress: {
      achievements: list(progress.achievements).map((a) => {
        const t = num(obj(a).tier);
        return { name: str(obj(a).name), tier: (t === 2 || t === 3 ? t : 1) as AchievementTier };
      }),
      goals: list(progress.goals).map(str).filter(Boolean),
      quickDone: num(progress.quick_done),
      close: list(progress.close).map((c) => ({
        name: str(obj(c).name),
        description: str(obj(c).description),
        value: num(obj(c).value),
        threshold: num(obj(c).threshold),
      })),
      unclaimed: num(progress.unclaimed),
    },
  };
}

/** "Oct 12 – 18": the Monday-to-Sunday span of the recap's week. */
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString(undefined, withMonth ? { month: "short", day: "numeric" } : { day: "numeric" });
  return `${fmt(start, true)} – ${fmt(end, end.getMonth() !== start.getMonth())}`;
}

/** Hours with at most one decimal and no trailing ".0". */
export function hoursLabel(hours: number): string {
  return `${Math.round(hours * 10) / 10}h`;
}

/** "Gold · Sworn Record" style label for an earned medal. */
export function medalLabel(a: { name: string; tier: AchievementTier }): string {
  return `${TIER_META[a.tier].label} · ${a.name}`;
}

/** "1 check-in" / "3 check-ins". */
export function checkinsLabel(n: number): string {
  return `${n} ${n === 1 ? "check-in" : "check-ins"}`;
}
