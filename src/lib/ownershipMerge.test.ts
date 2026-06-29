import { describe, it, expect } from "vitest";
import { catalogKey, foldedCompilationCopies, dedupeOwnership } from "./ownershipMerge";
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

  it("returns nothing for a master that is itself a compilation child", () => {
    const a = game({ id: "a", rawgId: 1, compilationId: "comp1" });
    const b = game({ id: "b", rawgId: 1, compilationId: "comp2" });
    expect(foldedCompilationCopies([a, b], a)).toEqual([]);
  });

  it("returns nothing for a master with no catalog identity (hand-typed custom)", () => {
    const master = game({ id: "m", rawgId: undefined, catalogId: undefined, compilationId: null });
    const child = game({ id: "c", rawgId: undefined, catalogId: undefined, compilationId: "comp1" });
    expect(foldedCompilationCopies([master, child], master)).toEqual([]);
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

  it("never merges two compilation copies of the same game when no standalone exists", () => {
    // Two bundles each containing the game, but no standalone master → both shown
    // (we only fold compilation copies INTO a standalone, per the master rule).
    const a = game({ id: "a", rawgId: 1, compilationId: "comp1" });
    const b = game({ id: "b", rawgId: 1, compilationId: "comp2" });
    expect(dedupeOwnership([a, b]).map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("does not merge unrelated custom games that both lack a catalog id", () => {
    const a = game({ id: "a", compilationId: null });
    const b = game({ id: "b", compilationId: "comp1" }); // no rawg/catalog id
    expect(dedupeOwnership([a, b]).map((g) => g.id)).toEqual(["a", "b"]);
  });
});
