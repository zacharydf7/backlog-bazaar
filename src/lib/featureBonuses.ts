// Feature bonuses: small, repeatable coin rewards for using the optional parts of
// the app that take more setup than "just add a game" — story-locking a series,
// recording what a copy cost, reviewing what you finished, logging your sessions.
// The server is authoritative (apply_finish, claim_review_bonus, log_playtime all
// re-derive eligibility and read the live amounts from app_config); these helpers
// mirror its rules for the card previews and the offline (guest) finish.
//
// Each bonus is anchored to a step the economy already trusts, so none can be
// farmed by toggling a setting: the finish bonuses only pay on a paying first
// clear, the Reviewer bonus once per game finished through the loop, and the
// Daily Session bonus once per day.

import type { Game, GameCopy } from "../types";
import { formatPlaytime } from "./playtime";
import { prerequisiteOf } from "./prerequisites";

export interface FeatureBonusConfig {
  /** Coins for finishing a game you started story-locked behind its prerequisite. */
  storyOrder: number;
  /** Coins for finishing a game whose copy notes what it cost or where it's played. */
  collectorsRecord: number;
  /** Coins for reviewing a game you finished (once per game). */
  reviewer: number;
  /** Minimum review length (characters) that earns the Reviewer bonus. */
  reviewMinChars: number;
  /** Coins for each qualifying play log, up to `dailySessionCap` a day. */
  dailySession: number;
  /** Minimum logged minutes that count toward the Daily Session bonus (0 = any). */
  dailySessionMinMinutes: number;
  /** How many Daily Session bonuses a day can pay. */
  dailySessionCap: number;
}

/** Defaults — mirrored by the app_config column defaults in schema.sql. */
export const FEATURE_BONUS_DEFAULTS: FeatureBonusConfig = {
  storyOrder: 20,
  collectorsRecord: 10,
  reviewer: 15,
  reviewMinChars: 100,
  dailySession: 5,
  dailySessionMinMinutes: 0,
  dailySessionCap: 3,
};

/** True when any copy records what you paid for it (a cost, $0 included) or the
 *  service/lender you play it through. A Player 2 seat is someone else's copy,
 *  so it never counts (the server drops its cost too). */
export function hasCollectorsRecord(copies: GameCopy[] | undefined): boolean {
  return (copies ?? []).some(
    (c) =>
      (c.acquisition !== "player2" && typeof c.cost === "number" && Number.isFinite(c.cost) && c.cost >= 0) ||
      ((c.acquisition === "subscription" || c.acquisition === "borrowed") && (c.provider ?? "").trim() !== ""),
  );
}

/** Whether starting this game right now would stamp the run story-locked: its
 *  prerequisite is set and already Finished (mirrors games_stamp_story_start). */
export function startsStoryLocked(games: Game[], game: Game): boolean {
  return game.inRotation !== true && prerequisiteOf(games, game)?.status === "finished";
}

/** Whether the game is on track for the Story Order bonus: a playing run carries
 *  the stamp from its start (locking mid-run doesn't count); a Bazaar game earns
 *  it once started, as long as it's story-locked. */
export function earnsStoryOrder(games: Game[], game: Game): boolean {
  if (game.status === "playing") return game.startedStoryLocked === true;
  if (game.status === "backlog") return prerequisiteOf(games, game) != null;
  return false;
}

export interface FinishBonuses {
  storyOrder: number;
  collectorsRecord: number;
}

/** The feature bonuses a finish pays on top of its bounty. Only a paying first
 *  clear earns them — replays, resumed re-clears and economy-off / free-started
 *  runs pay nothing (mirrors apply_finish). */
export function finishBonuses(
  games: Game[],
  game: Game,
  opts: { firstClear: boolean; paying: boolean },
  cfg: FeatureBonusConfig,
): FinishBonuses {
  if (!opts.firstClear || !opts.paying) return { storyOrder: 0, collectorsRecord: 0 };
  return {
    storyOrder: earnsStoryOrder(games, game) ? Math.max(0, cfg.storyOrder) : 0,
    collectorsRecord: hasCollectorsRecord(game.copies) ? Math.max(0, cfg.collectorsRecord) : 0,
  };
}

export function finishBonusTotal(b: FinishBonuses): number {
  return b.storyOrder + b.collectorsRecord;
}

/** "Story Order +20 · Collector's Record +10" — the paid bonuses only. */
export function finishBonusSummary(b: FinishBonuses): string {
  const parts: string[] = [];
  if (b.storyOrder > 0) parts.push(`Story Order +${b.storyOrder}`);
  if (b.collectorsRecord > 0) parts.push(`Collector's Record +${b.collectorsRecord}`);
  return parts.join(" · ");
}

/** Is a review long enough to earn the Reviewer bonus? Counts characters (code
 *  points, matching Postgres char_length) after trimming. */
export function reviewQualifies(text: string | undefined, minChars: number): boolean {
  return [...(text ?? "").trim()].length >= Math.max(1, minChars);
}

/** Does a play log count toward the Daily Session bonus? Whole minutes, matching
 *  the server's round(hours × 60). */
export function sessionQualifies(hours: number, minMinutes: number): boolean {
  return Number.isFinite(hours) && hours > 0 && Math.round(hours * 60) >= Math.max(0, minMinutes);
}

/** "1h 30m logged", plus " · Daily Session +3" when the log earned the bonus. */
export function loggedToastText(hours: number, bonus: number): string {
  const base = `${formatPlaytime(hours)} logged`;
  return bonus > 0 ? `${base} · Daily Session +${bonus}` : base;
}
