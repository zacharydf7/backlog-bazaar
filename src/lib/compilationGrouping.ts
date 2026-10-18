// Pure logic for the compilation board view: folding a bundle's child games into
// synthetic "bundle cards" — one on every board where the bundle has a child
// (issue 86fc0b4b: a bundle can sit in the Bazaar and Finished at once) — and
// matching an owned single game card to the moderator-linked template that can
// expand it. Playing children keep their own cards on Now Playing, since each
// one holds a lane slot. A bundle card is a VIEW-LAYER construct — never a games
// row — so it can't receive playtime, fire status triggers, or touch the economy
// by construction. Kept free of React/Supabase so it's directly unit-tested.

import type { Compilation, Game, GameStatus } from "../types";
import type { ParentTemplate } from "./compilationTemplates";
import { gameMatches, type Filters } from "./bazaarView";
import { gameMatchesQuery, textMatchesQuery, type DlcNames } from "./librarySearch";
import { sortByRelevance } from "./gameSearch";
import { compilationCopiesOf } from "./compilations";
import { gamePriorityRank } from "./gamePriority";

/** The boards a bundle card can sit on. Now Playing isn't one: a playing child
 *  holds a lane slot, so it keeps its own (bundle-framed) card there. */
export type BundleBoard = Exclude<GameStatus, "playing">;
const BUNDLE_BOARDS: BundleBoard[] = ["backlog", "finished", "wishlist"];

/** One bundle card: a compilation as it shows on one board. */
export interface CollapsedCompilation {
  compilation: Compilation;
  /** Every child, in the owner's chosen order. */
  children: Game[];
  /** The board this card sits on. */
  board: BundleBoard;
  /** The children on this card's board, in the same order. The tray lists
   *  them, and the board's slicers and sort read only these. */
  boardChildren: Game[];
  /** Aggregate play time: every child's hours plus the bundle's carryover
   *  (time logged on the single parent card before it was expanded). */
  totalPlayedHours: number;
  finishedCount: number;
  playingCount: number;
  /** Cover art: the original parent card's cover when the bundle was expanded
   *  from one, else the first child's. */
  image?: string;
}

/** Order a bundle's child games by the owner's chosen order (issue 140ac868):
 *  those listed in `childOrder` first, in that order, then any not listed (new
 *  children, or a legacy bundle with no saved order) in their incoming order.
 *  With no order set, the input order is preserved. Pure; non-mutating. */
