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
