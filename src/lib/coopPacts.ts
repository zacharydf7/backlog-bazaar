// Co-op Pacts (issue d57afe4f): two friends bind copies of the same game into a
// shared playthrough. Pure client-side helpers — the pact state itself is
// server-authoritative (co_op_pacts + the definer RPCs); this module only
// decides what to show where. See the Social Phase 3 section of schema.sql.

import type { CoOpPact, Game } from "../types";
import type { EconGame } from "./economy";
import { catalogKey } from "./ownershipMerge";

/** Pact states still in play — everything else is history. */
export function isLivePact(pact: Pick<CoOpPact, "status">): boolean {
  return pact.status === "pending" || pact.status === "active";
}

/** The pact a game's page/card should surface, if any. A pact binds a specific
 *  card once live (myGameId), but a pending INCOMING invite has no bound copy
 *  yet — it matches any of my copies of the identity, so the invite banner
 *  shows wherever the player looks the game up. Live pacts win over ended
 *  ones; among ended ones the newest wins (they linger briefly server-side so
 *  a completion/dissolution doesn't just vanish). */
export function pactForGame(pacts: CoOpPact[], game: Game): CoOpPact | null {
  const key = catalogKey(game);
  const matches = pacts.filter((p) =>
    p.myGameId != null ? p.myGameId === game.id : key != null && p.gameKey === key,
  );
  if (matches.length === 0) return null;
  return (
    matches.find(isLivePact) ??
    matches.reduce((a, b) => (b.createdAt > a.createdAt ? b : a))
  );
}

/** The live pact bound to this exact card, for compact surfaces (the Now
 *  Playing card badge): an actual shared playthrough, or the inviter's copy
 *  waiting in the Co-op lane for the friend to accept (the badge shows which). */
export function activePactForCard(pacts: CoOpPact[], gameId: string): CoOpPact | null {
  return pacts.find((p) => isLivePact(p) && p.myGameId === gameId) ?? null;
}

/** Whether the owner can open the invite flow for this game: a card they own
 *  (not wishlist), carrying a catalog identity to match a partner's copy
 *  against, with no pact already in play for it. */
export function canInviteToPact(pacts: CoOpPact[], game: Game): boolean {
  if (game.status === "wishlist") return false;
  if (catalogKey(game) == null) return false;
  const existing = pactForGame(pacts, game);
  return existing == null || !isLivePact(existing);
}

/** Whether accepting this pact means joining as Player 2: a pending incoming
 *  invite for a game the player holds no owned (non-wishlist) copy of, so the
 *  server auto-adds it to their library at accept — charter waived, standard
 *  activation fee due (covered by the inviter when the pact carries that
 *  offer). A wishlist-only entry still joins this way: it stays a want-list
 *  for a copy of their own, and the Player 2 card is created alongside it. */
export function isPlayer2Join(pact: CoOpPact, games: Game[]): boolean {
  return (
    pact.status === "pending" &&
    !pact.iAmInviter &&
    !games.some((g) => g.status !== "wishlist" && catalogKey(g) === pact.gameKey)
  );
}

/** The pending Player 2 invites (newest first, list_co_op_pacts order): with no
 *  owned card to host the pact banner, these need their own surface — the
 *  Bazaar's invite strip and the join modal. */
export function player2Invites(pacts: CoOpPact[], games: Game[]): CoOpPact[] {
  return pacts.filter((p) => isPlayer2Join(p, games));
}

/** The synthetic game the Player 2 join flow prices: the card exactly as the
 *  server will create it — fresh (full recency, addedAt absent reads as now),
 *  nothing spent, nothing played — from the invite's partner-card preview.
 *  A private partner card leaves hours null; the formula's default length
 *  covers it, matching the add-game price previews. */
export function pactJoinDraft(pact: CoOpPact): EconGame {
  return {
    title: pact.title,
    genres: [],
    hours: pact.partnerGameHours ?? undefined,
    image: pact.partnerGameImage ?? undefined,
  };
}

/** One short line describing the pact's state from the caller's perspective. */
export function pactStatusLine(pact: CoOpPact): string {
  const name = pact.partnerName ?? "Your partner";
  switch (pact.status) {
    case "pending":
      return pact.iAmInviter
        ? `Waiting for ${name} to accept`
        : `${name} wants to finish this together`;
    case "active":
      if (pact.myFinishedAt != null) return `You finished — waiting on ${name}`;
      if (pact.partnerFinishedAt != null) return `${name} finished — your half awaits`;
      return `In a pact with ${name}`;
    case "completed":
      return `You and ${name} both cleared it`;
    case "declined":
      return pact.iAmInviter ? `${name} declined the pact` : "You declined the pact";
    case "dissolved":
      return "The pact was dissolved";
  }
}
