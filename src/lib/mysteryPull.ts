// Mystery Pull: pick a random Bazaar game the player can actually start RIGHT
// NOW, as a cure for choice paralysis. The pull itself is only a chooser — the
// accepted game goes through the standard activation flow (ActivationModal →
// buyGame) at its normal price, so every economy rule (family discount,
// vouchers, overdraft safety) applies unchanged. Pure and rng-injectable so
// eligibility and drawing are unit-tested offline.

import type { Game } from "../types";
import { computeFormula, type EconomyConfig } from "./economy";
import { computeFamilyDiscountPrice } from "./pricing";
import { isFamilyDiscounted } from "./families";
import { canStartGame, canEnterLane } from "./slots";
import { canRedeemVoucher } from "./vouchers";
import { prerequisiteOf } from "./prerequisites";

/** Everything eligibility needs, mirroring what ActivationModal reads. */
export interface PullContext {
  coins: number;
  vouchers: number;
  economy: EconomyConfig;
  replayBonusPct: number;
  generalSlots: number;
  completionistSlots: number;
}

/** The pull-eligible pool and, when it's empty, the single most useful reason
 *  why (for the disabled button's tooltip). Eligible = a Bazaar game that is
 *  not live-service, not story-locked, has an open compatible lane, and is
 *  payable at its normal price (coins, or a voucher — vouchers activate into
 *  Focus only, matching the activation flow). */
export function mysteryPullPool(
  games: Game[],
  ctx: PullContext,
): { pool: Game[]; reason: string | null } {
  // Live-service games are exempt from the buy economy (they enter the
  // Rotation lane for free), so they are never pulled.
  const bazaar = games.filter((g) => g.status === "backlog" && g.ongoing !== true);
  if (bazaar.length === 0) {
    return { pool: [], reason: "No games in your Bazaar to pull from." };
  }

  const unlocked = bazaar.filter((g) => {
    const pre = prerequisiteOf(games, g);
    return pre == null || pre.status === "finished";
  });
  if (unlocked.length === 0) {
    return { pool: [], reason: "Every Bazaar game is story-locked right now." };
  }

  const price = (g: Game) => {
    const full = computeFormula(g, ctx.economy.price);
    return isFamilyDiscounted(games, g)
      ? computeFamilyDiscountPrice(full, ctx.replayBonusPct)
      : full;
  };

  const pool = unlocked.filter((g) => {
    const focusOpen = canStartGame(g, games, ctx.generalSlots);
    const completionistOpen = canEnterLane(g, games, "completionist", ctx.completionistSlots);
    const affords = ctx.coins >= price(g);
    const voucher = canRedeemVoucher(ctx.vouchers, g.status);
    // Vouchers only activate into Focus; coins work for either lane.
    return (focusOpen && (affords || voucher)) || (completionistOpen && affords);
  });
  if (pool.length > 0) return { pool, reason: null };

  // Distinguish "no room" from "no funds" for the tooltip: if ANY unlocked game
  // has an open lane, the blocker must be affordability.
  const anySlot = unlocked.some(
    (g) =>
      canStartGame(g, games, ctx.generalSlots) ||
      canEnterLane(g, games, "completionist", ctx.completionistSlots),
  );
  return {
    pool: [],
    reason: anySlot
      ? "You can't afford any Bazaar game right now."
      : "No open Now Playing slot — finish or shelve something first.",
  };
}

/** The Completion Pull's pool: a random beaten game to pull back for a 100%
 *  run. Eligible = a Finished game that is not live-service and not already
 *  100%'d (any other finish tag — or none — still has completion left), with
 *  room in the Completionist lane. Free, exactly like the Finished card's
 *  "Go for 100%" action (enterCompletionist), so there is no coin gate. */
export function completionPullPool(
  games: Game[],
  completionistSlots: number,
): { pool: Game[]; reason: string | null } {
  const beaten = games.filter(
    (g) => g.status === "finished" && g.ongoing !== true && g.finishTag !== "completed",
  );
  if (beaten.length === 0) {
    return { pool: [], reason: "Nothing on your Finished shelf left to 100%." };
  }
  const pool = beaten.filter((g) =>
    canEnterLane(g, games, "completionist", completionistSlots),
  );
  if (pool.length > 0) return { pool, reason: null };
  return {
    pool: [],
    reason: "Your Completionist lane is full — finish or remove a run first.",
  };
}

/** Draw a random game from the pool, avoiding already-shown ids until the pool
 *  is exhausted (then the cycle restarts). `rng` is injectable for tests. */
export function drawPull(
  pool: Game[],
  seenIds: ReadonlySet<string>,
  rng: () => number = Math.random,
): Game | null {
  if (pool.length === 0) return null;
  const fresh = pool.filter((g) => !seenIds.has(g.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}
