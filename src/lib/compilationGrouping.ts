// Pure logic for the collapsed-compilation board view: folding a bundle's child
// cards into one synthetic rollup "parent card", deriving which board that card
// sits on (the lane of its least-completed child), and matching an owned single
// game card to the moderator-linked template that can expand it. The collapsed
// parent is a VIEW-LAYER construct — never a games row — so it can't receive
// playtime, fire status triggers, or touch the economy by construction. Kept
// free of React/Supabase so it's directly unit-tested.

import type { Compilation, Game, GameStatus } from "../types";
import type { ParentTemplate } from "./compilationTemplates";

/** A collapsed compilation, ready to render as one rollup card. */
export interface CollapsedCompilation {
  compilation: Compilation;
  children: Game[];
  /** The board the rollup card sits on: Finished only once EVERY child is
   *  finished, otherwise the Bazaar (the least-completed child's lane). */
  board: Extract<GameStatus, "backlog" | "finished">;
  /** Aggregate play time: every child's hours plus the bundle's carryover
   *  (time logged on the single parent card before it was expanded). */
  totalPlayedHours: number;
  finishedCount: number;
  /** Cover art: the original parent card's cover when the bundle was expanded
   *  from one, else the first child's. */
  image?: string;
}

/** The board a collapsed bundle belongs on — the lane of its least-completed
 *  child. Any non-finished child (backlog, playing, wishlist) keeps the card in
 *  the Bazaar; it reaches Finished only when every child is done. */
export function deriveCompilationBoard(children: Game[]): "backlog" | "finished" {
  if (children.length === 0) return "backlog";
  return children.every((g) => g.status === "finished") ? "finished" : "backlog";
}

/** Build the rollup for one compilation's children. */
export function compilationRollup(
  compilation: Compilation,
  children: Game[],
): CollapsedCompilation {
  const played = children.reduce((sum, g) => sum + (g.playedHours ?? 0), 0);
  return {
    compilation,
    children,
    board: deriveCompilationBoard(children),
    totalPlayedHours: played + (compilation.carryoverHours ?? 0),
    finishedCount: children.filter((g) => g.status === "finished").length,
    image: compilation.parentImage ?? children.find((g) => g.image)?.image,
  };
}

/** Split a board's games into the individually-rendered cards and the collapsed
 *  compilation rollups. Children of a compilation with `expanded === false` are
 *  removed from `boardGames` and returned as one CollapsedCompilation instead.
 *
 *  Safety valve: a bundle with a child in Now Playing is ALWAYS treated as
 *  expanded (a card holding a slot must never vanish from its lane), matching
 *  the server-side collapse guard. Bundles with no children are skipped. */
export function groupCollapsedCompilations(
  games: Game[],
  compilations: Compilation[],
): { boardGames: Game[]; collapsed: CollapsedCompilation[] } {
  const collapsedById = new Map<string, Compilation>();
  for (const c of compilations) {
    if (c.expanded === false) collapsedById.set(c.id, c);
  }
  if (collapsedById.size === 0) return { boardGames: games, collapsed: [] };

  const childrenByComp = new Map<string, Game[]>();
  for (const g of games) {
    if (g.compilationId != null && collapsedById.has(g.compilationId)) {
      const list = childrenByComp.get(g.compilationId);
      if (list) list.push(g);
      else childrenByComp.set(g.compilationId, [g]);
    }
  }

  const hidden = new Set<string>();
  const collapsed: CollapsedCompilation[] = [];
  for (const [compId, children] of childrenByComp) {
    if (children.some((g) => g.status === "playing")) continue; // safety valve
    for (const g of children) hidden.add(g.id);
    collapsed.push(compilationRollup(collapsedById.get(compId)!, children));
  }
  if (hidden.size === 0) return { boardGames: games, collapsed: [] };
  return {
    boardGames: games.filter((g) => !hidden.has(g.id)),
    collapsed,
  };
}

/** The moderator-linked template that can expand this owned single card into a
 *  compilation, or null. Matches by catalog identity — catalogId first, then
 *  rawgId — and never offers expansion for wishlist rows (not owned yet) or
 *  rows already inside a compilation. */
export function findExpandTemplate(
  game: Pick<Game, "rawgId" | "catalogId" | "status" | "compilationId">,
  templates: ParentTemplate[],
): ParentTemplate | null {
  if (game.status === "wishlist" || game.compilationId != null) return null;
  if (game.catalogId) {
    const byCatalog = templates.find((t) => t.parentCatalogId === game.catalogId);
    if (byCatalog) return byCatalog;
  }
  if (game.rawgId != null) {
    const byRawg = templates.find((t) => t.parentRawgId != null && t.parentRawgId === game.rawgId);
    if (byRawg) return byRawg;
  }
  return null;
}
