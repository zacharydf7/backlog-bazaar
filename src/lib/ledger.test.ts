import { describe, it, expect } from "vitest";
import type { Compilation, Game, GameStatus } from "../types";
import {
  ownedGames,
  ledgerFacets,
  ledgerMatches,
  applyLedgerFilters,
  ledgerStats,
  groupLedger,
  clusterCompilationRows,
  orderedLedgerGames,
  ledgerRowTotal,
  sliceLedgerGroups,
  ledgerRowIndexOf,
  EMPTY_LEDGER_FILTERS,
  NO_PLATFORM_LABEL,
  type LedgerGroup,
} from "./ledger";

function bundleComp(id: string, childOrder?: string[]): Compilation {
  return { id, title: id, totalCost: 0, createdAt: 1, expanded: true, carryoverHours: 0, childOrder };
}

let seq = 0;
function game(over: Partial<Game> = {}): Game {
  seq += 1;
  return {
    id: `g${seq}`,
    title: `Game ${seq}`,
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: seq,
    ...over,
  } as Game;
}

function copy(platform: string) {
  return { id: `c-${platform}-${seq}`, platform };
}

describe("ownedGames", () => {
  it("excludes wishlist items but keeps bazaar/playing/finished", () => {
    const games = [
      game({ status: "backlog" }),
      game({ status: "playing" }),
      game({ status: "finished" }),
      game({ status: "wishlist" }),
    ];
    const owned = ownedGames(games);
    expect(owned).toHaveLength(3);
    expect(owned.some((g) => g.status === "wishlist")).toBe(false);
  });
});

describe("ledgerStats", () => {
  it("counts each status and computes completion percentage", () => {
    const owned = ownedGames([
      game({ status: "finished" }),
      game({ status: "finished" }),
      game({ status: "playing" }),
      game({ status: "backlog" }),
      game({ status: "wishlist" }), // excluded
    ]);
    const s = ledgerStats(owned);
    expect(s.total).toBe(4);
    expect(s.finished).toBe(2);
    expect(s.playing).toBe(1);
    expect(s.backlog).toBe(1);
    expect(s.finishedPct).toBe(50); // 2 of 4
  });

  it("reports 0% completion for an empty library without dividing by zero", () => {
    const s = ledgerStats([]);
    expect(s.finishedPct).toBe(0);
    expect(s.beatenPct).toBe(0);
    expect(s.completedPct).toBe(0);
  });

  it("buckets finished games by finish tag and computes percentages", () => {
    const owned = ownedGames([
      game({ status: "finished", finishTag: "beaten" }),
      game({ status: "finished", finishTag: "beaten" }),
      game({ status: "finished", finishTag: "completed" }),
      game({ status: "finished", finishTag: "endless" }),
      game({ status: "finished" }), // untagged legacy clear: finished, no bucket
      game({ status: "backlog" }),
      game({ status: "playing" }),
      game({ status: "backlog" }),
    ]);
    const s = ledgerStats(owned);
    expect(s.finished).toBe(5);
    expect(s.beaten).toBe(2);
    expect(s.completed).toBe(1);
    expect(s.endless).toBe(1);
    expect(s.finishedPct).toBe(63); // 5 of 8
    expect(s.beatenPct).toBe(25); // 2 of 8
    expect(s.completedPct).toBe(13); // 1 of 8, rounded
  });

  it("ignores finish tags on games that aren't finished", () => {
    // A tag can linger after a finished game is pulled back into play — it
    // must not count toward the clear buckets until the game is finished again.
    const s = ledgerStats(ownedGames([game({ status: "playing", finishTag: "beaten" })]));
    expect(s.beaten).toBe(0);
    expect(s.beatenPct).toBe(0);
  });

  it("sums lifetime hours played and counts games finished this year", () => {
    const now = new Date("2026-06-22T12:00:00Z").getTime();
    const owned = ownedGames([
      game({ status: "finished", playedHours: 10, reward: 100, finishedAt: new Date("2026-02-01").getTime() }),
      game({ status: "finished", playedHours: 5, reward: 50, finishedAt: new Date("2025-12-01").getTime() }), // last year
      game({ status: "playing", playedHours: 2.5 }),
      game({ status: "wishlist", playedHours: 99, reward: 999 }), // excluded by ownedGames
    ]);
    const s = ledgerStats(owned, now);
    expect(s.hoursPlayed).toBe(17.5); // 10 + 5 + 2.5
    expect(s.finishedThisYear).toBe(1); // only the 2026 clear
    expect(s.coinsEarned).toBe(150); // 100 + 50, wishlist excluded
  });
});

