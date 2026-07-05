import { describe, it, expect } from "vitest";
import type { Game, GameStatus } from "../types";
import {
  ownedGames,
  ledgerFacets,
  ledgerMatches,
  applyLedgerFilters,
  ledgerStats,
  groupLedger,
  EMPTY_LEDGER_FILTERS,
  NO_PLATFORM_LABEL,
} from "./ledger";

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
    const filters = { statuses: ["finished"] as GameStatus[], platforms: ["PS5"], liked: false };
    const out = applyLedgerFilters([ps5Finished, ps5Backlog], filters);
    expect(out.map((g) => g.id)).toEqual([ps5Finished.id]);
  });

  it("liked slices the ledger down to favorites only", () => {
    const fav = game({ title: "A", likedAt: 42 });
    const plain = game({ title: "B" });
    const out = applyLedgerFilters([fav, plain], { ...EMPTY_LEDGER_FILTERS, liked: true });
    expect(out.map((g) => g.id)).toEqual([fav.id]);
  });
});
