// Co-op Pacts (issue d57afe4f): two friends bind copies of the same game into a
// shared playthrough. Pure client-side helpers — the pact state itself is
// server-authoritative (co_op_pacts + the definer RPCs); this module only
// decides what to show where. See the Social Phase 3 section of schema.sql.

import type { CoOpPact, Game } from "../types";
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
 *  Playing card badge) that only decorate an actual shared playthrough. */
export function activePactForCard(pacts: CoOpPact[], gameId: string): CoOpPact | null {
  return pacts.find((p) => p.status === "active" && p.myGameId === gameId) ?? null;
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
