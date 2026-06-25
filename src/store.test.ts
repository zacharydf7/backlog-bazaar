import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { STARTING_COINS, SHELVE, computeShelveRefund } from "./lib/pricing";
import { DEFAULT_CHARTER_COST, DEFAULT_CHARTER_RESALE_PCT } from "./lib/charters";
import { computeFormula, DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "./lib/economy";
import { DEFAULT_GENERAL_SLOTS } from "./lib/slots";
import type { GameMeta } from "./types";

const sampleMeta = (over: Partial<GameMeta> = {}): GameMeta => ({
  title: "Test Game",
  genres: [],
  hours: 5,
  ...over,
});

const store = () => useStore.getState();

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    cloud: false,
    initialized: true,
    ready: true,
    userId: null,
    email: null,
    displayName: "You",
    providers: [],
    coins: STARTING_COINS,
    charters: 0,
    charterCost: DEFAULT_CHARTER_COST,
    charterResalePct: DEFAULT_CHARTER_RESALE_PCT,
    games: [],
    ledger: [],
    celebration: null,
    error: null,
    notice: null,
    shelveRefundPct: SHELVE.defaultPct,
    generalSlots: DEFAULT_GENERAL_SLOTS,
    myTargetedSlots: [],
    customPlatforms: [],
  });
});