export function orderCompilationChildren<T extends Pick<Game, "id">>(
  children: T[],
  childOrder: string[] | undefined,
): T[] {
  if (!childOrder || childOrder.length === 0) return [...children];
  const rank = new Map(childOrder.map((id, i) => [id, i]));
  // Stable: keep the original index as the tiebreak so unlisted children hold
  // their relative order after the listed ones (rank = Infinity).
  return children
    .map((c, i) => ({ c, i, r: rank.get(c.id) ?? Infinity }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}

/** The cover the bundle card shows: the compilation's own game row's (issue
 *  86fc0b4b) when it has one, else the owner's custom/expand-time parent cover,
 *  else the moderator-set cover on the shared template, else the first child's
 *  (in the bundle's chosen order — pass children already ordered so every
 *  surface previewing this fallback agrees with the card). */
export function compilationCoverOf(
  compilation: Pick<Compilation, "parentImage" | "templateImage">,
  children: Pick<Game, "image">[],
  compilationGame?: Pick<Game, "image">,
): string | undefined {
  return (
    compilationGame?.image ??
    compilation.parentImage ??
    compilation.templateImage ??
    children.find((g) => g.image)?.image
  );
}

/** The compilation's own game row (issue 86fc0b4b), when it's loaded. */
export function compilationGameOf(compilationId: string, compilationGames: Game[]): Game | undefined {
  return compilationGames.find((g) => g.compilationGameFor === compilationId);
}

/** The cover a bundled game shows (issue 86fc0b4b): its own art when it has
 *  some, else its bundle's cover — a bundled game inherits from its bundle. A
 *  game outside a compilation (or whose compilation isn't loaded, as on a
 *  visited library) keeps just its own art. */
export function inheritedCover(
  game: Pick<Game, "image" | "compilationId">,
  compilations: Compilation[],
  games: Game[],
  compilationGames: Game[] = [],
): string | undefined {
  if (game.image) return game.image;
  const compilation = compilations.find((c) => c.id === game.compilationId);
  if (!compilation) return undefined;
  const siblings = games.filter((g) => g.compilationId === compilation.id);
  return compilationCoverOf(
    compilation,
    orderCompilationChildren(siblings, compilation.childOrder),
    compilationGameOf(compilation.id, compilationGames),
  );
}

/** Build one board's bundle card, with every child in the owner's chosen order
 *  (so the card, its cover fallback, and any preview all agree). */
export function compilationRollup(
  compilation: Compilation,
  children: Game[],
  board: BundleBoard,
  compilationGame?: Pick<Game, "image">,
): CollapsedCompilation {
  const ordered = orderCompilationChildren(children, compilation.childOrder);
  const played = ordered.reduce((sum, g) => sum + (g.playedHours ?? 0), 0);
  return {
    compilation,
    children: ordered,
    board,
    boardChildren: ordered.filter((g) => g.status === board),
    totalPlayedHours: played + (compilation.carryoverHours ?? 0),
    finishedCount: ordered.filter((g) => g.status === "finished").length,
    playingCount: ordered.filter((g) => g.status === "playing").length,
    image: compilationCoverOf(compilation, ordered, compilationGame),
  };
}

/** Split the games into the individually-rendered cards and the bundle cards.
 *  Every compilation's non-playing children leave `boardGames` and come back as
 *  one bundle card per board they sit on; playing children stay in
 *  `boardGames` for Now Playing. Children of a compilation missing from
 *  `compilations` (a visited library) pass through untouched. */
export function groupCollapsedCompilations(
  games: Game[],
  compilations: Compilation[],
  compilationGames: Game[] = [],
): { boardGames: Game[]; collapsed: CollapsedCompilation[] } {
  if (compilations.length === 0) return { boardGames: games, collapsed: [] };
  const byId = new Map(compilations.map((c) => [c.id, c]));

  const childrenByComp = new Map<string, Game[]>();
  for (const g of games) {
    if (g.compilationId != null && byId.has(g.compilationId)) {
      const list = childrenByComp.get(g.compilationId);
      if (list) list.push(g);
      else childrenByComp.set(g.compilationId, [g]);
    }
  }

  const hidden = new Set<string>();
  const collapsed: CollapsedCompilation[] = [];
  for (const [compId, children] of childrenByComp) {
    for (const board of BUNDLE_BOARDS) {
      if (children.some((g) => g.status === board)) {
        collapsed.push(
          compilationRollup(
            byId.get(compId)!,
            children,
            board,
            compilationGameOf(compId, compilationGames),
          ),
        );
      }
    }
    for (const g of children) if (g.status !== "playing") hidden.add(g.id);
  }
  if (hidden.size === 0) return { boardGames: games, collapsed };
  return {
    boardGames: games.filter((g) => !hidden.has(g.id)),
    collapsed,
  };
}

/** The library as COLLECTION entries (issue 86fc0b4b): every compilation's
 *  games fold into one entry — you own the Kingdom Hearts collection, one item
 *  on the shelf — while standalone games pass through. For ownership stats
 *  only (owned counts, the platform bars, the ledger's collection block);
 *  clears, hours and coins keep counting each game, since each is a real
 *  playthrough. Keys off `compilationId` alone, so a visited library folds too.
 *
 *  The entry is the bundle's first game in library order, standing in with:
 *  a derived status (Now Playing if any game is, else Bazaar if any waits,
 *  else Finished, else Wishlist), every game's copies (so it lands on each
 *  platform the bundle is owned on), and, when finished, a derived finish tag
 *  (Completed or Endless only if every clear was, Retired if nothing was
 *  cleared, else Beaten). */
export function ownershipUnits(games: Game[]): Game[] {
  const byComp = new Map<string, Game[]>();
  const out: Game[] = [];
  for (const g of games) {
    if (g.compilationId == null) {
      out.push(g);
      continue;
    }
    const list = byComp.get(g.compilationId);
    if (list) list.push(g);
    else {
      const fresh = [g];
      byComp.set(g.compilationId, fresh);
      out.push(g); // placeholder, replaced below, keeps library order
    }
  }
  if (byComp.size === 0) return games;
  return out.map((g) => {
    const members = g.compilationId != null ? byComp.get(g.compilationId) : undefined;
    return members ? foldBundle(members) : g;
  });
}

const STATUS_PRECEDENCE: GameStatus[] = ["playing", "backlog", "finished", "wishlist"];

/** The status a compilation shows, from its games (issue 86fc0b4b): when they
 *  all share one, that one — all in the Bazaar is in the Bazaar, all finished
 *  is finished (the requester's rule). Mixed: Now Playing while any game is
 *  being played, otherwise in the Bazaar until every game is finished. An
 *  empty compilation is in the Bazaar. The compilation's own stored status
 *  never changes; this is what boards, stats and its page show. */
export function compilationStatus(games: Pick<Game, "status">[]): GameStatus {
  return STATUS_PRECEDENCE.find((s) => games.some((g) => g.status === s)) ?? "backlog";
}

function foldBundle(members: Game[]): Game {
  const status = compilationStatus(members);
  const clears = members.filter((m) => m.status === "finished" && m.finishTag !== "retired");
  const allTagged = (tag: Game["finishTag"]) =>
    clears.length > 0 && clears.every((m) => m.finishTag === tag);
  const finishTag =
    status !== "finished"
      ? undefined
      : clears.length === 0
        ? ("retired" as const)
        : allTagged("completed")
          ? ("completed" as const)
          : allTagged("endless")
            ? ("endless" as const)
            : ("beaten" as const);
  return {
    ...members[0],
    id: `bundle:${members[0].compilationId}`,
    status,
    finishTag,
    copies: members.flatMap((m) => m.copies ?? []),
  };
}

/** How many games a bundle card's tray lists before "+N more". */
export const TRAY_LIMIT = 3;

/** The games a bundle card's tray lists: in the Bazaar, the highest-priority
 *  games first (ties keep the bundle order); elsewhere, the bundle order. */
export function compilationTray(c: CollapsedCompilation): { shown: Game[]; more: number } {
  const list =
    c.board === "backlog"
      ? [...c.boardChildren].sort(
          (a, b) => gamePriorityRank(b.priority) - gamePriorityRank(a.priority),
        )
      : c.boardChildren;
  return { shown: list.slice(0, TRAY_LIMIT), more: Math.max(0, list.length - TRAY_LIMIT) };
}

/** The bundle card's status pill, phrased for its board. */
export function compilationSummary(c: CollapsedCompilation): string {
  const total = c.children.length;
  const games = `${total} game${total === 1 ? "" : "s"}`;
  switch (c.board) {
    case "finished":
      return `Compilation · ${c.finishedCount} of ${total} finished`;
    case "wishlist":
      return `Compilation · ${games} · ${c.boardChildren.length} on Wishlist`;
    default:
      return `Compilation · ${games} · ${c.boardChildren.length} in Bazaar`;
  }
}

/** A bundle card passes the board slicers when ANY of its children on that
 *  board passes — the same rule as family cards: hiding the card because one
 *  child fails a filter would hide children that pass. A finished child's
 *  length or priority says nothing about the Bazaar card, so it isn't asked. */
export function compilationMatchesFilters(c: CollapsedCompilation, filters: Filters): boolean {
  return c.boardChildren.some((g) => gameMatches(g, filters));
}

/** The live search surfaces the card by the bundle's own title or any of its
 *  children on that board (searching "Pikmin 2" finds the Pikmin 1+2 bundle on
 *  whichever board Pikmin 2 sits). */
export function compilationMatchesQuery(c: CollapsedCompilation, query: string, dlcNames?: DlcNames): boolean {
  if (!query.trim()) return true;
  if (c.compilation.title.toLowerCase().includes(query.trim().toLowerCase())) return true;
  return c.boardChildren.some((g) => gameMatchesQuery(g, query, dlcNames));
}

/** One result of the library search overlay: a game of its own, or a whole
 *  compilation, which stands in for the games inside it (issue 86fc0b4b). */
export type LibrarySearchEntry =
  | { kind: "game"; game: Game }
  | {
      kind: "compilation";
      compilation: Compilation;
      children: Game[];
      image: string | undefined;
      status: GameStatus;
      /** The games inside that matched, when the compilation's own title and
       *  platforms didn't — what the result row names so the hit makes sense. */
      includes: string[];
    };

/** Search a library for the overlay (issue 86fc0b4b): only standalone games
 *  and compilations come back — a game inside a compilation is found through
 *  its compilation, which matches on its own title and platforms or on any game
 *  inside (searching "Sunshine" finds Super Mario 3D All-Stars). Games of a
 *  compilation that isn't loaded (a visited library) stay searchable on their
 *  own, as they show on its boards. Ordered by title relevance. */
export function searchLibraryEntries(
  games: Game[],
  compilations: Compilation[],
  compilationGames: Game[],
  query: string,
  dlcNames?: DlcNames,
): LibrarySearchEntry[] {
  if (!query.trim()) return [];
  const byId = new Map(compilations.map((c) => [c.id, c]));
  const childrenByComp = new Map<string, Game[]>();
  const found: { title: string; entry: LibrarySearchEntry }[] = [];
  for (const g of games) {
    if (g.compilationId != null && byId.has(g.compilationId)) {
      const list = childrenByComp.get(g.compilationId);
      if (list) list.push(g);
      else childrenByComp.set(g.compilationId, [g]);
    } else if (gameMatchesQuery(g, query, dlcNames)) {
      found.push({ title: g.title, entry: { kind: "game", game: g } });
    }
  }
  for (const [compId, list] of childrenByComp) {
    const compilation = byId.get(compId)!;
    const children = orderCompilationChildren(list, compilation.childOrder);
    const ownText = [compilation.title, ...compilationCopiesOf(compilation).map((c) => c.platform)];
    const ownMatch = textMatchesQuery(ownText.join(" "), query);
    // A child's searchable text names its compilation, so leave that out here:
    // it's the child's own title and platforms that earn an "includes" line.
    const includes = ownMatch
      ? []
      : children.filter((g) => gameMatchesQuery({ ...g, compilationName: undefined }, query, dlcNames));
    if (!ownMatch && includes.length === 0) continue;
    found.push({
      title: compilation.title,
      entry: {
        kind: "compilation",
        compilation,
        children,
        image: compilationCoverOf(compilation, children, compilationGameOf(compId, compilationGames)),
        status: compilationStatus(children),
        includes: includes.map((g) => g.title),
      },
    });
  }
  return sortByRelevance(found, query).map((f) => f.entry);
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

/** Split loaded library rows into the playable games and the compilations' own
 *  game rows (issue 86fc0b4b). A compilation game is never played itself, so it
 *  is kept out of the games list every board, lane, picker and stat reads, and
 *  only the places that show a compilation as a game look it up. */
export function splitCompilationGames(rows: Game[]): { games: Game[]; compilationGames: Game[] } {
  const games: Game[] = [];
  const compilationGames: Game[] = [];
  for (const g of rows) (g.compilationGameFor ? compilationGames : games).push(g);
  return { games, compilationGames };
}
