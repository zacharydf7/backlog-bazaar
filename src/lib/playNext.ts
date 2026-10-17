// "Help me choose": the guided side of Mystery Pull. The player answers four
// quick questions (how long a game, which platform, what mood, what they're
// after) and gets up to three games from the same startable-now pool the
// random pull uses (mysteryPullPool), each with the reasons it was picked.
// Choosing one goes through the normal activation flow. Pure and
// rng-injectable so filtering and ranking are unit-tested offline.

import type { Game } from "../types";
import { gamePriorityRank, GAME_PRIORITY_LABEL } from "./gamePriority";
import { earnsStoryOrder } from "./featureBonuses";
import { formatPlaytime } from "./playtime";

export type LengthChoice = "any" | "quick" | "medium" | "long";
export type MoodChoice = "any" | "relaxing" | "action" | "story" | "strategic";
export type AimChoice = "balanced" | "priority" | "waiting" | "series" | "surprise";

export interface PlayNextAnswers {
  length: LengthChoice;
  /** A platform name, or null for any. */
  platform: string | null;
  mood: MoodChoice;
  aim: AimChoice;
}

export const DEFAULT_ANSWERS: PlayNextAnswers = {
  length: "any",
  platform: null,
  mood: "any",
  aim: "balanced",
};

export const LENGTH_OPTIONS: { value: LengthChoice; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "quick", label: "Under 10h" },
  { value: "medium", label: "10–30h" },
  { value: "long", label: "30h+" },
];

export const MOOD_OPTIONS: { value: MoodChoice; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "relaxing", label: "Relaxing" },
  { value: "action", label: "Action" },
  { value: "story", label: "Story" },
  { value: "strategic", label: "Strategic" },
];

export const AIM_OPTIONS: { value: AimChoice; label: string }[] = [
  { value: "balanced", label: "A good mix" },
  { value: "priority", label: "My priorities" },
  { value: "waiting", label: "Oldest first" },
  { value: "series", label: "Next in a series" },
  { value: "surprise", label: "Surprise me" },
];

/** Genre keywords per mood, matched against a genre with case, spaces and
 *  punctuation stripped ("Hack and Slash/Beat 'em up" → "hackandslashbeatemup").
 *  A genre can feed more than one mood. */
const MOOD_KEYWORDS: Record<Exclude<MoodChoice, "any">, string[]> = {
  relaxing: ["puzzle", "casual", "simulation", "family", "board", "card", "music", "rhythm"],
  action: [
    "action", "shooter", "platformer", "fighting", "arcade", "racing",
    "hackandslash", "beatemup", "sports", "roguelike", "survival",
  ],
  story: ["rpg", "adventure", "visualnovel", "cinematic", "pointandclick", "horror"],
  strategic: ["strategy", "tactical", "turnbased", "card"],
};

function normalizeGenre(genre: string): string {
  return genre.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Does any of the game's genres fit the mood? Untagged games fit only "any". */
export function fitsMood(genres: string[], mood: MoodChoice): boolean {
  if (mood === "any") return true;
  const keys = MOOD_KEYWORDS[mood];
  return genres.some((g) => {
    const n = normalizeGenre(g);
    return keys.some((k) => n.includes(k));
  });
}

/** The length the economy uses: your personal length, else the catalog's. */
export function effectiveLength(g: Pick<Game, "personalHours" | "hours">): number | null {
  const h = g.personalHours ?? g.hours;
  return h != null && h > 0 ? h : null;
}

/** Does the game's length fit the choice? A game with no known length fits
 *  only "any". */
export function fitsLength(g: Pick<Game, "personalHours" | "hours">, length: LengthChoice): boolean {
  if (length === "any") return true;
  const h = effectiveLength(g);
  if (h == null) return false;
  if (length === "quick") return h <= 10;
  if (length === "medium") return h > 10 && h <= 30;
  return h > 30;
}

/** The platforms a game can be played on: its copies', else the catalog's. */
export function gamePlatforms(g: Pick<Game, "copies" | "platforms">): string[] {
  const owned = (g.copies ?? []).map((c) => c.platform).filter((p): p is string => !!p);
  return [...new Set(owned.length > 0 ? owned : (g.platforms ?? []))];
}

/** Every platform in the pool, for the platform question, alphabetized. */
export function poolPlatforms(pool: Game[]): string[] {
  return [...new Set(pool.flatMap(gamePlatforms))].sort((a, b) => a.localeCompare(b));
}

const DAY = 86_400_000;

/** "Waiting 3 months" / "Waiting 2 years"; null for anything under a month. */
export function waitLabel(addedAt: number, now: number): string | null {
  const days = Math.floor((now - addedAt) / DAY);
  if (days < 30) return null;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `Waiting ${months} month${months === 1 ? "" : "s"}`;
  }
  const years = Math.floor(days / 365);
  return `Waiting ${years} year${years === 1 ? "" : "s"}`;
}

