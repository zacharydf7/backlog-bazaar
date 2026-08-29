// Tastemaker Recommendations (issue c48e8f6d) — pure logic for the
// friend-to-friend recommendation flow: a friend recommends a game you don't
// own; importing it tags your copy, activating it pays a discounted start
// cost, and the sender earns a capped percentage of what you actually paid
// (settled server-side in apply_purchase).
//
// Kept free of React/Supabase so it's unit-testable; the store slice does the
// RPC plumbing.

import type { Game } from "../types";
import { catalogKey } from "./ownershipMerge";

/** Defaults for the admin knobs (mirrors the app_config column defaults). */
export const REC_DEFAULTS = {
  discountPct: 20, // % off the start cost of an imported recommendation
  bountyPct: 10, // sender's cut of the price the receiver actually paid
  bountyCap: 25, // coins — the bounty never exceeds this
};

/** Max PENDING recommendations one sender may hold with one friend (issue
 *  spec — a decline or activation frees the slot). Mirrored server-side. */
export const REC_MAX_PENDING_PER_FRIEND = 3;

export type RecommendationStatus = "pending" | "imported" | "activated" | "declined";

export interface GameRecommendation {
  id: string;
  sender: string;
  receiver: string;
  senderName: string | null;
  senderAvatar: string | null;
  receiverName: string | null;
  gameTitle: string;
  gameImage: string | null;
  rawgId: number | null;
  igdbId: number | null;
  catalogId: string | null;
  hours: number | null;
  pitch: string | null;
  status: RecommendationStatus;
  importedGameId: string | null;
  bountyPaid: number | null;
  createdAt: number;
  respondedAt: number | null;
  activatedAt: number | null;
}

const STATUSES: RecommendationStatus[] = ["pending", "imported", "activated", "declined"];

/** Coerce a list_game_recommendations row; null for anything malformed. */
export function coerceRecommendation(row: Record<string, unknown>): GameRecommendation | null {
  if (typeof row.id !== "string" || typeof row.sender !== "string") return null;
  if (typeof row.receiver !== "string" || typeof row.game_title !== "string") return null;
  if (!STATUSES.includes(row.status as RecommendationStatus)) return null;
  const ts = (v: unknown): number | null =>
    typeof v === "string" ? Date.parse(v) : null;
  return {
    id: row.id,
    sender: row.sender,
    receiver: row.receiver,
    senderName: typeof row.sender_name === "string" ? row.sender_name : null,
    senderAvatar: typeof row.sender_avatar === "string" ? row.sender_avatar : null,
    receiverName: typeof row.receiver_name === "string" ? row.receiver_name : null,
    gameTitle: row.game_title,
    gameImage: typeof row.game_image === "string" ? row.game_image : null,
    rawgId: typeof row.rawg_id === "number" ? row.rawg_id : null,
    igdbId: typeof row.igdb_id === "number" ? row.igdb_id : null,
    catalogId: typeof row.catalog_id === "string" ? row.catalog_id : null,
    hours: typeof row.hours === "number" ? row.hours : null,
    pitch: typeof row.pitch === "string" && row.pitch.trim() ? row.pitch : null,
    status: row.status as RecommendationStatus,
    importedGameId: typeof row.imported_game_id === "string" ? row.imported_game_id : null,
    bountyPaid: typeof row.bounty_paid === "number" ? row.bounty_paid : null,
    createdAt: ts(row.created_at) ?? 0,
    respondedAt: ts(row.responded_at),
    activatedAt: ts(row.activated_at),
  };
}

/** One row of the friend picker (game_rec_recipient_options). */
export interface RecRecipientOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  ownsGame: boolean;
  pendingCount: number;
}

export function coerceRecipientOption(row: Record<string, unknown>): RecRecipientOption | null {
  if (typeof row.id !== "string" || typeof row.display_name !== "string") return null;
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    ownsGame: Boolean(row.owns_game),
    pendingCount: typeof row.pending_count === "number" ? row.pending_count : 0,
  };
}

