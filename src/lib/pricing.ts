// Economy helpers that aren't part of the tunable price/bounty formula (that
// lives in ./economy.ts). These cover the surrounding rules: the Replay Bonus
// for re-clearing a linked edition, the "Shelve It" refund, and the starting
// balance.

export const REPLAY = {
  // Linked editions of one title (a "Game Family") only pay the full completion
  // bounty the first time ANY version is finished. Re-clearing another edition on
  // a different platform pays this percentage of the bounty instead — a smaller
  // "Replay Bonus" that discourages farming finishes off the same title. Admins
  // can override the live percentage (stored in app_config.replay_bonus_pct).
  defaultPct: 25,
};

export const COMPLETION = {
  // The "Completion Bonus": completing a game in the Completionist lane (going for
  // 100%) pays this percentage of the game's full bounty ON TOP of the base reward
  // (the full bounty for a first clear, or 0 if it had already been finished and was
  // pulled back to complete). Rewards the extra effort of a 100% run. Admins can
  // override the live percentage (stored in app_config.completion_bonus_pct).
  defaultPct: 50,
};

export const SHELVE = {
  // The "Shelve It" refund: when you drop a game from Now Playing without
  // finishing it, you get this percentage of what you paid back as coins and
  // forfeit the rest to the Bazaar (so at 50% you lose half your investment but
  // still recoup some). Admins can override the live percentage (stored in
  // app_config.shelve_refund_pct).
  defaultPct: 50,
};

export const STARTING_COINS = 120;

// The "Clear Streak": finishing games back-to-back without adding a new one to
// your library builds a consecutive-finish streak that pays an escalating coin
// bonus on top of each finish's normal bounty. Adding ANY game breaks it (see the
// games break-streak trigger in schema.sql). These are the default tuning knobs;
// admins can override the live values (stored in app_config.clear_streak_*).
export const CLEAR_STREAK = {
  // Consecutive finishes needed before the streak "activates" and pays its first
  // bonus (the 3rd finish in a row).
  threshold: 3,
  // Flat bonus paid at the activation threshold.
  base: 100,
  // Extra coins added to the bonus for each finish beyond the threshold.
  step: 25,
  // Maximum bonus a single finish can pay, so a long streak stays balanced.
  cap: 250,
};

// The streak counter value at which the live "flame" indicator lights up — a
// chain is visibly building at 2 in a row, one short of the first payout. The
// break warning, by contrast, fires from the very first consecutive finish.
export const CLEAR_STREAK_ACTIVE_AT = 2;

export interface ClearStreakConfig {
  /** Consecutive finishes before the first bonus (and "active" payout state). */
  threshold: number;
  /** Flat bonus at the threshold. */
  base: number;
  /** Added to the bonus per finish beyond the threshold. */
  step: number;
  /** Maximum bonus per finish. */
  cap: number;
}

/** The Clear Streak coin bonus for a finish that brings the consecutive-finish
 *  count to `streak`: nothing below the activation threshold, then `base` plus
 *  `step` per finish past the threshold, capped at `cap`. All inputs are floored
 *  and clamped so the result is always a whole, non-negative coin count. Mirrors
 *  the server computation in apply_finish. */
export function computeClearStreakBonus(streak: number, cfg: ClearStreakConfig): number {
  const threshold = Math.max(1, Math.floor(cfg.threshold));
  const n = Math.floor(streak);
  if (n < threshold) return 0;
  const base = Math.max(0, Math.floor(cfg.base));
  const step = Math.max(0, Math.floor(cfg.step));
  const cap = Math.max(0, Math.floor(cfg.cap));
  return Math.min(cap, base + step * (n - threshold));
}

/** Whether a streak counter of `streak` is high enough to show the live flame
 *  indicator (a chain is building). Distinct from paying a bonus, which starts at
 *  the threshold, and from the break warning, which fires at 1. */
export function isClearStreakActive(streak: number): boolean {
  return Math.floor(streak) >= CLEAR_STREAK_ACTIVE_AT;
}

/** Whether adding a game right now would break a live streak — true once the
 *  player has any consecutive finish going (the friction-warning condition). */
export function clearStreakAtRisk(streak: number): boolean {
  return Math.floor(streak) >= 1;
}

/** The smaller "Replay Bonus" paid for finishing a linked edition after the
 *  family's first clear: `pct`% of the game's full bounty, rounded to a whole
 *  coin (never negative). `pct` is clamped to 0–100. */
export function computeReplayBonus(reward: number, pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.max(0, Math.round((Math.max(0, reward) * clamped) / 100));
}

/** Coins for a finish: the full bounty for a first-of-family clear, or the
 *  smaller Replay Bonus when another edition was already finished. */
export function computeFinishReward(isReplay: boolean, reward: number, replayPct: number): number {
  return isReplay ? computeReplayBonus(reward, replayPct) : Math.max(0, Math.round(reward));
}

/** The "Family Discount" activation fee for a Bazaar edition whose family is
 *  already active or cleared (see isFamilyDiscounted): the fee drops by exactly
 *  the ratio the Replay Bonus drops the payout — a re-clear pays `pct`% of the
 *  bounty, so re-entry costs `pct`% of the fee, keeping the cost-to-payout
 *  ratio fair. Same clamping/rounding as computeReplayBonus. */
export function computeFamilyDiscountPrice(price: number, replayPct: number): number {
  const clamped = Math.max(0, Math.min(100, replayPct));
  return Math.max(0, Math.round((Math.max(0, price) * clamped) / 100));
}

/** The "Completion Bonus" paid for completing a game in the Completionist lane:
 *  `pct`% of the game's full bounty, rounded to a whole coin (never negative). `pct`
 *  is clamped to 0–100. Mirrors computeReplayBonus. */
export function computeCompletionBonus(reward: number, pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.max(0, Math.round((Math.max(0, reward) * clamped) / 100));
}

/** Total coins for completing a Completionist game: the base reward (the full bounty
 *  for a first clear, or 0 if it had already been finished and was pulled back) PLUS
 *  the Completion Bonus. `isReplay` is true when the bounty was already paid. */
export function computeCompletionReward(
  isReplay: boolean,
  reward: number,
  completionPct: number,
): number {
  const base = isReplay ? 0 : Math.max(0, Math.round(reward));
  return base + computeCompletionBonus(reward, completionPct);
}

/** Coins refunded when you shelve a game (drop it from Now Playing without
 *  finishing). It's `pct`% of what you paid to buy the game, rounded to a whole
 *  coin (never negative). `pct` is clamped to 0–100. */
export function computeShelveRefund(pricePaid: number, pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.max(0, Math.round((Math.max(0, pricePaid) * clamped) / 100));
}