/** The mixed ranking: priority counts most, then time waited (capped at three
 *  years, so a decade-old impulse buy doesn't drown everything), then being
 *  next in a series. */
export function balancedScore(g: Game, games: Game[], now: number): number {
  const years = Math.min(3, Math.max(0, (now - g.addedAt) / (365 * DAY)));
  return gamePriorityRank(g.priority) * 3 + years * 2 + (earnsStoryOrder(games, g) ? 3 : 0);
}

export interface PlayNextPick {
  game: Game;
  reasons: string[];
}

/** Why a game was picked, most telling first: its priority, how long it has
 *  waited, being next in a series (with the bonus, when the economy pays it),
 *  and its length. */
export function pickReasons(g: Game, games: Game[], now: number, storyOrderBonus: number): string[] {
  const reasons: string[] = [];
  if (g.priority) reasons.push(GAME_PRIORITY_LABEL[g.priority]);
  if (earnsStoryOrder(games, g)) {
    reasons.push("Next in series");
    if (storyOrderBonus > 0) reasons.push(`+${storyOrderBonus} Story Order`);
  }
  const wait = waitLabel(g.addedAt, now);
  if (wait) reasons.push(wait);
  const h = effectiveLength(g);
  if (h != null) reasons.push(`~${formatPlaytime(h)}`);
  return reasons;
}

/** Filter the startable pool by the answers and rank it by the aim. Returns up
 *  to `count` picks plus how many games matched the filters. */
export function pickNext(
  pool: Game[],
  games: Game[],
  answers: PlayNextAnswers,
  opts: { now: number; storyOrderBonus: number; rng?: () => number; count?: number },
): { picks: PlayNextPick[]; matched: number } {
  const { now, storyOrderBonus, rng = Math.random, count = 3 } = opts;
  let matches = pool.filter(
    (g) =>
      fitsLength(g, answers.length) &&
      fitsMood(g.genres ?? [], answers.mood) &&
      (answers.platform == null || gamePlatforms(g).includes(answers.platform)),
  );
  if (answers.aim === "series") matches = matches.filter((g) => earnsStoryOrder(games, g));

  const oldestFirst = (a: Game, b: Game) => a.addedAt - b.addedAt;
  let ranked: Game[];
  if (answers.aim === "surprise") {
    // Fisher–Yates over a copy, so the draw is uniform.
    ranked = [...matches];
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
    }
  } else if (answers.aim === "priority") {
    ranked = [...matches].sort((a, b) => gamePriorityRank(b.priority) - gamePriorityRank(a.priority) || oldestFirst(a, b));
  } else if (answers.aim === "waiting") {
    ranked = [...matches].sort(oldestFirst);
  } else {
    ranked = [...matches].sort(
      (a, b) => balancedScore(b, games, now) - balancedScore(a, games, now) || oldestFirst(a, b),
    );
  }
  return {
    picks: ranked.slice(0, count).map((game) => ({ game, reasons: pickReasons(game, games, now, storyOrderBonus) })),
    matched: matches.length,
  };
}

/** Coerce remembered answers (localStorage) back to valid ones. */
export function coerceAnswers(raw: unknown): PlayNextAnswers {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = <T extends string>(v: unknown, options: { value: T }[], fallback: T): T =>
    options.some((o) => o.value === v) ? (v as T) : fallback;
  return {
    length: pick(r.length, LENGTH_OPTIONS, "any"),
    platform: typeof r.platform === "string" && r.platform ? r.platform : null,
    mood: pick(r.mood, MOOD_OPTIONS, "any"),
    aim: pick(r.aim, AIM_OPTIONS, "balanced"),
  };
}