/** Why a friend can't receive this recommendation right now, or null if they
 *  can (drives the picker rows' disabled state + hint). */
export function recipientBlockReason(opt: RecRecipientOption): string | null {
  if (opt.ownsGame) return "Already has this game";
  if (opt.pendingCount >= REC_MAX_PENDING_PER_FRIEND)
    return `Already has ${REC_MAX_PENDING_PER_FRIEND} recommendations from you`;
  return null;
}

/** Incoming cards for the Recommendations inbox: my PENDING recs only. An
 *  imported one leaves the inbox — its home is the tagged card on the boards
 *  (declining it there would silently forfeit the discount). */
export function incomingRecommendations(
  recs: GameRecommendation[],
  userId: string | null,
): GameRecommendation[] {
  if (!userId) return [];
  return recs.filter((r) => r.receiver === userId && r.status === "pending");
}

/** My sent recommendations (any status), newest first as listed. */
export function sentRecommendations(
  recs: GameRecommendation[],
  userId: string | null,
): GameRecommendation[] {
  if (!userId) return [];
  return recs.filter((r) => r.sender === userId);
}

/** The live (pending/imported) recommendation that covers one of MY library
 *  rows — the receiver-side match that drives the card tag and the activation
 *  discount. Explicit import link first; shared catalog identity otherwise
 *  (crosswalk-aware via catalogKey). Oldest first, matching the server. */
export function recommendationForGame(
  recs: GameRecommendation[],
  userId: string | null,
  game: Pick<Game, "id" | "rawgId" | "igdbId" | "catalogId">,
): GameRecommendation | null {
  if (!userId) return null;
  const key = catalogKey(game);
  const live = recs
    .filter((r) => r.receiver === userId && (r.status === "pending" || r.status === "imported"))
    .filter(
      (r) =>
        r.importedGameId === game.id ||
        (key != null &&
          catalogKey({
            rawgId: r.rawgId ?? undefined,
            igdbId: r.igdbId ?? undefined,
            catalogId: r.catalogId ?? undefined,
          }) === key),
    );
  return live.sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

/** The discounted start cost for a recommended game. Mirrors the server's
 *  ledger conventions: whole coins, never negative. */
export function recDiscountedPrice(base: number, discountPct: number): number {
  const pct = Math.min(90, Math.max(0, discountPct));
  return Math.max(0, Math.round(base * (100 - pct) / 100));
}

/** The sender's Tastemaker Bounty for a paid price — mirrors apply_purchase:
 *  ceil of the percentage, capped, and zero when nothing was paid. */
export function recBounty(paidPrice: number, bountyPct: number, bountyCap: number): number {
  if (paidPrice <= 0) return 0;
  return Math.max(0, Math.min(bountyCap, Math.ceil((paidPrice * bountyPct) / 100)));
}

/** Build the AddGameModal initialPick meta from a recommendation card, so the
 *  import flows through the normal add pipeline (routing, catalog overlay,
 *  copies) with the game pre-picked. */
export function recommendationToAddMeta(rec: GameRecommendation) {
  return {
    title: rec.gameTitle,
    image: rec.gameImage ?? undefined,
    rawgId: rec.rawgId ?? undefined,
    igdbId: rec.igdbId ?? undefined,
    catalogId: rec.catalogId ?? undefined,
    hours: rec.hours ?? undefined,
    genres: [] as string[],
  };
}

/** Human label for a sent card's status chip. */
export function recStatusLabel(rec: GameRecommendation): string {
  switch (rec.status) {
    case "pending":
      return "Waiting";
    case "imported":
      return "Added to their shelves";
    case "activated":
      return rec.bountyPaid && rec.bountyPaid > 0
        ? `Playing it — earned you ${rec.bountyPaid} coins`
        : "Playing it";
    case "declined":
      return "Declined";
  }
}