describe("ledger platform filtering", () => {
  it("filters by an owned platform regardless of status", () => {
    const ps5Finished = game({ status: "finished", copies: [copy("PS5")] });
    const ps5Backlog = game({ status: "backlog", copies: [copy("PS5")] });
    const pcOnly = game({ status: "backlog", copies: [copy("PC")] });
    const owned = [ps5Finished, ps5Backlog, pcOnly];

    const filters = { ...EMPTY_LEDGER_FILTERS, platforms: ["PS5"] };
    const out = applyLedgerFilters(owned, filters);
    expect(out.map((g) => g.id).sort()).toEqual([ps5Finished.id, ps5Backlog.id].sort());
  });

  it("uses owned copies' platforms, not release platforms, when copies exist", () => {
    // Released on Switch + Switch 2 but only owned on Switch 2.
    const g = game({
      platforms: ["Nintendo Switch", "Nintendo Switch 2"],
      copies: [copy("Nintendo Switch 2")],
    });
    expect(ledgerMatches(g, { ...EMPTY_LEDGER_FILTERS, platforms: ["Nintendo Switch"] })).toBe(
      false,
    );
    expect(ledgerMatches(g, { ...EMPTY_LEDGER_FILTERS, platforms: ["Nintendo Switch 2"] })).toBe(
      true,
    );
  });

  it("falls back to release platforms when no copies are recorded", () => {
    const g = game({ platforms: ["PC"], copies: [] });
    expect(ledgerMatches(g, { ...EMPTY_LEDGER_FILTERS, platforms: ["PC"] })).toBe(true);
  });
});

describe("ledgerFacets", () => {
  it("offers only present statuses (in canonical order) and sorted platforms", () => {
    const owned = ownedGames([
      game({ status: "finished", copies: [copy("PS5")] }),
      game({ status: "playing", copies: [copy("PC")] }),
    ]);
    const f = ledgerFacets(owned);
    expect(f.statuses).toEqual(["playing", "finished"]); // canonical order, no backlog
    expect(f.platforms).toEqual(["PC", "PS5"]);
  });
});

describe("groupLedger", () => {
  it("groups by status in canonical order, dropping empty buckets", () => {
    const owned = [
      game({ status: "finished" }),
      game({ status: "playing" }),
      game({ status: "playing" }),
    ];
    const groups = groupLedger(owned, "status");
    expect(groups.map((g) => g.key)).toEqual(["playing", "finished"]);
    expect(groups[0].games).toHaveLength(2);
  });

  it("lists a multi-platform game under each platform it's owned on", () => {
    const multi = game({ copies: [copy("PS5"), copy("PC")] });
    const groups = groupLedger([multi], "platform");
    expect(groups.map((g) => g.label)).toEqual(["PC", "PS5"]); // alphabetised
    expect(groups[0].games[0].id).toBe(multi.id);
    expect(groups[1].games[0].id).toBe(multi.id);
  });

  it("buckets platform-less games into the unspecified group, listed last", () => {
    const withP = game({ copies: [copy("PS5")] });
    const without = game({ platforms: [], copies: [] });
    const groups = groupLedger([withP, without], "platform");
    expect(groups[groups.length - 1].label).toBe(NO_PLATFORM_LABEL);
  });

  it("returns a single unlabeled group when grouping is off", () => {
    const owned = [game(), game()];
    const groups = groupLedger(owned, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].games).toHaveLength(2);
  });
});