describe("local-mode store", () => {
  it("runs in local mode during tests", () => {
    expect(store().cloud).toBe(false);
  });

  it("adds a game to the backlog", async () => {
    await store().addGame(sampleMeta());
    const { games } = store();
    expect(games).toHaveLength(1);
    expect(games[0].status).toBe("backlog");
    expect(games[0].id).toBeTruthy();
  });

  it("dedupes by rawgId", async () => {
    await store().addGame(sampleMeta({ rawgId: 7 }));
    await store().addGame(sampleMeta({ rawgId: 7, title: "duplicate" }));
    expect(store().games).toHaveLength(1);
  });

  it("sets and clears the activity override (trimmed, persisted)", () => {
    store().setActivityOverride("  Hosting a tournament  ");
    expect(store().activityOverride).toBe("Hosting a tournament");
    expect(localStorage.getItem("bb-activity-override")).toBe("Hosting a tournament");

    // A blank value clears it (back to automatic) and removes the persisted key.
    store().setActivityOverride("   ");
    expect(store().activityOverride).toBeNull();
    expect(localStorage.getItem("bb-activity-override")).toBeNull();
  });

  it("updates the display name (cleaned) and ignores invalid input", async () => {
    await store().setDisplayName("  Zachary   Fry  ");
    expect(store().displayName).toBe("Zachary Fry"); // trimmed + collapsed

    const before = store().displayName;
    await store().setDisplayName("a"); // too short — rejected
    expect(store().displayName).toBe(before);
  });

  it("adds a finished game directly without awarding coins (collection)", async () => {
    await store().addGame(sampleMeta(), "finished");
    const { games, coins } = store();
    expect(games).toHaveLength(1);
    expect(games[0].status).toBe("finished");
    expect(games[0].finishedAt).toBeTruthy();
    expect(games[0].reward).toBeUndefined();
    expect(coins).toBe(STARTING_COINS); // no payout for collection imports
  });

  it("buys a game: deducts coins and moves it to Now Playing", async () => {
    await store().addGame(sampleMeta());
    const game = store().games[0];
    const price = computeFormula(game, DEFAULT_PRICE_FORMULA);

    await store().buyGame(game.id);

    expect(store().coins).toBe(STARTING_COINS - price);
    const g = store().games[0];
    expect(g.status).toBe("playing");
    expect(g.pricePaid).toBe(price);
    expect(g.startedAt).toBeTypeOf("number");
  });

  it("redeems a voucher: moves to Now Playing for free, no coins spent, logs the ledger", async () => {
    await store().addGame(sampleMeta());
    useStore.setState({ vouchers: 2 });
    const game = store().games[0];
    const coinsBefore = store().coins;

    await store().redeemVoucher(game.id);

    const g = store().games[0];
    expect(g.status).toBe("playing");
    expect(g.pricePaid).toBe(0); // free activation
    expect(store().coins).toBe(coinsBefore); // coins untouched
    expect(store().vouchers).toBe(1); // one consumed
    const top = store().ledger[0];
    expect(top.kind).toBe("voucher_redeem");
    expect(top.coinDelta).toBe(0);
    expect(top.voucherDelta).toBe(-1);
    expect(top.voucherBalanceAfter).toBe(1);
  });

  it("refuses to redeem a voucher with no balance, or for a non-Bazaar game", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;

    // No vouchers held → refused.
    useStore.setState({ vouchers: 0 });
    await store().redeemVoucher(id);
    expect(store().games[0].status).toBe("backlog");

    // Vouchers held but the game is on the Wishlist → still refused (strict
    // pathway lock: Bazaar → Now Playing only).
    useStore.setState({ vouchers: 2, games: store().games.map((g) => ({ ...g, status: "wishlist" as const })) });
    await store().redeemVoucher(id);
    expect(store().games[0].status).toBe("wishlist");
    expect(store().vouchers).toBe(2); // none spent
  });

  it("blocks starting a game when all Now Playing slots are full", async () => {
    useStore.setState({ coins: 1000, generalSlots: 2 });
    // Three backlog games; ids captured as we go (addGame prepends).
    await store().addGame(sampleMeta({ rawgId: 1 }));
    const a = store().games[0].id;
    await store().addGame(sampleMeta({ rawgId: 2 }));
    const b = store().games[0].id;
    await store().addGame(sampleMeta({ rawgId: 3 }));
    const c = store().games[0].id;

    await store().buyGame(a);
    await store().buyGame(b);
    expect(store().games.filter((g) => g.status === "playing")).toHaveLength(2);

    // Third should be refused — no open slot, even with plenty of coins.
    const coinsBefore = store().coins;
    await store().buyGame(c);
    expect(store().games.find((g) => g.id === c)!.status).toBe("backlog");
    expect(store().games.filter((g) => g.status === "playing")).toHaveLength(2);
    expect(store().coins).toBe(coinsBefore);
  });

  it("routes a matching game into a targeted slot and blocks a non-matching one", async () => {
    // No general slots; one "Quick Clear" targeted slot (≤10h).
    useStore.setState({
      coins: 1000,
      generalSlots: 0,
      myTargetedSlots: [
        {
          id: "slot-quick",
          definition: { id: "def-quick", name: "Quick Clear", minHours: null, maxHours: 10, active: true },
        },
      ],
    });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 })); // short → fits
    const short = store().games[0].id;
    await store().addGame(sampleMeta({ rawgId: 2, hours: 50 })); // long → no slot
    const long = store().games[0].id;

    await store().buyGame(short);
    expect(store().games.find((g) => g.id === short)!.status).toBe("playing");
    expect(store().games.find((g) => g.id === short)!.slotId).toBe("slot-quick");

    await store().buyGame(long); // nothing matches, no general slots
    expect(store().games.find((g) => g.id === long)!.status).toBe("backlog");

    // Finishing the short game frees the targeted slot and clears its slotId.
    await store().finishGame(short);
    expect(store().games.find((g) => g.id === short)!.slotId).toBeNull();
  });

  it("moves a game from a general slot into a matching targeted slot", async () => {
    useStore.setState({ coins: 1000, generalSlots: 2, myTargetedSlots: [] });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id); // no targeted slots yet → general slot
    expect(store().games[0].slotId).toBeNull();

    // Admin later grants a Quick Play slot the game fits.
    useStore.setState({
      myTargetedSlots: [
        {
          id: "slot-quick",
          definition: { id: "def", name: "Quick Play", minHours: null, maxHours: 15, active: true },
        },
      ],
    });

    await store().moveGameToSlot(id, "slot-quick");
    expect(store().games[0].slotId).toBe("slot-quick");

    // Moving back to a general slot clears it again.
    await store().moveGameToSlot(id, null);
    expect(store().games[0].slotId).toBeNull();
  });

  it("frees a slot when a game is finished or shelved, letting another start", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1 });
    await store().addGame(sampleMeta({ rawgId: 1 }));
    const a = store().games[0].id;
    await store().addGame(sampleMeta({ rawgId: 2 }));
    const b = store().games[0].id;

    await store().buyGame(a);
    await store().buyGame(b); // blocked — only 1 slot
    expect(store().games.find((g) => g.id === b)!.status).toBe("backlog");

    await store().finishGame(a); // frees the slot
    await store().buyGame(b);
    expect(store().games.find((g) => g.id === b)!.status).toBe("playing");
  });

  it("refuses to buy when coins are insufficient", async () => {
    await store().addGame(sampleMeta());
    useStore.setState({ coins: 0 });
    const game = store().games[0];

    await store().buyGame(game.id);

    expect(store().games[0].status).toBe("backlog");
    expect(store().coins).toBe(0);
  });

  it("finishes a playing game: awards coins and marks it finished", async () => {
    await store().addGame(sampleMeta());
    await store().buyGame(store().games[0].id);
    const coinsAfterBuy = store().coins;
    const game = store().games[0];
    const reward = computeFormula(game, DEFAULT_BOUNTY_FORMULA);

    await store().finishGame(game.id);

    expect(store().coins).toBe(coinsAfterBuy + reward);
    expect(store().games[0].status).toBe("finished");
    expect(store().games[0].reward).toBe(reward);
  });

  it("only finishes games that are currently playing", async () => {
    await store().addGame(sampleMeta());
    const coins = store().coins;

    await store().finishGame(store().games[0].id); // still in backlog

    expect(store().games[0].status).toBe("backlog");
    expect(store().coins).toBe(coins);
  });

  it("logs play time: adds hours without paying coins (payout is the bounty)", async () => {
    await store().addGame(sampleMeta());
    await store().buyGame(store().games[0].id);
    const coinsAfterBuy = store().coins;

    await store().logPlaytime(store().games[0].id, 3);

    expect(store().games[0].playedHours).toBe(3);
    expect(store().coins).toBe(coinsAfterBuy); // logging time no longer trickles coins
  });

  it("seeds played hours from the add form and accumulates further logs", async () => {
    await store().addGame(sampleMeta({ playedHours: 20 }));
    expect(store().games[0].playedHours).toBe(20);

    await store().buyGame(store().games[0].id);
    await store().logPlaytime(store().games[0].id, 2.5);
    expect(store().games[0].playedHours).toBe(22.5);
  });

  it("ignores play-time logs for games that aren't playing", async () => {
    await store().addGame(sampleMeta()); // still in backlog
    const coins = store().coins;

    await store().logPlaytime(store().games[0].id, 5);

    expect(store().games[0].playedHours).toBe(0);
    expect(store().coins).toBe(coins);
  });

  it("sets played hours directly without awarding coins (pre-existing time)", async () => {
    await store().addGame(sampleMeta()); // backlog
    const coins = store().coins;

    await store().setPlayedHours(store().games[0].id, 20);

    expect(store().games[0].playedHours).toBe(20);
    expect(store().coins).toBe(coins); // no trickle for pre-existing time
  });

  it("snaps edited playtime to the minute and clamps negatives to zero", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;

    await store().setPlayedHours(id, 2.75); // 2h 45m, exact to the minute
    expect(store().games[0].playedHours).toBe(2.75);

    await store().setPlayedHours(id, 1 + 22 / 60); // 1h 22m
    expect(store().games[0].playedHours).toBeCloseTo(1 + 22 / 60, 6);

    await store().setPlayedHours(id, -5);
    expect(store().games[0].playedHours).toBe(0);
  });

  it("shelves a playing game back to the bazaar and refunds part of the price", async () => {
    await store().addGame(sampleMeta());
    await store().buyGame(store().games[0].id);
    const pricePaid = store().games[0].pricePaid!;
    const coinsAfterBuy = store().coins;
    const refund = computeShelveRefund(pricePaid, SHELVE.defaultPct);
    expect(refund).toBeGreaterThan(0);

    await store().abandonGame(store().games[0].id);

    const g = store().games[0];
    expect(g.status).toBe("backlog");
    expect(g.startedAt).toBeUndefined();
    expect(g.pricePaid).toBeUndefined();
    expect(store().coins).toBe(coinsAfterBuy + refund);
  });

  it("honours an admin-configured shelve refund percentage", async () => {
    await store().setShelveRefundPct(20);
    expect(store().shelveRefundPct).toBe(20);

    await store().addGame(sampleMeta());
    await store().buyGame(store().games[0].id);
    const pricePaid = store().games[0].pricePaid!;
    const coinsAfterBuy = store().coins;

    await store().abandonGame(store().games[0].id);

    expect(store().coins).toBe(coinsAfterBuy + computeShelveRefund(pricePaid, 20));
  });

  it("refunds nothing when the shelve refund is set to 0%", async () => {
    await store().setShelveRefundPct(0);
    await store().addGame(sampleMeta());
    await store().buyGame(store().games[0].id);
    const coinsAfterBuy = store().coins;

    await store().abandonGame(store().games[0].id);

    expect(store().games[0].status).toBe("backlog");
    expect(store().coins).toBe(coinsAfterBuy);
  });

  it("does not shelve a game that isn't playing", async () => {
    await store().addGame(sampleMeta()); // still in backlog
    const coins = store().coins;

    await store().abandonGame(store().games[0].id);

    expect(store().games[0].status).toBe("backlog");
    expect(store().coins).toBe(coins);
  });

  it("adds custom platforms, skipping blanks, duplicates, and built-ins", async () => {
    await store().addCustomPlatform("Nintendo Switch 2");
    await store().addCustomPlatform("nintendo switch 2"); // case-insensitive dup
    await store().addCustomPlatform("   "); // blank
    await store().addCustomPlatform("PlayStation 5"); // a built-in label
    expect(store().customPlatforms).toEqual(["Nintendo Switch 2"]);

    await store().removeCustomPlatform("Nintendo Switch 2");
    expect(store().customPlatforms).toEqual([]);
  });

  it("saves a new custom platform from a game's copies on add", async () => {
    await store().addGame(
      sampleMeta({
        rawgId: 11,
        copies: [{ id: "c1", platform: "Nintendo Switch 2", format: "physical" }],
      }),
    );
    expect(store().customPlatforms).toContain("Nintendo Switch 2");

    // Built-in platforms on a copy don't get added to the custom list.
    await store().addGame(
      sampleMeta({ rawgId: 12, copies: [{ id: "c2", platform: "PC" }] }),
    );
    expect(store().customPlatforms).toEqual(["Nintendo Switch 2"]);
  });

  it("removes a game", async () => {
    await store().addGame(sampleMeta());
    await store().removeGame(store().games[0].id);
    expect(store().games).toHaveLength(0);
  });

  it("moves a backlog game to the wishlist, then imports it back with a charter", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    expect(store().games[0].status).toBe("backlog");

    await store().bazaarToWishlist(id);
    expect(store().games[0].status).toBe("wishlist");

    // Importing back into the Bazaar now requires (and consumes) a charter.
    await store().buyCharter();
    expect(store().charters).toBe(1);
    await store().importWithCharter(id);
    expect(store().games[0].status).toBe("backlog");
    expect(store().charters).toBe(0);
  });

  it("won't import a wishlist game without a charter", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    await store().bazaarToWishlist(id);

    await store().importWithCharter(id); // no charter held
    expect(store().games[0].status).toBe("wishlist");
  });

  it("buys and sells charters, adjusting coins and logging both", async () => {
    const start = store().coins;
    await store().buyCharter();
    expect(store().charters).toBe(1);
    expect(store().coins).toBe(start - DEFAULT_CHARTER_COST);

    await store().sellCharter();
    expect(store().charters).toBe(0);
    // Resale is depreciated (75% of 100 = 75), so a buy+sell round-trip loses coins.
    const resale = Math.floor((DEFAULT_CHARTER_COST * DEFAULT_CHARTER_RESALE_PCT) / 100);
    expect(store().coins).toBe(start - DEFAULT_CHARTER_COST + resale);

    const kinds = store().ledger.map((e) => e.kind);
    expect(kinds).toContain("charter_buy");
    expect(kinds).toContain("charter_sell");
  });

  it("sets the coin balance to an exact value (clamped at 0)", async () => {
    await store().setCoins(500);
    expect(store().coins).toBe(500);

    await store().setCoins(-20);
    expect(store().coins).toBe(0);

    const saved = JSON.parse(localStorage.getItem("backlog-bazaar")!);
    expect(saved.coins).toBe(0);
  });

  it("hides market games and can clear the hidden list", async () => {
    await store().hideMarketGame(42);
    await store().hideMarketGame(42); // de-duped
    await store().hideMarketGame(7);
    expect(store().hiddenMarket).toEqual([42, 7]);

    const saved = JSON.parse(localStorage.getItem("bb-hidden-market")!);
    expect(saved).toEqual([42, 7]);

    await store().clearHiddenMarket();
    expect(store().hiddenMarket).toEqual([]);
  });

  it("persists games and coins to localStorage", async () => {
    await store().addGame(sampleMeta());
    await store().buyGame(store().games[0].id);

    const raw = localStorage.getItem("backlog-bazaar");
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!);
    expect(saved.games).toHaveLength(1);
    expect(saved.games[0].status).toBe("playing");
    expect(saved.coins).toBe(store().coins);
  });
});

