import { describe, expect, it } from "vitest";
import type { Game, GameCopy } from "../types";
import {
  routeAdd,
  ownedElsewhere,
  ownedVersionsFor,
  versionHoursFromRows,
  mergeWishlistIntoOwned,
  libraryPresence,
} from "./addRouting";
import type { PlaytimeRow } from "./platformPlaytime";

let seq = 0;
function game(over: Partial<Game>): Game {
  seq += 1;
  return {
    id: over.id ?? `g${seq}`,
    title: over.title ?? `Game ${seq}`,
    genres: [],
    status: "backlog",
    addedAt: seq,
    ...over,
  } as Game;
}

function copy(platform: string, format?: "physical" | "digital", cost?: number): GameCopy {
  seq += 1;
  return { id: `c${seq}`, platform, format, cost };
}

const META = { rawgId: 42 } as Pick<Game, "rawgId" | "catalogId">;

describe("routeAdd — library destinations", () => {
  it("routes a brand-new game clean", () => {
    const d = routeAdd({ games: [], meta: META, destination: "backlog", copies: [copy("PC")] });
    expect(d.kind).toBe("clean");
  });

  it("custom titles (no identity) never match anything", () => {
    const games = [game({ rawgId: undefined, title: "My Homebrew" })];
    const d = routeAdd({ games, meta: {}, destination: "backlog", copies: [] });
    expect(d.kind).toBe("clean");
  });

  it("attaches a genuinely new version to an owned standalone copy", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("Nintendo Switch")],
    });
    expect(d.kind).toBe("attach-library");
    if (d.kind === "attach-library") expect(d.target.id).toBe(owned.id);
  });

  it("blocks a copy colliding with an owned version — on library boards too", () => {
    const owned = game({ rawgId: 42, status: "finished", copies: [copy("PC")] });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "finished",
      copies: [copy("PC"), copy("Nintendo Switch")],
    });
    expect(d.kind).toBe("blocked-duplicate-version");
    if (d.kind === "blocked-duplicate-version")
      expect(d.duplicateVersions.map((v) => v.platform)).toEqual(["PC"]);
  });

  it("a format-less copy collides with any owned format of that platform (regression)", () => {
    // Owned PS4 Digital; re-adding a bare "PlayStation 4" (no format picked)
    // used to slip past the exact-match check and duplicate the copy.
    const owned = game({
      rawgId: 42,
      status: "finished",
      copies: [copy("PlayStation 4", "digital")],
    });
    const bare = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("PlayStation 4")],
    });
    expect(bare.kind).toBe("blocked-duplicate-version");

    // The exact same format is blocked too (regression #2)…
    const exact = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("PlayStation 4", "digital")],
    });
    expect(exact.kind).toBe("blocked-duplicate-version");

    // …while a genuinely different format attaches.
    const other = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("PlayStation 4", "physical")],
    });
    expect(other.kind).toBe("attach-library");
  });

  it("prefers the furthest-along library row as the attach target", () => {
    const backlog = game({ rawgId: 42, status: "backlog" });
    const playing = game({ rawgId: 42, status: "playing" });
    const d = routeAdd({ games: [backlog, playing], meta: META, destination: "finished", copies: [] });
    expect(d.kind).toBe("attach-library");
    if (d.kind === "attach-library") expect(d.target.id).toBe(playing.id);
  });

  it("intercepts when the game is only on the wishlist", () => {
    const wish = game({ rawgId: 42, status: "wishlist" });
    const d = routeAdd({ games: [wish], meta: META, destination: "backlog", copies: [copy("PC")] });
    expect(d.kind).toBe("wishlist-intercept");
    if (d.kind === "wishlist-intercept") expect(d.wishlistRow.id).toBe(wish.id);
  });

  it("library match wins over a wishlist match", () => {
    const owned = game({ rawgId: 42, status: "finished" });
    const wish = game({ rawgId: 42, status: "wishlist" });
    const d = routeAdd({ games: [owned, wish], meta: META, destination: "backlog", copies: [] });
    expect(d.kind).toBe("attach-library");
  });

  it("a game owned only via a compilation adds clean (folding handles the card)", () => {
    const child = game({ rawgId: 42, status: "backlog", compilationId: "comp1" });
    const d = routeAdd({ games: [child], meta: META, destination: "backlog", copies: [copy("PC")] });
    expect(d.kind).toBe("clean");
  });

  it("rawg and catalog id spaces never cross-match", () => {
    const communityRow = game({ rawgId: undefined, catalogId: "abc", status: "backlog" });
    const d = routeAdd({ games: [communityRow], meta: META, destination: "backlog", copies: [] });
    expect(d.kind).toBe("clean");
    const d2 = routeAdd({
      games: [communityRow],
      meta: { catalogId: "abc" },
      destination: "backlog",
      copies: [],
    });
    expect(d2.kind).toBe("attach-library");
  });
});

