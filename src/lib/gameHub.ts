// The unified Game Details Hub: the game page is one page per TITLE, not per
// instance. Whichever variant's card you click, the page gathers every
// connected record — all instances sharing the catalog identity, plus every
// family-linked edition of any of those (a Family Link can bind DIFFERENT
// catalog games, e.g. a remaster, and that member's own catalog twins join
// too) — and renders one universal header, one Community feed, and a Library
// tab that manages every copy. Historical data (playtime, milestones, reviews)
// stays strictly on the record that earned it (zero migration), so the Journey
// and Review tabs pick which record to show through an edition selector.
// Pure helpers; unit-tested offline.

import type { Game } from "../types";
import { catalogKey } from "./ownershipMerge";
import { familyPrimary, familyName, representativeMember } from "./families";
import { ownedPlatformSummary } from "./copies";

/** Every instance connected to `game`, in collection order: records sharing
 *  its catalog identity, plus family-linked editions, closed transitively
 *  (absorbing a member absorbs its catalog twins and its family). A hand-typed
 *  custom game has no catalog identity, so only family links can connect it. */
export function hubMembers(games: Game[], game: Game): Game[] {
  const inHub = new Set<string>([game.id]);
  const keys = new Set<string>(); // catalog identities absorbed so far
  const fams = new Set<string>(); // family ids absorbed so far
  const k = catalogKey(game);
  if (k) keys.add(k);
  if (game.familyId != null) fams.add(game.familyId);

  // Fixpoint: each absorbed member can introduce a new identity or family.
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of games) {
      if (inHub.has(g.id)) continue;
      const gk = catalogKey(g);
      const byKey = gk != null && keys.has(gk);
      const byFam = g.familyId != null && fams.has(g.familyId);
      if (!byKey && !byFam) continue;
      inHub.add(g.id);
      if (gk) keys.add(gk);
      if (g.familyId != null) fams.add(g.familyId);
      grew = true;
    }
  }
  return games.filter((g) => inHub.has(g.id));
}

/** The instance whose record fronts the hub's universal header (cover art,
 *  like) — deterministic, so every entry point shows the same face: the
 *  best-placed member's family primary when it's linked, else the best-placed
 *  member itself (Now Playing > Bazaar > Wishlist > Finished). */
export function hubRepresentative(members: Game[]): Game {
  const rep = representativeMember(members);
  if (rep.familyId == null) return rep;
  return familyPrimary(members.filter((m) => m.familyId === rep.familyId));
}

/** The hub's global title: the representative's family name when it's linked
 *  (which itself falls back to the primary's title), else its own title. */
export function hubTitle(members: Game[]): string {
  const rep = hubRepresentative(members);
  if (rep.familyId != null) {
    return familyName(members.filter((m) => m.familyId === rep.familyId));
  }
  return rep.title;
}

/** One entry of the Journey/Review edition selector: a plain instance, or a
 *  whole Game Family folded into one entry whose data lives on the PRIMARY
 *  member (`game` is the record the tabs render for the entry). */
export type HubEdition =
  | { kind: "family"; key: string; familyId: string; members: Game[]; game: Game }
  | { kind: "game"; key: string; game: Game };

/** The selector entries for a hub, in collection order: family-linked members
 *  collapse into one "Family" entry (fronted by the primary — new data routes
 *  there; the Journey interleaves every member's milestones); every other
 *  instance stands alone. */
export function hubEditions(members: Game[]): HubEdition[] {
  const seenFams = new Set<string>();
  const out: HubEdition[] = [];
  for (const m of members) {
    if (m.familyId != null) {
      if (seenFams.has(m.familyId)) continue;
      seenFams.add(m.familyId);
      const fam = members.filter((g) => g.familyId === m.familyId);
      if (fam.length > 1) {
        out.push({
          kind: "family",
          key: "f:" + m.familyId,
          familyId: m.familyId,
          members: fam,
          game: familyPrimary(fam),
        });
        continue;
      }
    }
    out.push({ kind: "game", key: "g:" + m.id, game: m });
  }
  return out;
}

/** The selector key of the entry containing `gameId` — how the page preselects
 *  the edition whose card was clicked (a family member selects its family's
 *  entry). Falls back to the first entry. */
export function editionKeyOf(editions: HubEdition[], gameId: string): string {
  for (const e of editions) {
    const hit = e.kind === "family" ? e.members.some((m) => m.id === gameId) : e.game.id === gameId;
    if (hit) return e.key;
  }
  return editions[0]?.key ?? "";
}

/** A selector entry's human label. Same-title instances read by platform
 *  ("PlayStation 4"); a member whose title differs from the hub's (a linked
 *  remaster) leads with its own title; a family entry wears the family name. */
export function editionLabel(edition: HubEdition, hubTitle_: string): string {
  if (edition.kind === "family") {
    return `${familyName(edition.members)} — Family (${edition.members.length} editions)`;
  }
  const g = edition.game;
  const platforms = ownedPlatformSummary(g.copies ?? [])
    .map((o) => o.platform)
    .join(", ");
  if (g.title !== hubTitle_) return platforms ? `${g.title} (${platforms})` : g.title;
  return platforms || g.title;
}