describe("compilations (offline)", () => {
  beforeEach(() => {
    useStore.setState({ games: [], compilations: [] });
  });

  it("creates one child game per bundled title with an even cost split", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 40, platform: "Switch", format: "physical" },
      [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
      "backlog",
    );
    const { games, compilations } = store();
    expect(games).toHaveLength(4);
    expect(compilations).toHaveLength(1);
    expect(compilations[0].totalCost).toBe(40);
    // $40 / 4 = $10 each, carried on each child's single copy.
    expect(games.every((g) => g.compilationId === compilations[0].id)).toBe(true);
    expect(games.every((g) => g.copies?.[0]?.cost === 10)).toBe(true);
    expect(games.every((g) => g.copies?.[0]?.platform === "Switch")).toBe(true);
  });

  it("applies per-game status, overriding the container destination", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 20 },
      [
        { name: "A", status: "finished" },
        { name: "B", status: "backlog" },
        { name: "C" }, // no per-game status → falls back to the container default
      ],
      "backlog",
    );
    const byName = (n: string) => store().games.find((g) => g.title === n)!;
    expect(byName("A").status).toBe("finished");
    expect(byName("A").finishedAt).toBeTypeOf("number");
    expect(byName("B").status).toBe("backlog");
    expect(byName("B").finishedAt).toBeUndefined();
    expect(byName("C").status).toBe("backlog"); // container default
  });

  it("refuses to remove a single child of a compilation", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 20 },
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const child = store().games[0];
    await store().removeGame(child.id);
    expect(store().games.some((g) => g.id === child.id)).toBe(true);
    expect(store().games).toHaveLength(2);
  });

  it("deletes the whole compilation and all its games together", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 20 },
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const compId = store().compilations[0].id;
    await store().deleteCompilation(compId);
    expect(store().games).toHaveLength(0);
    expect(store().compilations).toHaveLength(0);
  });

  it("edits a compilation: renames, re-splits, and updates existing children", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 40 },
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const [a, b] = store().games;

    await store().editCompilation(
      comp.id,
      { title: "Renamed", totalCost: 30 },
      [
        { gameId: a.id, name: "A2" },
        { gameId: b.id, name: "B" },
      ],
    );

    const after = store();
    expect(after.compilations[0].title).toBe("Renamed");
    expect(after.compilations[0].totalCost).toBe(30);
    expect(after.games).toHaveLength(2);
    expect(after.games.every((g) => g.copies?.[0]?.cost === 15)).toBe(true); // 30 / 2
    expect(after.games.every((g) => g.compilationName === "Renamed")).toBe(true);
    expect(after.games.some((g) => g.title === "A2")).toBe(true);
  });

  it("adds a newly listed game when editing", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 30 },
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const [a, b] = store().games;

    await store().editCompilation(
      comp.id,
      { title: "Bundle", totalCost: 30 },
      [{ gameId: a.id, name: "A" }, { gameId: b.id, name: "B" }, { name: "C" }],
    );

    const games = store().games;
    expect(games).toHaveLength(3);
    expect(games.every((g) => g.compilationId === comp.id)).toBe(true);
    expect(games.every((g) => g.copies?.[0]?.cost === 10)).toBe(true); // 30 / 3
    expect(games.some((g) => g.title === "C")).toBe(true);
  });

  it("drops a child game removed during an edit", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 20 },
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const a = store().games[0];

    await store().editCompilation(comp.id, { title: "Bundle", totalCost: 20 }, [
      { gameId: a.id, name: "A" },
    ]);

    const games = store().games;
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe("A");
    expect(games[0].copies?.[0]?.cost).toBe(20);
  });

  it("community-template actions no-op cleanly offline", async () => {
    expect(await store().searchCompilationTemplates("mario")).toEqual([]);
    expect(await store().submitCompilationTemplate({ kind: "new", title: "X", games: [{ name: "A" }] })).toEqual({ ok: false });
    expect(await store().fetchMyCompilationSubmissions()).toEqual([]);
    expect(await store().fetchCompilationSubmissions()).toEqual([]);
  });
});