describe("applyLedgerFilters", () => {
  it("sorts results alphabetically by title", () => {
    const owned = [game({ title: "Zelda" }), game({ title: "Antichamber" }), game({ title: "Mario" })];
    const out = applyLedgerFilters(owned, EMPTY_LEDGER_FILTERS);
    expect(out.map((g) => g.title)).toEqual(["Antichamber", "Mario", "Zelda"]);
  });

  it("AND-combines categories (status AND platform)", () => {
    const ps5Finished = game({ status: "finished", title: "A", copies: [copy("PS5")] });
    const ps5Backlog = game({ status: "backlog", title: "B", copies: [copy("PS5")] });
    const filters = {
      statuses: ["finished"] as GameStatus[],
      platforms: ["PS5"],
      liked: false,
      player2: false,
    };
    const out = applyLedgerFilters([ps5Finished, ps5Backlog], filters);
    expect(out.map((g) => g.id)).toEqual([ps5Finished.id]);
  });

  it("liked slices the ledger down to favorites only", () => {
    const fav = game({ title: "A", likedAt: 42 });
    const plain = game({ title: "B" });
    const out = applyLedgerFilters([fav, plain], { ...EMPTY_LEDGER_FILTERS, liked: true });
    expect(out.map((g) => g.id)).toEqual([fav.id]);
  });

  it("player2 slices down to guest copies — Player 2 seats on someone else's copy (3eb956ff)", () => {
    const guest = game({
      title: "A",
      copies: [{ id: "c1", platform: "PC", acquisition: "player2" }],
    });
    const owned = game({ title: "B", copies: [copy("PC")] });
    const out = applyLedgerFilters([guest, owned], { ...EMPTY_LEDGER_FILTERS, player2: true });
    expect(out.map((g) => g.id)).toEqual([guest.id]);
  });
});

describe("orderedLedgerGames (Prev/Next browse order, 7ad49282)", () => {
  it("returns owned games in display order, wishlist excluded", () => {
    const zelda = game({ title: "Zelda" });
    const antichamber = game({ title: "Antichamber" });
    const wished = game({ title: "Aaa", status: "wishlist" });
    const out = orderedLedgerGames(
      [zelda, antichamber, wished],
      EMPTY_LEDGER_FILTERS,
      "",
      "none",
    );
    expect(out.map((g) => g.title)).toEqual(["Antichamber", "Zelda"]);
  });

  it("narrows to the live search query", () => {
    const out = orderedLedgerGames(
      [game({ title: "Hollow Knight" }), game({ title: "Celeste" })],
      EMPTY_LEDGER_FILTERS,
      "celeste",
      "none",
    );
    expect(out.map((g) => g.title)).toEqual(["Celeste"]);
  });

  it("browses a multi-platform game once even though it lists under each platform group", () => {
    const alpha = game({ title: "Alpha", copies: [copy("PC"), copy("PS5")] });
    const beta = game({ title: "Beta", copies: [copy("PS5")] });
    // Grouped display: PC → [Alpha], PS5 → [Alpha, Beta]; deduped to first seen.
    const out = orderedLedgerGames([alpha, beta], EMPTY_LEDGER_FILTERS, "", "platform");
    expect(out.map((g) => g.id)).toEqual([alpha.id, beta.id]);
  });

  it("matches the ledger's flattened group order exactly (no drift)", () => {
    const games = [
      game({ title: "B", status: "finished" }),
      game({ title: "A", status: "playing" }),
      game({ title: "C", status: "playing" }),
    ];
    const filtered = applyLedgerFilters(ownedGames(games), EMPTY_LEDGER_FILTERS);
    const expected = groupLedger(filtered, "status").flatMap((grp) => grp.games.map((g) => g.id));
    const out = orderedLedgerGames(games, EMPTY_LEDGER_FILTERS, "", "status").map((g) => g.id);
    expect(out).toEqual(expected);
  });

  it("clusters a bundle in the flat browse order (Prev/Next parity)", () => {
    const games = [
      game({ id: "alpha", title: "Alpha" }),
      game({ id: "rem", title: "BioShock Remastered", compilationId: "C" }),
      game({ id: "two", title: "BioShock 2 Remastered", compilationId: "C" }),
    ];
    const out = orderedLedgerGames(games, EMPTY_LEDGER_FILTERS, "", "none", [
      bundleComp("C", ["rem", "two"]),
    ]);
    expect(out.map((g) => g.id)).toEqual(["alpha", "rem", "two"]);
  });
});

