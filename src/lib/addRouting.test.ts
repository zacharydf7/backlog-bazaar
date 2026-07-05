import { describe, expect, it } from "vitest";
import type { Game, GameCopy } from "../types";
import {
  routeAdd,
  ownedElsewhere,
  ownedVersionsFor,
  versionHoursFromRows,
  versionHoursForGroup,
  splitCopiesByPlatform,
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

function copy(platform: string, format?: "physical" | "digital" | "dlc", cost?: number): GameCopy {
  seq += 1;
  return { id: `c${seq}`, platform, format, cost };
}

const META = { rawgId: 42 } as Pick<Game, "rawgId" | "catalogId">;

describe("splitCopiesByPlatform", () => {
  it("groups copies per platform (first-seen order), blank platforms pooled last", () => {
    const pc1 = copy("PC");
    const sw = copy("Nintendo Switch", "physical");
    const pc2 = copy("PC", "dlc");
    const blank = { id: "x", platform: "" } as GameCopy;
    expect(splitCopiesByPlatform([pc1, sw, pc2, blank])).toEqual([
      { platform: "PC", copies: [pc1, pc2] },
      { platform: "Nintendo Switch", copies: [sw] },
      { platform: null, copies: [blank] },
    ]);
  });
});

describe("routeAdd — library destinations (per-platform instances)", () => {
  it("routes a brand-new game clean, one group per platform", () => {
    const d = routeAdd({
      games: [],
      meta: META,
      destination: "backlog",
      copies: [copy("PC"), copy("Nintendo Switch")],
    });
    expect(d.kind).toBe("clean");
    if (d.kind === "clean") {
      expect(d.groups.map((g) => [g.platform, g.action])).toEqual([
        ["PC", "new"],
        ["Nintendo Switch", "new"],
      ]);
    }
  });

  it("custom titles (no identity) never match anything", () => {
    const games = [game({ rawgId: undefined, title: "My Homebrew" })];
    const d = routeAdd({ games, meta: {}, destination: "backlog", copies: [] });
    expect(d.kind).toBe("clean");
  });

  it("a NEW platform becomes its own card (confirm-plan, action new) — never an attach", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("Nintendo Switch")],
    });
    expect(d.kind).toBe("confirm-plan");
    if (d.kind === "confirm-plan") {
      expect(d.groups).toHaveLength(1);
      expect(d.groups[0].action).toBe("new");
      expect(d.groups[0].platform).toBe("Nintendo Switch");
      expect(d.intercepts).toEqual([]);
    }
  });

  it("a new format of an OWNED platform attaches to that platform's card", () => {
    const owned = game({
      rawgId: 42,
      status: "finished",
      copies: [copy("PlayStation 4", "digital")],
    });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("PlayStation 4", "physical")],
    });
    expect(d.kind).toBe("confirm-plan");
    if (d.kind === "confirm-plan") {
      expect(d.groups[0].action).toBe("attach");
      expect(d.groups[0].target?.id).toBe(owned.id);
    }
  });

  it("a mixed add splits: same platform attaches, new platform is a new card", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC", "digital")] });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("PC", "physical"), copy("Nintendo Switch")],
    });
    expect(d.kind).toBe("confirm-plan");
    if (d.kind === "confirm-plan") {
      expect(d.groups.map((g) => [g.platform, g.action])).toEqual([
        ["PC", "attach"],
        ["Nintendo Switch", "new"],
      ]);
    }
  });

  it("DLC copies neither block nor get blocked as duplicate versions", () => {
    const owned = game({ rawgId: 42, status: "finished", copies: [copy("PC", "digital")] });
    const addDlc = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("PC", "dlc")],
    });
    expect(addDlc.kind).toBe("confirm-plan");
    if (addDlc.kind === "confirm-plan") expect(addDlc.groups[0].action).toBe("attach");

    // And an owned DLC row never blocks adding the real base copy — it claims
    // the platform, so the base copy attaches to the same card.
    const ownedDlc = game({ rawgId: 42, status: "finished", copies: [copy("PC", "dlc")] });
    const addBase = routeAdd({
      games: [ownedDlc],
      meta: META,
      destination: "backlog",
      copies: [copy("PC", "digital")],
    });
    expect(addBase.kind).toBe("confirm-plan");
    if (addBase.kind === "confirm-plan") expect(addBase.groups[0].action).toBe("attach");
  });

  it("blocks a copy colliding with the platform instance's owned version", () => {
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

    const exact = routeAdd({
      games: [owned],
      meta: META,
      destination: "backlog",
      copies: [copy("PlayStation 4", "digital")],
    });
    expect(exact.kind).toBe("blocked-duplicate-version");
  });

  it("a copies-less add of an owned game demands a specific version", () => {
    const owned = game({ rawgId: 42, status: "playing", copies: [copy("PC")] });
    const d = routeAdd({ games: [owned], meta: META, destination: "backlog", copies: [] });
    expect(d.kind).toBe("blocked-duplicate-version");
    if (d.kind === "blocked-duplicate-version") {
      expect(d.target.id).toBe(owned.id);
      expect(d.duplicateVersions).toEqual([]);
    }
  });

  it("prefers the furthest-along instance of a platform as the attach target", () => {
    const backlog = game({ rawgId: 42, status: "backlog", copies: [copy("PC", "digital")] });
    const playing = game({ rawgId: 42, status: "playing", copies: [copy("PC", "digital")] });
    const d = routeAdd({
      games: [backlog, playing],
      meta: META,
      destination: "backlog",
      copies: [copy("PC", "physical")],
    });
    expect(d.kind).toBe("confirm-plan");
    if (d.kind === "confirm-plan") expect(d.groups[0].target?.id).toBe(playing.id);
  });

  it("intercepts the wishlist entry for the platform being bought", () => {
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("Nintendo Switch")] });
    const d = routeAdd({
      games: [wish],
      meta: META,
      destination: "backlog",
      copies: [copy("Nintendo Switch", "physical")],
    });
    expect(d.kind).toBe("confirm-plan");
    if (d.kind === "confirm-plan") {
      expect(d.groups[0].action).toBe("new");
      expect(d.intercepts.map((w) => w.id)).toEqual([wish.id]);
    }
  });

  it("a wishlist entry for a DIFFERENT platform is left untouched (no intercept, no prompt)", () => {
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("Nintendo Switch")] });
    const d = routeAdd({ games: [wish], meta: META, destination: "backlog", copies: [copy("PC")] });
    expect(d.kind).toBe("clean");
    if (d.kind === "clean") expect(d.groups[0].action).toBe("new");
  });

  it("a platform-less wishlist entry (ambiguous want) is fulfilled by any add", () => {
    const bareWish = game({ rawgId: 42, status: "wishlist" });
    const d = routeAdd({
      games: [bareWish],
      meta: META,
      destination: "backlog",
      copies: [copy("PC")],
    });
    expect(d.kind).toBe("confirm-plan");
    if (d.kind === "confirm-plan") expect(d.intercepts.map((w) => w.id)).toEqual([bareWish.id]);
  });

  it("instance isolation: a bundle-owned game adds clean standalone — even the same version", () => {
    const child = game({
      rawgId: 42,
      status: "backlog",
      compilationId: "comp1",
      copies: [copy("PC", "digital")],
    });
    const d = routeAdd({
      games: [child],
      meta: META,
      destination: "backlog",
      copies: [copy("PC", "digital")],
    });
    expect(d.kind).toBe("clean");
  });

  it("rawg and catalog id spaces never cross-match", () => {
    const communityRow = game({
      rawgId: undefined,
      catalogId: "abc",
      status: "backlog",
      copies: [copy("PC")],
    });
    const d = routeAdd({
      games: [communityRow],
      meta: META,
      destination: "backlog",
      copies: [copy("PC", "physical")],
    });
    expect(d.kind).toBe("clean");
    const d2 = routeAdd({
      games: [communityRow],
      meta: { catalogId: "abc" },
      destination: "backlog",
      copies: [],
    });
    expect(d2.kind).toBe("blocked-duplicate-version");
  });
});