describe("routeAdd — wishlist destination (SKU-level)", () => {
  it("allows wishlisting a new version of an owned game", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("Nintendo Switch", "digital")] });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "wishlist",
      copies: [copy("Nintendo Switch", "physical")],
    });
    expect(d.kind).toBe("clean");
  });

  it("blocks wishlisting the exact version already owned", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("Nintendo Switch", "digital")] });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "wishlist",
      copies: [copy("Nintendo Switch", "digital")],
    });
    expect(d.kind).toBe("blocked-duplicate-version");
    if (d.kind === "blocked-duplicate-version")
      expect(d.duplicateVersions).toEqual([{ platform: "Nintendo Switch", format: "digital" }]);
  });

  it("ownership spans compilation children when blocking versions", () => {
    const child = game({
      rawgId: 42,
      status: "backlog",
      compilationId: "comp1",
      copies: [copy("PlayStation 5", "physical")],
    });
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const d = routeAdd({
      games: [child, owned],
      meta: META,
      destination: "wishlist",
      copies: [copy("PlayStation 5", "physical")],
    });
    expect(d.kind).toBe("blocked-duplicate-version");
  });

  it("blocks an owned game wishlisted with no version picked", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const d = routeAdd({ games: [owned], meta: META, destination: "wishlist", copies: [] });
    expect(d.kind).toBe("blocked-duplicate-version");
    if (d.kind === "blocked-duplicate-version") expect(d.duplicateVersions).toEqual([]);
  });

  it("appends a genuinely new version to an existing wishlist entry", () => {
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PC")] });
    const ps5 = copy("PlayStation 5");
    const d = routeAdd({ games: [wish], meta: META, destination: "wishlist", copies: [ps5] });
    expect(d.kind).toBe("attach-wishlist");
    if (d.kind === "attach-wishlist") expect(d.freshCopies).toEqual([ps5]);
  });

  it("blocks a version the wishlist entry already lists (or is ambiguous with)", () => {
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PC")] });
    const d = routeAdd({
      games: [wish],
      meta: META,
      destination: "wishlist",
      copies: [copy("PC"), copy("PlayStation 5")],
    });
    expect(d.kind).toBe("blocked-duplicate-version");
    if (d.kind === "blocked-duplicate-version")
      expect(d.duplicateVersions.map((v) => v.platform)).toEqual(["PC"]);
  });

  it("blocks when every requested version is already wanted", () => {
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PC")] });
    const d = routeAdd({ games: [wish], meta: META, destination: "wishlist", copies: [copy("PC")] });
    expect(d.kind).toBe("blocked-duplicate-version");
  });

  it("still blocks owned versions when a wishlist entry also exists", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PlayStation 5")] });
    const d = routeAdd({ games: [owned, wish], meta: META, destination: "wishlist", copies: [copy("PC")] });
    expect(d.kind).toBe("blocked-duplicate-version");
  });
});