describe("clusterCompilationRows (ledger clustering, 140ac868)", () => {
  it("keeps a bundle's games together in the owner's order, placed by its first title", () => {
    const games = [
      game({ id: "alpha", title: "Alpha" }),
      game({ id: "rem", title: "BioShock Remastered", compilationId: "C" }),
      game({ id: "two", title: "BioShock 2 Remastered", compilationId: "C" }),
      game({ id: "inf", title: "BioShock Infinite", compilationId: "C" }),
      game({ id: "z", title: "Zelda" }),
    ];
    const out = clusterCompilationRows(games, [bundleComp("C", ["rem", "two", "inf"])]);
    expect(out.map((g) => g.title)).toEqual([
      "Alpha",
      "BioShock Remastered",
      "BioShock 2 Remastered",
      "BioShock Infinite",
      "Zelda",
    ]);
  });

  it("clusters in the bundle's natural order when none is saved", () => {
    const games = [
      game({ id: "rem", title: "BioShock Remastered", compilationId: "C" }),
      game({ id: "two", title: "BioShock 2 Remastered", compilationId: "C" }),
    ];
    expect(clusterCompilationRows(games, []).map((g) => g.id)).toEqual(["rem", "two"]);
  });

  it("returns a bundle-free list untouched (same reference)", () => {
    const games = [game({ id: "a", title: "A" }), game({ id: "b", title: "B" })];
    expect(clusterCompilationRows(games, [])).toBe(games);
  });

  it("clusters within a status group when the ledger is grouped", () => {
    const games = [
      game({ id: "rem", title: "BioShock Remastered", status: "finished", compilationId: "C" }),
      game({ id: "two", title: "BioShock 2 Remastered", status: "finished", compilationId: "C" }),
      game({ id: "solo", title: "Alpha", status: "finished" }),
    ];
    const groups = groupLedger(games, "status", [bundleComp("C", ["rem", "two"])]);
    const finished = groups.find((g) => g.key === "finished")!;
    expect(finished.games.map((g) => g.id)).toEqual(["solo", "rem", "two"]);
  });
});

describe("ledger paging helpers (86dce059 — the Ledger pages like the boards)", () => {
  const grouped: LedgerGroup[] = [
    { key: "a", label: "A", games: [game({ id: "a1" }), game({ id: "a2" })] },
    { key: "b", label: "B", games: [game({ id: "b1" }), game({ id: "b2" }), game({ id: "b3" })] },
    { key: "c", label: "C", games: [game({ id: "c1" })] },
  ];

  it("counts rows across every group (a game repeated per platform counts each row)", () => {
    expect(ledgerRowTotal(grouped)).toBe(6);
    expect(ledgerRowTotal([])).toBe(0);
  });

  it("slices to the first N rows, cutting a group mid-way and dropping empty tails", () => {
    const out = sliceLedgerGroups(grouped, 3);
    expect(out.map((g) => g.key)).toEqual(["a", "b"]); // no empty "c" heading
    expect(out[0].games.map((g) => g.id)).toEqual(["a1", "a2"]);
    expect(out[1].games.map((g) => g.id)).toEqual(["b1"]); // cut mid-group
  });

  it("returns everything unchanged when the count covers all rows", () => {
    expect(sliceLedgerGroups(grouped, 6)).toEqual(grouped);
    expect(sliceLedgerGroups(grouped, 999)).toEqual(grouped);
  });

  it("survives degenerate counts", () => {
    expect(sliceLedgerGroups(grouped, 0)).toEqual([]);
    expect(sliceLedgerGroups(grouped, -5)).toEqual([]);
  });

  it("finds a game's first row index across groups (the anchor row), or -1", () => {
    expect(ledgerRowIndexOf(grouped, "a1")).toBe(0);
    expect(ledgerRowIndexOf(grouped, "b3")).toBe(4);
    expect(ledgerRowIndexOf(grouped, "c1")).toBe(5);
    expect(ledgerRowIndexOf(grouped, "nope")).toBe(-1);
  });
});
