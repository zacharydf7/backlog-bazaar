// Pure helpers for the auto-earned achievements system. The catalog + earning
// live in the DB (see the achievements section of supabase/schema.sql): the
// server's evaluate_achievements() is the only writer, and list_achievements
// returns the full catalog with earn state, own progress, and holder counts.
// This module only shapes those rows for display — tier styling, grouping a
// family's Bronze/Silver/Gold, progress + rarity formatting, and the earn-toast
// copy — so it's unit-tested without React/Supabase. Icons resolve through the
// shared registry in src/lib/badges.ts.

import type { Achievement, AchievementTier } from "../types";

/** Presentation for a tier. The metal colours are deliberately fixed hex (not
 *  theme tokens): bronze/silver/gold are real-world constants that must read
 *  the same in every theme, like cover art does. */
export const TIER_META: Record<AchievementTier, { label: string; color: string }> = {
  1: { label: "Bronze", color: "#b0713c" },
  2: { label: "Silver", color: "#8d99a6" },
  3: { label: "Gold", color: "#d4a017" },
};

export function tierLabel(tier: AchievementTier): string {
  return TIER_META[tier].label;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

function coerceTier(v: unknown): AchievementTier {
  const n = num(v);
  return n === 2 || n === 3 ? n : 1;
}

/** Coerce raw `list_achievements` rows into Achievements. Tolerant of the
 *  string bigints/numerics supabase-js returns for count()/numeric columns. */
export function coerceAchievements(rows: unknown): Achievement[] {
  if (!Array.isArray(rows)) return [];
  const out: Achievement[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.slug !== "string") continue;
    out.push({
      id: r.id,
      slug: r.slug,
      family: typeof r.family === "string" ? r.family : "",
      tier: coerceTier(r.tier),
      name: typeof r.name === "string" ? r.name : r.slug,
      description: typeof r.description === "string" ? r.description : "",
      icon: typeof r.icon === "string" ? r.icon : "award",
      metric: typeof r.metric === "string" ? r.metric : "",
      threshold: num(r.threshold),
      sort: num(r.sort),
      earnedAt: typeof r.earned_at === "string" ? Date.parse(r.earned_at) : null,
      metricValue: r.metric_value == null ? null : num(r.metric_value),
      holders: num(r.holders),
      players: Math.max(1, num(r.players)), // never divide by zero
    });
  }
  return out.sort((a, b) => a.sort - b.sort || a.tier - b.tier);
}

/** One family (e.g. "finisher") shaped for display: its tiers in Bronze→Gold
 *  order, the highest earned tier (the medal the gallery shows — an upgrade
 *  visually overwrites the tier below), and the next locked tier (the visible
 *  target, greyed out with a progress bar). */
export interface AchievementFamily {
  family: string;
  tiers: Achievement[];
  /** Highest earned tier, or null when none is earned yet. */
  display: Achievement | null;
  /** Lowest unearned tier — the next goal (null once Gold is earned). */
  next: Achievement | null;
  earnedCount: number;
}

/** Group a full catalog into display families, keeping catalog (sort) order. */
export function groupAchievements(list: Achievement[]): AchievementFamily[] {
  const order: string[] = [];
  const byFamily = new Map<string, Achievement[]>();
  for (const a of list) {
    if (!byFamily.has(a.family)) {
      byFamily.set(a.family, []);
      order.push(a.family);
    }
    byFamily.get(a.family)!.push(a);
  }
  return order.map((family) => {
    const tiers = [...byFamily.get(family)!].sort((a, b) => a.tier - b.tier);
    const earned = tiers.filter((t) => t.earnedAt != null);
    const next = tiers.find((t) => t.earnedAt == null) ?? null;
    return {
      family,
      tiers,
      display: earned.length > 0 ? earned[earned.length - 1] : null,
      next,
      earnedCount: earned.length,
    };
  });
}

/** Every earned achievement, most recent first — the profile module's medals. */
export function earnedAchievements(list: Achievement[]): Achievement[] {
  return list
    .filter((a) => a.earnedAt != null)
    .sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0));
}

/** The gallery medals for a profile module: each family's highest earned tier,
 *  newest earn first. One medal per family, so an upgraded tier replaces the
 *  lower one instead of stacking. */
export function displayMedals(list: Achievement[]): Achievement[] {
  return groupAchievements(list)
    .map((f) => f.display)
    .filter((a): a is Achievement => a != null)
    .sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0));
}

/** Progress toward a locked achievement, 0..1 (1 = the bar full but unearned
 *  edge case right before the evaluator runs). Null when progress is unknown
 *  (another player's page, or a zero threshold). */
export function achievementProgress(a: Achievement): number | null {
  if (a.metricValue == null || a.threshold <= 0) return null;
  return Math.max(0, Math.min(1, a.metricValue / a.threshold));
}

/** "37 / 50" — the numeric progress line under a locked card's bar. Hours
 *  round down to whole numbers so the display never shows long floats. */
export function progressLabel(a: Achievement): string | null {
  if (a.metricValue == null) return null;
  return `${Math.floor(a.metricValue)} / ${a.threshold}`;
}

/** Rarity, as "held by 12% of players" material: whole percent, with anything
 *  under 1% (but non-zero) shown as "<1%" so rare medals read as rare. */
export function rarityLabel(a: Achievement): string {
  if (a.holders <= 0) return "Not yet earned by anyone";
  const pct = (a.holders / a.players) * 100;
  const shown = pct < 1 ? "<1" : String(Math.round(pct));
  return `Earned by ${shown}% of players`;
}

/** "5 of 24 earned" — the trophy-room header line. */
export function earnedSummary(list: Achievement[]): string {
  const earned = list.filter((a) => a.earnedAt != null).length;
  return `${earned} of ${list.length} earned`;
}

/** Toast copy for a batch of fresh earns: name one or two outright; collapse a
 *  bigger burst (e.g. the first sign-in after this ships, when a whole history
 *  is awarded at once) into a count so the screen isn't papered with toasts. */
export function earnToastMessage(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `Achievement unlocked — ${names[0]}!`;
  if (names.length === 2) return `Achievements unlocked — ${names[0]} and ${names[1]}!`;
  return `${names.length} achievements unlocked — see your Profile!`;
}