describe("ownedElsewhere / ownedVersionKeysFor", () => {
  it("finds the owned standalone twin of a wishlist card", () => {
    const owned = game({ rawgId: 42, status: "finished" });
    const wish = game({ rawgId: 42, status: "wishlist" });
    expect(ownedElsewhere([owned, wish], wish)?.id).toBe(owned.id);
  });

  it("ignores wishlist rows, compilation children, and the card itself", () => {
    const wish = game({ rawgId: 42, status: "wishlist" });
    const child = game({ rawgId: 42, status: "backlog", compilationId: "comp1" });
    expect(ownedElsewhere([wish, child], wish)).toBeNull();
  });

  it("collects owned versions across all owned rows", () => {
    const owned = game({ rawgId: 42, copies: [copy("PC")] });
    const child = game({ rawgId: 42, compilationId: "c", copies: [copy("Nintendo Switch", "physical")] });
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PlayStation 5")] });
    const versions = ownedVersionsFor([owned, child, wish], META);
    expect(versions).toHaveLength(2); // wishlist copies are wants, not ownership
  });
});

describe("libraryPresence", () => {
  it("reports a wishlist-only match as on the wishlist (the mislabel regression)", () => {
    const wish = game({ rawgId: 42, status: "wishlist" });
    expect(libraryPresence([wish], META)).toBe("wishlist");
  });

  it("an owned row wins over a wishlist entry, furthest-along status first", () => {
    const wish = game({ rawgId: 42, status: "wishlist" });
    const backlog = game({ rawgId: 42, status: "backlog" });
    const playing = game({ rawgId: 42, status: "playing" });
    expect(libraryPresence([wish, backlog], META)).toBe("backlog");
    expect(libraryPresence([wish, backlog, playing], META)).toBe("playing");
  });

  it("ownership via a compilation child still counts", () => {
    const child = game({ rawgId: 42, status: "finished", compilationId: "comp1" });
    expect(libraryPresence([child], META)).toBe("finished");
  });

  it("returns null for no match or a custom title", () => {
    expect(libraryPresence([game({ rawgId: 7 })], META)).toBeNull();
    expect(libraryPresence([game({ rawgId: undefined })], {})).toBeNull();
  });
});

describe("versionHoursFromRows", () => {
  const row = (key: string, platform: string | null, format: "physical" | "digital" | null = null): PlaytimeRow => ({
    key,
    platform,
    format,
    label: platform ?? "Played",
    hours: 0,
    absorbs: [],
  });

  it("parses drafts and skips blanks, zeros, junk, and version-less rows", () => {
    const rows = [row("a", "PC"), row("b", "Nintendo Switch", "physical"), row("c", "PS5"), row("d", null)];
    const drafts = { a: "1h 30m", b: "junk", c: "0", d: "5h" };
    expect(versionHoursFromRows(rows, drafts)).toEqual([
      { platform: "PC", format: null, hours: 1.5 },
    ]);
  });
});

describe("mergeWishlistIntoOwned (offline import merge)", () => {
  it("appends not-yet-owned versions and drops the wishlist row", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const wish = game({
      rawgId: 42,
      status: "wishlist",
      copies: [copy("PC"), copy("PlayStation 5", "physical")],
    });
    const res = mergeWishlistIntoOwned([owned, wish], wish.id);
    expect(res.mergedInto).toBe(owned.id);
    expect(res.games).toHaveLength(1);
    expect(res.games[0].copies?.map((c) => c.platform)).toEqual(["PC", "PlayStation 5"]);
  });

  it("no owned twin → untouched (caller flips status as before)", () => {
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PC")] });
    const res = mergeWishlistIntoOwned([wish], wish.id);
    expect(res.mergedInto).toBeNull();
    expect(res.games).toHaveLength(1);
  });

  it("legacy wishlist rows with no copies still merge away cleanly", () => {
    const owned = game({ rawgId: 42, status: "playing", copies: [copy("PC")] });
    const wish = game({ rawgId: 42, status: "wishlist" });
    const res = mergeWishlistIntoOwned([owned, wish], wish.id);
    expect(res.mergedInto).toBe(owned.id);
    expect(res.games).toHaveLength(1);
    expect(res.games[0].copies).toHaveLength(1);
  });

  it("compilation children are never merge targets", () => {
    const child = game({ rawgId: 42, status: "backlog", compilationId: "comp1" });
    const wish = game({ rawgId: 42, status: "wishlist" });
    const res = mergeWishlistIntoOwned([child, wish], wish.id);
    expect(res.mergedInto).toBeNull();
  });
});