describe("routeAdd — wishlist destination (per-platform)", () => {
  it("allows wishlisting a new format of an owned platform", () => {
    const owned = game({
      rawgId: 42,
      status: "backlog",
      copies: [copy("Nintendo Switch", "digital")],
    });
    const d = routeAdd({
      games: [owned],
      meta: META,
      destination: "wishlist",
      copies: [copy("Nintendo Switch", "physical")],
    });
    expect(d.kind).toBe("clean");
  });

  it("blocks wishlisting the exact version already owned", () => {
    const owned = game({
      rawgId: 42,
      status: "backlog",
      copies: [copy("Nintendo Switch", "digital")],
    });
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

  it("instance isolation: a bundle-owned version no longer blocks wishlisting it standalone", () => {
    const child = game({
      rawgId: 42,
      status: "backlog",
      compilationId: "comp1",
      copies: [copy("PlayStation 5", "physical")],
    });
    const d = routeAdd({
      games: [child],
      meta: META,
      destination: "wishlist",
      copies: [copy("PlayStation 5", "physical")],
    });
    expect(d.kind).toBe("clean");
  });

  it("blocks an owned game wishlisted with no version picked", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const d = routeAdd({ games: [owned], meta: META, destination: "wishlist", copies: [] });
    expect(d.kind).toBe("blocked-duplicate-version");
    if (d.kind === "blocked-duplicate-version") expect(d.duplicateVersions).toEqual([]);
  });

  it("appends a new format to the SAME platform's wishlist entry; a new platform is its own entry", () => {
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PC", "digital")] });
    // Same platform, different format → attach to the entry (confirmed).
    const pcPhysical = copy("PC", "physical");
    const attach = routeAdd({
      games: [wish],
      meta: META,
      destination: "wishlist",
      copies: [pcPhysical],
    });
    expect(attach.kind).toBe("confirm-plan");
    if (attach.kind === "confirm-plan") {
      expect(attach.groups[0].action).toBe("attach");
      expect(attach.groups[0].target?.id).toBe(wish.id);
      expect(attach.groups[0].copies).toEqual([pcPhysical]);
    }
    // Different platform → its own new wishlist card, silently.
    const ps5 = routeAdd({
      games: [wish],
      meta: META,
      destination: "wishlist",
      copies: [copy("PlayStation 5")],
    });
    expect(ps5.kind).toBe("clean");
    if (ps5.kind === "clean") expect(ps5.groups[0].action).toBe("new");
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

  it("still blocks owned versions when a wishlist entry also exists", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PlayStation 5")] });
    const d = routeAdd({
      games: [owned, wish],
      meta: META,
      destination: "wishlist",
      copies: [copy("PC")],
    });
    expect(d.kind).toBe("blocked-duplicate-version");
  });
});

describe("ownedElsewhere / ownedVersionsFor", () => {
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
    const child = game({
      rawgId: 42,
      compilationId: "c",
      copies: [copy("Nintendo Switch", "physical")],
    });
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

describe("versionHoursFromRows / versionHoursForGroup", () => {
  const row = (
    key: string,
    platform: string | null,
    format: "physical" | "digital" | null = null,
  ): PlaytimeRow => ({
    key,
    platform,
    format,
    label: platform ?? "Played",
    hours: 0,
    absorbs: [],
  });

  it("parses drafts and skips blanks, zeros, junk, and version-less rows", () => {
    const rows = [
      row("a", "PC"),
      row("b", "Nintendo Switch", "physical"),
      row("c", "PS5"),
      row("d", null),
    ];
    const drafts = { a: "1h 30m", b: "junk", c: "0", d: "5h" };
    expect(versionHoursFromRows(rows, drafts)).toEqual([
      { platform: "PC", format: null, hours: 1.5 },
    ]);
  });

  it("slices captured hours to one platform group", () => {
    const hours = [
      { platform: "PC", format: null, hours: 2 },
      { platform: "Nintendo Switch", format: "physical" as const, hours: 3 },
    ];
    expect(versionHoursForGroup(hours, "PC")).toEqual([{ platform: "PC", format: null, hours: 2 }]);
    expect(versionHoursForGroup(hours, null)).toEqual([]);
  });
});

describe("mergeWishlistIntoOwned (offline import merge, platform-aware)", () => {
  it("merges a same-platform want into that platform's instance", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC", "digital")] });
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PC", "physical")] });
    const res = mergeWishlistIntoOwned([owned, wish], wish.id);
    expect(res.mergedInto).toBe(owned.id);
    expect(res.games).toHaveLength(1);
    expect(res.games[0].copies?.map((c) => c.format)).toEqual(["digital", "physical"]);
  });

  it("a want for a DIFFERENT platform never merges — it becomes its own card", () => {
    const owned = game({ rawgId: 42, status: "backlog", copies: [copy("PC")] });
    const wish = game({ rawgId: 42, status: "wishlist", copies: [copy("PlayStation 5")] });
    const res = mergeWishlistIntoOwned([owned, wish], wish.id);
    expect(res.mergedInto).toBeNull();
    expect(res.games).toHaveLength(2);
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