describe("roles & permissions", () => {
  beforeEach(() => {
    useStore.setState({ isAdmin: false, permissions: [] });
  });

  it("can() is false without the permission, true once held, and true for super-admins", () => {
    expect(store().can("users.view")).toBe(false);

    useStore.setState({ permissions: ["users.view"] });
    expect(store().can("users.view")).toBe(true);
    expect(store().can("users.delete")).toBe(false); // a different key still denied

    // A super-admin implicitly holds every permission, even with an empty set.
    useStore.setState({ isAdmin: true, permissions: [] });
    expect(store().can("users.delete")).toBe(true);
  });

  it("role admin actions no-op cleanly offline (no cloud client)", async () => {
    useStore.setState({ isAdmin: true });
    expect(await store().fetchRoles()).toEqual([]);
    expect(
      await store().upsertRole({ id: null, key: "x", name: "X", description: "", permissions: [] }),
    ).toBe(false);
    expect(await store().deleteRole("r1")).toBe(false);
    expect(await store().assignRole("u1", "r1")).toBe(false);
    expect(await store().revokeRole("u1", "r1")).toBe(false);
  });
});

describe("revertSubmission", () => {
  it("refuses without the moderate permission", async () => {
    useStore.setState({ isAdmin: false, permissions: [] });
    expect(await store().revertSubmission("s1")).toBe(false);
  });

  it("no-ops cleanly offline even for a moderator (no cloud client)", async () => {
    useStore.setState({ isAdmin: false, permissions: ["submissions.games.moderate"] });
    expect(await store().revertSubmission("s1")).toBe(false);
  });
});
