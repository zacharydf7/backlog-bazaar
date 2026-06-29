import { describe, it, expect } from "vitest";
import {
  catalogKey,
  foldedCompilationCopies,
  dedupeOwnership,
  dedupeCompilationBadges,
} from "./ownershipMerge";
import type { Game } from "../types";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g" + Math.random().toString(36).slice(2, 7),
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

describe("catalogKey", () => {
  it("prefers rawgId, falls back to catalogId, else null", () => {
    expect(catalogKey({ rawgId: 42, catalogId: "abc" })).toBe("r:42");
    expect(catalogKey({ rawgId: undefined, catalogId: "abc" })).toBe("c:abc");
    expect(catalogKey({ rawgId: undefined, catalogId: undefined })).toBeNull();
  });

  it("never collides a rawg id with a catalog id of the same text", () => {
    expect(catalogKey({ rawgId: 7 })).not.toBe(catalogKey({ catalogId: "7" }));
  });
});

describe("foldedCompilationCopies", () => {
  it("returns the compilation copies that share a standalone master's catalog id", () => {
    const master = game({ id: "m", rawgId: 1, compilationId: null });
    const child = game({ id: "c", rawgId: 1, compilationId: "comp1" });
    const other = game({ id: "o", rawgId: 2, compilationId: "comp1" });
    expect(foldedCompilationCopies([master, child, other], master)).toEqual([child]);
  });

  it("matches community games on catalogId", () => {
    const master = game({ id: "m", catalogId: "alwa", compilationId: null });
    const child = game({ id: "c", catalogId: "alwa", compilationId: "comp1" });
    expect(foldedCompilationCopies([master, child], master)).toEqual([child]);
  });

  it("folds sibling copies into the furthest-along compilation copy when no standalone exists", () => {
    // Same game in two bundles, no standalone: the master copy absorbs the other.
    const a = game({ id: "a", rawgId: 1, compilationId: "comp1", status: "playing" });
    const b = game({ id: "b", rawgId: 1, compilationId: "comp2", status: "backlog" });
    // `a` is furthest-along → it's the master and folds `b`.
    expect(foldedCompilationCopies([a, b], a)).toEqual([b]);
    // `b` is not the master → it folds away (nothing to absorb).
    expect(foldedCompilationCopies([a, b], b)).toEqual([]);
  });

  it("a standalone still wins over compilation copies (copies fold into it)", () => {
    const solo = game({ id: "s", rawgId: 1, compilationId: null });
    const a = game({ id: "a", rawgId: 1, compilationId: "comp1" });
    const b = game({ id: "b", rawgId: 1, compilationId: "comp2" });
    expect(foldedCompilationCopies([solo, a, b], solo)).toEqual([a, b]);
    // Asked about a copy while a standalone exists → it folds into the standalone.
    expect(foldedCompilationCopies([solo, a, b], a)).toEqual([]);
  });

  it("returns nothing for a master with no catalog identity (hand-typed custom)", () => {
    const master = game({ id: "m", rawgId: undefined, catalogId: undefined, compilationId: null });
    const child = game({ id: "c", rawgId: undefined, catalogId: undefined, compilationId: "comp1" });
    expect(foldedCompilationCopies([master, child], master)).toEqual([]);
  });
});

describe("dedupeCompilationBadges", () => {
  it("collapses the same-named collection owned on two platforms to one badge", () => {
    // Two separate Compilation records (one per platform) with the same title.
    const switchCopy = game({ id: "s", compilationId: "comp-switch", compilationName: "Alwa's Collection" });
    const ps4Copy = game({ id: "p", compilationId: "comp-ps4", compilationName: "Alwa's Collection" });
    expect(dedupeCompilationBadges([switchCopy, ps4Copy]).map((g) => g.id)).toEqual(["s"]);
  });

  it("keeps a badge per genuinely different bundle", () => {
    const a = game({ id: "a", compilationId: "c1", compilationName: "Alwa's Collection" });
    const b = game({ id: "b", compilationId: "c2", compilationName: "Indie Bundle" });
    expect(dedupeCompilationBadges([a, b]).map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("matches names case- and whitespace-insensitively", () => {
    const a = game({ id: "a", compilationName: "Alwa's Collection" });
    const b = game({ id: "b", compilationName: "  alwa's collection " });
    expect(dedupeCompilationBadges([a, b]).map((g) => g.id)).toEqual(["a"]);
  });

  it("falls back to compilationId so unnamed bundles do not wrongly merge", () => {
    const a = game({ id: "a", compilationId: "c1", compilationName: undefined });
    const b = game({ id: "b", compilationId: "c2", compilationName: undefined });
    expect(dedupeCompilationBadges([a, b]).map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("preserves first-seen order", () => {
    const a = game({ id: "a", compilationName: "Zed Pack" });
    const b = game({ id: "b", compilationName: "Alpha Set" });
    const c = game({ id: "c", compilationName: "Zed Pack" });
    expect(dedupeCompilationBadges([a, b, c]).map((g) => g.id)).toEqual(["a", "b"]);
  });
});

describe("dedupeOwnership", () => {
  it("hides a compilation copy when a standalone master of the same game exists", () => {
    const master = game({ id: "m", rawgId: 1, compilationId: null });
    const child = game({ id: "c", rawgId: 1, compilationId: "comp1" });
    expect(dedupeOwnership([master, child]).map((g) => g.id)).toEqual(["m"]);
  });

  it("keeps a compilation copy that has no standalone counterpart", () => {
    const child = game({ id: "c", rawgId: 1, compilationId: "comp1" });
    const unrelated = game({ id: "u", rawgId: 2, compilationId: null });
    expect(dedupeOwnership([child, unrelated]).map((g) => g.id)).toEqual(["c", "u"]);
  });

  it("preserves order and leaves standalone records untouched", () => {
    const a = game({ id: "a", rawgId: 1, compilationId: null });
    const b = game({ id: "b", rawgId: 1, compilationId: "comp1" }); // folds into a
    const c = game({ id: "c", rawgId: 3, compilationId: null });
    expect(dedupeOwnership([a, b, c]).map((g) => g.id)).toEqual(["a", "c"]);
  });

  it("merges two compilation copies of the same game (no standalone) into one card", () => {
    // Two bundles each containing the game, no standalone → one card, the chosen
    // (furthest-along) master. Same status → earliest added wins.
    const a = game({ id: "a", rawgId: 1, compilationId: "comp1", addedAt: 1 });
    const b = game({ id: "b", rawgId: 1, compilationId: "comp2", addedAt: 2 });
    expect(dedupeOwnership([a, b]).map((g) => g.id)).toEqual(["a"]);
  });

  it("keeps the furthest-along compilation copy as the surviving card", () => {
    // The PS4 copy is being played; the backlog copy folds away even though it was
    // added first — so the started copy is never hidden behind a backlog one.
    const backlog = game({ id: "x", rawgId: 1, compilationId: "comp1", addedAt: 1, status: "backlog" });
    const playing = game({ id: "y", rawgId: 1, compilationId: "comp2", addedAt: 2, status: "playing" });
    expect(dedupeOwnership([backlog, playing]).map((g) => g.id)).toEqual(["y"]);
  });

  it("does not merge unrelated custom games that both lack a catalog id", () => {
    const a = game({ id: "a", compilationId: null });
    const b = game({ id: "b", compilationId: "comp1" }); // no rawg/catalog id
    expect(dedupeOwnership([a, b]).map((g) => g.id)).toEqual(["a", "b"]);
  });
});
