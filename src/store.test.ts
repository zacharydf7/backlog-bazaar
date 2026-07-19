import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { STARTING_COINS, SHELVE, computeShelveRefund, computeReplayBonus, computeFamilyDiscountPrice } from "./lib/pricing";
import { DEFAULT_CHARTER_COST, DEFAULT_CHARTER_RESALE_PCT } from "./lib/charters";
import { computeFormula, DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "./lib/economy";
import { DEFAULT_GENERAL_SLOTS } from "./lib/slots";
import type { Game, GameMeta } from "./types";

const sampleMeta = (over: Partial<GameMeta> = {}): GameMeta => ({
  title: "Test Game",
  genres: [],
  hours: 5,
  ...over,
});

const store = () => useStore.getState();

/** Age every game past the fresh-pickup decay window, so buy-flow specs keep
 *  their pre-pivot "base + length" prices (freshness 0) and stay affordable
 *  within STARTING_COINS. A game added moments ago carries the full +120
 *  fresh-pickup bonus, which these specs aren't about. */
const ageLibrary = () =>
  useStore.setState({
    games: useStore.getState().games.map((g) => ({
      ...g,
      addedAt: Date.now() - 9 * 365.25 * 24 * 60 * 60 * 1000,
    })),
  });

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

  it("dedupes community catalog games by catalogId too", async () => {
    await store().addGame(sampleMeta({ catalogId: "abc" }));
    await store().addGame(sampleMeta({ catalogId: "abc", title: "duplicate" }));
    expect(store().games).toHaveLength(1);
  });

  it("allows wishlisting an owned game, but not a second wishlist entry", async () => {
    await store().addGame(sampleMeta({ rawgId: 7, copies: [{ id: "c1", platform: "PC" }] }));
    // Owned in the library — a wishlist entry for another version is allowed
    // (the Add modal validates the versions; the guard only splits the boards).
    await store().addGame(
      sampleMeta({ rawgId: 7, copies: [{ id: "c2", platform: "Nintendo Switch" }] }),
      "wishlist",
    );
    expect(store().games).toHaveLength(2);
    // A second wishlist entry for the same game is still deduped.
    await store().addGame(sampleMeta({ rawgId: 7 }), "wishlist");
    expect(store().games).toHaveLength(2);
  });

  it("sums per-version starting hours into playedHours (offline)", async () => {
    await store().addGame(
      sampleMeta({
        rawgId: 7,
        copies: [
          { id: "c1", platform: "PC" },
          { id: "c2", platform: "Nintendo Switch" },
        ],
      }),
      "finished",
      "beaten",
      {
        versionHours: [
          { platform: "PC", format: null, hours: 2 },
          { platform: "Nintendo Switch", format: null, hours: 1.5 },
        ],
      },
    );
    expect(store().games[0].playedHours).toBeCloseTo(3.5);
  });

  it("attachCopies appends copies and adds their starting hours", async () => {
    await store().addGame(sampleMeta({ rawgId: 7, copies: [{ id: "c1", platform: "PC" }] }));
    const id = store().games[0].id;
    await store().attachCopies(
      id,
      [{ id: "c2", platform: "Nintendo Switch", format: "physical" }],
      [{ platform: "Nintendo Switch", format: "physical", hours: 2 }],
    );
    const g = store().games[0];
    expect(g.copies?.map((c) => c.platform)).toEqual(["PC", "Nintendo Switch"]);
    expect(g.playedHours).toBeCloseTo(2);
  });

  it("importWithCharter merges a same-platform want onto that platform's card (offline)", async () => {
    await store().addGame(
      sampleMeta({ rawgId: 7, copies: [{ id: "c1", platform: "PC", format: "digital" }] }),
    );
    await store().addGame(
      sampleMeta({ rawgId: 7, copies: [{ id: "c2", platform: "PC", format: "physical" }] }),
      "wishlist",
    );
    useStore.setState({ charters: 1 });
    const wish = store().games.find((g) => g.status === "wishlist")!;
    await store().importWithCharter(wish.id);
    const { games, charters } = store();
    expect(charters).toBe(0);
    expect(games).toHaveLength(1); // no duplicate card
    expect(games[0].status).toBe("backlog");
    expect(games[0].copies?.map((c) => c.format)).toEqual(["digital", "physical"]);
  });

  it("importWithCharter keeps a DIFFERENT platform's want as its own card (per-platform instances)", async () => {
    await store().addGame(sampleMeta({ rawgId: 7, copies: [{ id: "c1", platform: "PC" }] }));
    await store().addGame(
      sampleMeta({ rawgId: 7, copies: [{ id: "c2", platform: "Nintendo Switch" }] }),
      "wishlist",
    );
    useStore.setState({ charters: 1 });
    const wish = store().games.find((g) => g.status === "wishlist")!;
    await store().importWithCharter(wish.id);
    const { games, charters } = store();
    expect(charters).toBe(0);
    expect(games).toHaveLength(2); // the Switch instance is its own card
    const imported = games.find((g) => g.id === wish.id)!;
    expect(imported.status).toBe("backlog");
    expect(imported.copies?.map((c) => c.platform)).toEqual(["Nintendo Switch"]);
    // The PC instance is untouched.
    expect(games.find((g) => g.id !== wish.id)?.copies?.map((c) => c.platform)).toEqual(["PC"]);
  });

  it("tags a game added straight to Finished with the chosen conclusion", async () => {
    await store().addGame(sampleMeta(), "finished", "completed");
    const g = store().games[0];
    expect(g.status).toBe("finished");
    expect(g.finishTag).toBe("completed");
    expect(g.finishedAt).toBeTruthy();
  });

  it("ignores a finish tag for a game not added to Finished", async () => {
    await store().addGame(sampleMeta(), "backlog", "completed");
    expect(store().games[0].finishTag).toBeNull();
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
    ageLibrary();
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
          definition: { id: "def-quick", name: "Quick Clear", kind: "standard", minHours: null, maxHours: 10, minYear: null, maxYear: null, minMetacritic: null, maxMetacritic: null, genres: [], platforms: [], defaultGrantCount: 0, active: true },
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
          definition: { id: "def", name: "Quick Play", kind: "standard", minHours: null, maxHours: 15, minYear: null, maxYear: null, minMetacritic: null, maxMetacritic: null, genres: [], platforms: [], defaultGrantCount: 0, active: true },
        },
      ],
    });

    await store().moveGameToSlot(id, "slot-quick");
    expect(store().games[0].slotId).toBe("slot-quick");

    // Moving back to a general slot clears it again.
    await store().moveGameToSlot(id, null);
    expect(store().games[0].slotId).toBeNull();
  });

  it("parks a game in an Endless slot by choice but never auto-fills it", async () => {
    useStore.setState({
      coins: 1000,
      generalSlots: 0,
      myTargetedSlots: [
        {
          id: "slot-endless",
          definition: { id: "def-e", name: "Ongoing", kind: "endless", minHours: null, maxHours: null, minYear: null, maxYear: null, minMetacritic: null, maxMetacritic: null, genres: [], platforms: [], defaultGrantCount: 0, active: true },
        },
      ],
    });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 80 }));
    const id = store().games[0].id;

    // Auto-buy: no general slot and endless is never auto-filled → stays backlog.
    await store().buyGame(id);
    expect(store().games.find((g) => g.id === id)!.status).toBe("backlog");

    // Directing it into the endless slot parks it there.
    await store().buyGame(id, { kind: "slot", id: "slot-endless" });
    const g = store().games.find((g) => g.id === id)!;
    expect(g.status).toBe("playing");
    expect(g.slotId).toBe("slot-endless");
  });

  it("forces a general slot when the player picks 'general' over a matching targeted slot", async () => {
    useStore.setState({
      coins: 1000,
      generalSlots: 2,
      myTargetedSlots: [
        {
          id: "slot-quick",
          definition: { id: "def-q", name: "Quick", kind: "standard", minHours: null, maxHours: 10, minYear: null, maxYear: null, minMetacritic: null, maxMetacritic: null, genres: [], platforms: [], defaultGrantCount: 0, active: true },
        },
      ],
    });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 })); // fits Quick
    const id = store().games[0].id;
    // Explicit general choice → lands in a general slot (null), not Quick.
    await store().buyGame(id, { kind: "general" });
    expect(store().games.find((g) => g.id === id)!.slotId).toBeNull();
  });

  it("replays a finished game into the Replay lane for free, paying the reduced bonus on re-finish", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1, replaySlots: 2 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id); // Focus slot
    await store().finishGame(id);
    expect(store().games.find((g) => g.id === id)!.status).toBe("finished");
    const coinsAfterFinish = store().coins;

    // Replay: back to playing in the Replay lane (resumed, no focus slot), free.
    await store().replayGame(id);
    const replaying = store().games.find((g) => g.id === id)!;
    expect(replaying.status).toBe("playing");
    expect(replaying.slotId).toBeNull();
    expect(replaying.resumed).toBe(true);
    expect(replaying.finishedAt).toBeUndefined();
    expect(store().coins).toBe(coinsAfterFinish); // no coins spent to replay

    // Re-finishing pays the smaller Replay Bonus, not the full bounty.
    await store().finishGame(id);
    const full = computeFormula(store().games.find((g) => g.id === id)!, store().economy.bounty);
    const expected = computeReplayBonus(full, store().replayBonusPct);
    expect(store().coins).toBe(coinsAfterFinish + expected);
    expect(expected).toBeLessThan(full);
    expect(store().games.find((g) => g.id === id)!.resumed).toBe(false);
  });

  it("aborts a replay back to Finished without paying a bounty", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1, replaySlots: 2 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id);
    await store().finishGame(id);
    await store().replayGame(id);
    const coinsWhileReplaying = store().coins;
    expect(store().games.find((g) => g.id === id)!.status).toBe("playing");

    // Abort: straight back to Finished, free, not a single coin awarded.
    await store().abortReplay(id);
    const aborted = store().games.find((g) => g.id === id)!;
    expect(aborted.status).toBe("finished");
    expect(aborted.slotId).toBeNull();
    expect(store().coins).toBe(coinsWhileReplaying);

    // A Focus playing game is never affected by abortReplay.
    await store().addGame(sampleMeta({ rawgId: 2, hours: 5 }));
    const other = store().games[0].id;
    await store().buyGame(other);
    await store().abortReplay(other);
    expect(store().games.find((g) => g.id === other)!.status).toBe("playing");
  });

  it("undoAction reverses a finish: restores the prior lane and rolls back the coins", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id); // Focus

    // Snapshot the playing game (what the finish toast carries as prevGame).
    const prevGame = { ...store().games.find((g) => g.id === id)! };
    const coinsBeforeFinish = store().coins;

    await store().finishGame(id);
    expect(store().games.find((g) => g.id === id)!.status).toBe("finished");
    const reward = store().coins - coinsBeforeFinish;
    expect(reward).toBeGreaterThan(0);

    // Undo with the descriptor the toast would have built.
    await store().undoAction({
      id: null,
      gameId: id,
      action: "finish",
      label: prevGame.title,
      prevGame,
      coinsDelta: reward,
    });

    const restored = store().games.find((g) => g.id === id)!;
    expect(restored.status).toBe("playing");
    expect(restored.finishedAt).toBeUndefined();
    expect(restored.finishTag).toBe(prevGame.finishTag); // tag chip reverted to its prior value
    expect(restored.finishTag).not.toBe("beaten"); // the auto-assigned finish tag is gone
    expect(store().coins).toBe(coinsBeforeFinish); // coins rolled back exactly

    // The rollback is logged as its own ledger row; the original bounty row stays.
    const [top] = store().ledger;
    expect(top.kind).toBe("undo_finish");
    expect(top.coinDelta).toBe(-reward);
    expect(store().ledger.some((e) => e.kind === "bounty" && e.coinDelta === reward)).toBe(true);
  });

  it("undoAction with no coin delta (retire) restores state without touching the ledger", async () => {
    useStore.setState({ coins: 1000, rotationSlots: 1 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 80, ongoing: true }));
    const id = store().games[0].id;
    await store().enterRotation(id);
    const prevGame = { ...store().games.find((g) => g.id === id)! };
    expect(prevGame.inRotation).toBe(true);

    await store().retireRotation(id);
    expect(store().games.find((g) => g.id === id)!.status).toBe("finished");
    const ledgerLen = store().ledger.length;
    const coins = store().coins;

    await store().undoAction({
      id: null,
      gameId: id,
      action: "retire",
      label: prevGame.title,
      prevGame,
      coinsDelta: 0,
    });

    const restored = store().games.find((g) => g.id === id)!;
    expect(restored.status).toBe("playing");
    expect(restored.inRotation).toBe(true);
    expect(store().coins).toBe(coins);
    expect(store().ledger).toHaveLength(ledgerLen); // no ledger row for a coin-neutral undo
  });

  it("enters the Completionist lane from a playing game and completing pays bounty + Completion Bonus", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1, completionistSlots: 2, completionBonusPct: 50 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id); // Focus
    await store().enterCompletionist(id);
    const c = store().games.find((g) => g.id === id)!;
    expect(c.completionist).toBe(true);
    expect(c.slotId).toBeNull();
    const coinsBefore = store().coins;

    await store().finishGame(id);
    const full = computeFormula(store().games.find((g) => g.id === id)!, store().economy.bounty);
    // First completion: full bounty + 50% completion bonus.
    const expected = full + Math.round(full * 0.5);
    expect(store().coins).toBe(coinsBefore + expected);
    expect(store().games.find((g) => g.id === id)!.completionist).toBe(false);
  });

  it("pulls a finished game back into the Completionist lane; completing pays the bonus only", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1, completionistSlots: 2, completionBonusPct: 50 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id);
    await store().finishGame(id); // first finish pays the full bounty
    const coinsAfterFinish = store().coins;

    await store().enterCompletionist(id); // pulled back, resumed
    expect(store().games.find((g) => g.id === id)!.resumed).toBe(true);

    await store().finishGame(id);
    const full = computeFormula(store().games.find((g) => g.id === id)!, store().economy.bounty);
    // Already finished once → base 0, only the completion bonus.
    expect(store().coins).toBe(coinsAfterFinish + Math.round(full * 0.5));
  });

  it("tags a Focus finish 'beaten' and a completion 'completed'", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1, completionistSlots: 2 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id);
    await store().finishGame(id); // Focus finish
    expect(store().games.find((g) => g.id === id)!.finishTag).toBe("beaten");

    await store().enterCompletionist(id); // pull back to 100%
    await store().finishGame(id); // complete it
    expect(store().games.find((g) => g.id === id)!.finishTag).toBe("completed");
  });

  it("abandonCompletion concludes a previously-finished run to Finished, tags Beaten, pays nothing", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1, completionistSlots: 2 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id);
    await store().finishGame(id); // beaten first
    await store().enterCompletionist(id); // pulled back to 100% (resumed)
    const coinsBefore = store().coins;

    await store().abandonCompletion(id);
    const g = store().games.find((x) => x.id === id)!;
    expect(g.status).toBe("finished");
    expect(g.completionist).toBe(false);
    expect(g.finishTag).toBe("beaten");
    expect(store().coins).toBe(coinsBefore); // zero coins
  });

  it("abandonCompletion is a no-op for a never-beaten game (no premature Finished)", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1, completionistSlots: 2 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id, { kind: "completionist" }); // straight into Completionist, never finished
    expect(store().games.find((g) => g.id === id)!.resumed).not.toBe(true);

    await store().abandonCompletion(id);
    // Still in Completionist — a never-beaten game can't be abandoned to Finished.
    const g = store().games.find((x) => x.id === id)!;
    expect(g.status).toBe("playing");
    expect(g.completionist).toBe(true);
  });

  it("exitCompletionist refuses when the fallback Focus lane is full", async () => {
    // 1 Focus slot: a Focus game fills it, a second game sits in Completionist.
    useStore.setState({ coins: 1000, generalSlots: 1, completionistSlots: 2 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const focusId = store().games[0].id;
    await store().buyGame(focusId); // Focus 1/1, full
    await store().addGame(sampleMeta({ rawgId: 2, hours: 5 }));
    const compId = store().games[0].id;
    await store().buyGame(compId, { kind: "completionist" });

    // Focus is full, so stopping the run can't drop it back — it stays Completionist.
    await store().exitCompletionist(compId);
    expect(store().games.find((g) => g.id === compId)!.completionist).toBe(true);

    // Free the Focus slot → now stopping works.
    await store().finishGame(focusId);
    await store().exitCompletionist(compId);
    expect(store().games.find((g) => g.id === compId)!.completionist).toBe(false);
  });

  it("retireRotation concludes an ongoing game to Finished + Endless (0 coins), preserving a hybrid tag", async () => {
    useStore.setState({ coins: 1000, rotationSlots: 2 });
    // Native ongoing game → Endless on retire.
    await store().addGame(sampleMeta({ rawgId: 1, ongoing: true }));
    const native = store().games[0].id;
    await store().enterRotation(native);
    const before = store().coins;
    await store().retireRotation(native);
    const g1 = store().games.find((x) => x.id === native)!;
    expect(g1.status).toBe("finished");
    expect(g1.finishTag).toBe("endless");
    expect(store().coins).toBe(before);

    // Hybrid: a finished 'beaten' game converted to Endless keeps 'beaten' on retire.
    await store().addGame(sampleMeta({ rawgId: 2, hours: 5 }));
    const hybrid = store().games[0].id;
    useStore.setState({ generalSlots: 1 });
    await store().buyGame(hybrid);
    await store().finishGame(hybrid); // beaten
    await store().convertToEndless(hybrid);
    expect(store().games.find((x) => x.id === hybrid)!.inRotation).toBe(true);
    await store().retireRotation(hybrid);
    expect(store().games.find((x) => x.id === hybrid)!.finishTag).toBe("beaten");
  });

  it("removing a converted game from Rotation restores its pre-lane self (reversion protocol)", async () => {
    useStore.setState({ coins: 1000, rotationSlots: 2, generalSlots: 1 });
    // A standard game: buy → finish (beaten) → convert into the Rotation lane.
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id);
    await store().finishGame(id);
    await store().convertToEndless(id);
    const inLane = store().games.find((g) => g.id === id)!;
    // Conversion stamps provenance and inherits the live-service traits…
    expect(inLane.ongoing).toBe(true);
    expect(inLane.rotationOrigin).toBe("finished");
    expect(inLane.preRotationOngoing).toBe(false);
    // …including the weekly check-in.
    const coinsBefore = store().coins;
    await store().rotationCheckin(id);
    expect(store().coins).toBe(coinsBefore + store().rotationCheckinReward);

    // Removing it returns it to Finished: badge intact, live-service traits shed.
    await store().retireRotation(id);
    const reverted = store().games.find((g) => g.id === id)!;
    expect(reverted.status).toBe("finished");
    expect(reverted.finishTag).toBe("beaten"); // historically earned badge preserved
    expect(reverted.ongoing).toBe(false); // no longer live-service — check-in gone
    expect(reverted.inRotation).toBe(false);
  });

  it("a native live-service game stays ongoing when retired from Rotation", async () => {
    useStore.setState({ coins: 1000, rotationSlots: 2 });
    await store().addGame(sampleMeta({ rawgId: 1, ongoing: true }));
    const id = store().games[0].id;
    await store().enterRotation(id);
    const inLane = store().games.find((g) => g.id === id)!;
    expect(inLane.rotationOrigin).toBe("backlog");
    expect(inLane.preRotationOngoing).toBe(true);

    await store().retireRotation(id);
    const g = store().games.find((x) => x.id === id)!;
    expect(g.status).toBe("finished");
    expect(g.finishTag).toBe("endless");
    expect(g.ongoing).toBe(true); // still live-service — it can re-enter the lane
  });

  it("setFinishTag overrides a finished game's tag", async () => {
    useStore.setState({ coins: 1000, generalSlots: 1 });
    await store().addGame(sampleMeta({ rawgId: 1, hours: 5 }));
    const id = store().games[0].id;
    await store().buyGame(id);
    await store().finishGame(id);
    expect(store().games.find((g) => g.id === id)!.finishTag).toBe("beaten");
    await store().setFinishTag(id, "completed");
    expect(store().games.find((g) => g.id === id)!.finishTag).toBe("completed");
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
    ageLibrary();
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
    ageLibrary();
    await store().buyGame(store().games[0].id);
    const coinsAfterBuy = store().coins;

    await store().logPlaytime(store().games[0].id, 3);

    expect(store().games[0].playedHours).toBe(3);
    expect(store().coins).toBe(coinsAfterBuy); // logging time no longer trickles coins
  });

  it("seeds played hours from the add form and accumulates further logs", async () => {
    await store().addGame(sampleMeta({ playedHours: 20 }));
    expect(store().games[0].playedHours).toBe(20);

    ageLibrary();
    await store().buyGame(store().games[0].id);
    await store().logPlaytime(store().games[0].id, 2.5);
    expect(store().games[0].playedHours).toBe(22.5);
  });

  it("editing playtime after seeding it from the add form replaces, not accumulates", async () => {
    // Regression: time entered while adding a game is one recorded total, so
    // editing it later sets the new value rather than stacking on the seed.
    // (Cloud routes the seed through the played_hours trigger so its event log
    // stays consistent; offline keeps the single field — both must replace.)
    await store().addGame(sampleMeta({ playedHours: 4 }));
    const id = store().games[0].id;
    expect(store().games[0].playedHours).toBe(4);

    await store().editGame(id, { title: "Test Game", copies: [], playedHours: 6 });
    expect(store().games[0].playedHours).toBe(6);
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
    ageLibrary();
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
    ageLibrary();
    await store().buyGame(store().games[0].id);
    const pricePaid = store().games[0].pricePaid!;
    const coinsAfterBuy = store().coins;

    await store().abandonGame(store().games[0].id);

    expect(store().coins).toBe(coinsAfterBuy + computeShelveRefund(pricePaid, 20));
  });

  it("refunds nothing when the shelve refund is set to 0%", async () => {
    await store().setShelveRefundPct(0);
    await store().addGame(sampleMeta());
    ageLibrary();
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

  it("canonicalizes copy platforms to the master list, dropping unknown ones", async () => {
    // The controlled taxonomy: a copy on a known platform is kept (canonicalized),
    // while one on an off-list platform is dropped so it can't reach the backend.
    await store().addGame(
      sampleMeta({
        rawgId: 11,
        copies: [
          { id: "c1", platform: "pc", format: "physical" }, // canonicalizes to "PC"
          { id: "c2", platform: "Bogus Console" }, // not on the list — dropped
        ],
      }),
    );
    const copies = store().games[0].copies ?? [];
    expect(copies.map((c) => c.platform)).toEqual(["PC"]);
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

  it("moves a Bazaar game straight to Finished with a tag and no coin change (ce90383e)", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    const coinsBefore = store().coins;

    await store().bazaarToFinished(id, "completed");
    const g = store().games[0];
    expect(g.status).toBe("finished");
    expect(g.finishTag).toBe("completed");
    expect(g.finishedAt).toBeTruthy();
    expect(g.reward).toBeUndefined(); // nothing earned…
    expect(store().coins).toBe(coinsBefore); // …and nothing spent
  });

  it("bazaarToFinished is a no-op once the game has left the Bazaar", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    await store().bazaarToFinished(id, "beaten");
    const finishedAt = store().games[0].finishedAt;

    // Already Finished — a second call must not re-stamp or change the tag.
    await store().bazaarToFinished(id, "completed");
    expect(store().games[0].finishTag).toBe("beaten");
    expect(store().games[0].finishedAt).toBe(finishedAt);
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

  it("refuses a charter buy that would soft-lock you, but allows it once a game is in play", async () => {
    // One Bazaar game priced at 40 (hours 0), 120 coins, nothing in play: a 100-coin
    // charter would leave 20 < 40 (can't start any game), so the Overdraft Guard blocks it.
    useStore.setState({
      coins: 120,
      games: [
        { id: "g1", title: "Cheap", genres: [], status: "backlog", addedAt: Date.now(), hours: 0 },
      ] as Game[],
    });
    await store().buyCharter();
    expect(store().charters).toBe(0);
    expect(store().coins).toBe(120);

    // With a game actively in play (income coming), the same buy is allowed.
    useStore.setState({
      games: [
        { id: "g1", title: "Cheap", genres: [], status: "backlog", addedAt: Date.now(), hours: 0 },
        { id: "g2", title: "Active", genres: [], status: "playing", addedAt: Date.now(), hours: 5 },
      ] as Game[],
    });
    await store().buyCharter();
    expect(store().charters).toBe(1);
    expect(store().coins).toBe(20);
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
    ageLibrary();
    await store().buyGame(store().games[0].id);

    const raw = localStorage.getItem("backlog-bazaar");
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!);
    expect(saved.games).toHaveLength(1);
    expect(saved.games[0].status).toBe("playing");
    expect(saved.coins).toBe(store().coins);
  });

  it("toggles a game's private flag and persists it", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    expect(store().games[0].private ?? false).toBe(false);

    await store().setGamePrivate(id, true);
    expect(store().games[0].private).toBe(true);
    const saved = JSON.parse(localStorage.getItem("backlog-bazaar")!);
    expect(saved.games[0].private).toBe(true);

    await store().setGamePrivate(id, false);
    expect(store().games[0].private).toBe(false);
  });
});

/** A single-copy container payload (the pre-multi-copy shape most tests use). */
const bundle = (
  totalCost: number,
  over: { title?: string; platform?: string; format?: "physical" | "digital" } = {},
) => ({
  title: over.title ?? "Bundle",
  totalCost,
  copies: [{ platform: over.platform, format: over.format, cost: totalCost }],
});

describe("setGameCopies (offline)", () => {
  it("canonicalizes platforms against the master list and drops off-list copies", async () => {
    await store().addGame(sampleMeta({ rawgId: 9 }));
    const id = store().games[0].id;
    await store().setGameCopies(id, [
      { id: "c1", platform: "pc" }, // wrong case → canonical spelling
      { id: "c2", platform: "Not A Real Platform" }, // off-list → dropped
    ]);
    const copies = store().games[0].copies ?? [];
    expect(copies).toHaveLength(1);
    expect(copies[0].platform).toBe("PC");
  });

  it("keeps cost/format/note intact through canonicalization", async () => {
    await store().addGame(sampleMeta({ rawgId: 9 }));
    const id = store().games[0].id;
    await store().setGameCopies(id, [
      { id: "c1", platform: "PC", format: "digital", cost: 19.99, note: "sale" },
    ]);
    expect(store().games[0].copies).toEqual([
      { id: "c1", platform: "PC", format: "digital", cost: 19.99, note: "sale" },
    ]);
  });
});

describe("enrichImportedGame (offline, 00efda53)", () => {
  it("backfills a plain game's cover + identity + blank length, never clobbering", async () => {
    await store().addGame({ title: "Hades", genres: [], copies: [{ id: "c", platform: "PC" }] });
    const id = store().games[0].id;

    await store().enrichImportedGame(id, {
      title: "Hades",
      genres: [],
      image: "hades.png",
      rawgId: 42,
      hours: 22,
      released: "2020-09-17",
    });
    const g = store().games[0];
    expect(g.id).toBe(id); // same row, enriched in place
    expect(g.image).toBe("hades.png");
    expect(g.stockImage).toBe("hades.png");
    expect(g.originalImage).toBe("hades.png");
    expect(g.rawgId).toBe(42);
    expect(g.hours).toBe(22);
    expect(g.released).toBe("2020-09-17");
    // The imported copy is untouched.
    expect(g.copies?.[0]).toMatchObject({ platform: "PC" });
  });

  it("leaves existing cover, length, and identity alone (gap-fill only)", async () => {
    await store().addGame({
      title: "Hollow Knight",
      genres: [],
      hours: 30,
      image: "mine.png",
      rawgId: 7,
      copies: [],
    });
    const id = store().games[0].id;
    await store().enrichImportedGame(id, {
      title: "Hollow Knight",
      genres: [],
      image: "catalog.png",
      rawgId: 999,
      hours: 99,
    });
    const g = store().games[0];
    expect(g.image).toBe("mine.png"); // kept
    expect(g.rawgId).toBe(7); // kept
    expect(g.hours).toBe(30); // kept
  });
});

describe("compilations (offline)", () => {
  beforeEach(() => {
    useStore.setState({ games: [], compilations: [] });
  });

  it("creates one child game per bundled title with an even cost split", async () => {
    await store().addCompilation(
      bundle(40, { platform: "Nintendo Switch", format: "physical" }),
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
    expect(games.every((g) => g.copies?.[0]?.platform === "Nintendo Switch")).toBe(true);
  });

  it("applies per-game status, overriding the container destination", async () => {
    await store().addCompilation(
      bundle(20),
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

  it("prices a child off its own acquisition date — a bundled old classic is a fresh pickup", async () => {
    // A decades-old game inside a just-recorded collection: its added_at was
    // stamped when the bundle was created (the acquisition), so it carries the
    // full fresh-pickup bonus regardless of its ancient release date.
    await store().addCompilation(
      bundle(0),
      [{ name: "Old Classic", released: "1997-03-01" }, { name: "B" }],
      "backlog",
    );
    const child = store().games.find((g) => g.title === "Old Classic")!;
    expect(child.released).toBe("1997-03-01"); // own date preserved on the row

    const price = computeFormula(child, DEFAULT_PRICE_FORMULA);
    // Full freshness: identical to pricing the same game acquired right now.
    expect(price).toBe(computeFormula({ ...child, addedAt: Date.now() }, DEFAULT_PRICE_FORMULA));
    // And strictly more than it would cost fully aged out of the decay window.
    const aged = computeFormula(
      { ...child, addedAt: Date.now() - 9 * 365.25 * 24 * 60 * 60 * 1000 },
      DEFAULT_PRICE_FORMULA,
    );
    expect(price).toBeGreaterThan(aged);

    useStore.setState({ coins: price + 100 });
    await store().buyGame(child.id);
    const bought = store().games.find((g) => g.id === child.id)!;
    expect(bought.status).toBe("playing");
    expect(bought.pricePaid).toBe(price);
  });

  it("refuses to remove a single child of a compilation", async () => {
    await store().addCompilation(
      bundle(20),
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
      bundle(20),
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
      bundle(40),
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const [a, b] = store().games;

    await store().editCompilation(
      comp.id,
      bundle(30, { title: "Renamed" }),
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
      bundle(30),
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const [a, b] = store().games;

    await store().editCompilation(
      comp.id,
      bundle(30),
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
      bundle(20),
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const a = store().games[0];

    await store().editCompilation(comp.id, bundle(20), [
      { gameId: a.id, name: "A" },
    ]);

    const games = store().games;
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe("A");
    expect(games[0].copies?.[0]?.cost).toBe(20);
  });

  it("collapses and expands a compilation, persisting the flag", async () => {
    await store().addCompilation(
      bundle(20),
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const compId = store().compilations[0].id;
    expect(store().compilations[0].expanded).toBe(true);

    await store().setCompilationExpanded(compId, false);
    expect(store().compilations[0].expanded).toBe(false);
    const saved = JSON.parse(localStorage.getItem("bb-compilations")!);
    expect(saved[0].expanded).toBe(false);

    await store().setCompilationExpanded(compId, true);
    expect(store().compilations[0].expanded).toBe(true);
  });

  it("refuses to collapse while a child is in Now Playing", async () => {
    await store().addCompilation(
      bundle(20),
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const compId = store().compilations[0].id;
    const child = store().games[0];
    useStore.setState({
      games: store().games.map((g) => (g.id === child.id ? { ...g, status: "playing" } : g)),
    });

    await store().setCompilationExpanded(compId, false);
    expect(store().compilations[0].expanded).toBe(true); // unchanged
  });

  it("community-template actions no-op cleanly offline", async () => {
    expect(await store().searchCompilationTemplates("mario")).toEqual([]);
    expect(await store().submitCompilationTemplate({ kind: "new", title: "X", games: [{ name: "A" }] })).toEqual({ ok: false });
    expect(await store().fetchMyCompilationSubmissions()).toEqual([]);
    expect(await store().fetchCompilationSubmissions()).toEqual([]);
  });

  it("persists a child order, keeping only real children in the requested order (140ac868)", async () => {
    await store().addCompilation(bundle(30), [{ name: "A" }, { name: "B" }, { name: "C" }], "backlog");
    const compId = store().compilations[0].id;
    const id = (name: string) => store().games.find((g) => g.title === name)!.id;

    // Reorder to C, A, B — with a stray id that isn't a child of this bundle.
    await store().setCompilationChildOrder(compId, [id("C"), "not-a-child", id("A"), id("B")]);
    expect(store().compilations[0].childOrder).toEqual([id("C"), id("A"), id("B")]);
  });

  it("stamps the as-entered order as childOrder on add — no manual reorder needed (140ac868)", async () => {
    await store().addCompilation(bundle(30), [{ name: "A" }, { name: "B" }, { name: "C" }], "backlog");
    const id = (name: string) => store().games.find((g) => g.title === name)!.id;
    expect(store().compilations[0].childOrder).toEqual([id("A"), id("B"), id("C")]);
  });

  it("rebuilds childOrder from the editor's row order, new games in place (140ac868)", async () => {
    await store().addCompilation(bundle(30), [{ name: "A" }, { name: "B" }], "backlog");
    const comp = store().compilations[0];
    const [a, b] = store().games;

    // Editor rows: B first, the new C in the middle, A last.
    await store().editCompilation(comp.id, bundle(30), [
      { gameId: b.id, name: "B" },
      { name: "C" },
      { gameId: a.id, name: "A" },
    ]);
    const cId = store().games.find((g) => g.title === "C")!.id;
    expect(store().compilations[0].childOrder).toEqual([b.id, cId, a.id]);
  });
});

describe("multi-copy compilations (offline)", () => {
  beforeEach(() => {
    useStore.setState({ games: [], compilations: [] });
  });

  it("gives every child one cost-bearing copy per container copy, cent-exact per copy", async () => {
    await store().addCompilation(
      {
        title: "Bundle",
        totalCost: 80.49,
        copies: [
          { platform: "PlayStation 5", format: "physical", cost: 59.99 },
          { platform: "PC", format: "digital", cost: 20.5 },
        ],
      },
      [{ name: "A" }, { name: "B" }, { name: "C" }],
      "backlog",
    );
    const { games, compilations } = store();
    expect(compilations[0].totalCost).toBeCloseTo(80.49);
    expect(compilations[0].copies).toHaveLength(2);
    expect(games).toHaveLength(3);
    for (const g of games) {
      expect(g.copies).toHaveLength(2);
      expect(g.copies?.[0]?.platform).toBe("PlayStation 5");
      expect(g.copies?.[1]?.platform).toBe("PC");
    }
    // Each copy's child costs sum exactly to that copy's price.
    const centsOf = (v: number | undefined) => Math.round((v ?? 0) * 100);
    const copySum = (k: number) =>
      games.reduce((sum, g) => sum + centsOf(g.copies?.[k]?.cost), 0);
    expect(copySum(0)).toBe(5999);
    expect(copySum(1)).toBe(2050);
  });

  it("fills a typed child's missing release date from the bundle, never a catalog child's", async () => {
    await store().addCompilation(
      {
        title: "Bundle",
        totalCost: 20,
        copies: [{ platform: "PC", cost: 20 }],
        released: "2021-05-14",
      },
      [
        { name: "Typed Game" }, // no date of its own
        { name: "Catalog Game", released: "2007-11-20" },
      ],
      "backlog",
    );
    const byName = (n: string) => store().games.find((g) => g.title === n)!;
    expect(byName("Typed Game").released).toBe("2021-05-14");
    expect(byName("Catalog Game").released).toBe("2007-11-20");
    expect(store().compilations[0].released).toBe("2021-05-14");
  });

  it("editing keeps a child's existing release date even when the bundle date changes", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 20, copies: [{ platform: "PC", cost: 20 }], released: "2021-05-14" },
      [{ name: "A" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const a = store().games[0];
    expect(a.released).toBe("2021-05-14");

    await store().editCompilation(
      comp.id,
      { title: "Bundle", totalCost: 20, copies: [{ platform: "PC", cost: 20 }], released: "2024-01-01" },
      [{ gameId: a.id, name: "A" }],
    );
    expect(store().games[0].released).toBe("2021-05-14"); // filled once, never overwritten
    expect(store().compilations[0].released).toBe("2024-01-01");
  });

  it("adding a copy in an edit cascades the new platform to every child", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 40, copies: [{ platform: "PlayStation 5", cost: 40 }] },
      [{ name: "A" }, { name: "B" }],
      "backlog",
    );
    const comp = store().compilations[0];
    const [a, b] = store().games;

    await store().editCompilation(
      comp.id,
      {
        title: "Bundle",
        totalCost: 60,
        copies: [
          { platform: "PlayStation 5", cost: 40 },
          { platform: "PC", format: "digital", cost: 20 },
        ],
      },
      [{ gameId: a.id, name: "A" }, { gameId: b.id, name: "B" }],
    );

    const after = store();
    expect(after.compilations[0].copies).toHaveLength(2);
    expect(after.compilations[0].totalCost).toBe(60);
    for (const g of after.games) {
      expect(g.copies?.map((c) => c.platform)).toEqual(["PlayStation 5", "PC"]);
      // $40 and $20 each split across 2 children.
      expect(g.copies?.[0]?.cost).toBe(20);
      expect(g.copies?.[1]?.cost).toBe(10);
    }
  });

  it("expanding a two-copy parent carries both copies onto every child", async () => {
    const parent = {
      id: "P",
      title: "Trilogy Collection",
      status: "backlog",
      genres: [],
      platforms: [],
      addedAt: 1,
      rawgId: 111,
      released: "2021-05-14",
      copies: [
        { id: "c1", platform: "PlayStation 5", format: "physical" as const, cost: 50 },
        { id: "c2", platform: "PC", format: "digital" as const, cost: 10 },
      ],
    } as Game;
    useStore.setState({ games: [parent] });
    await store().expandGameToCompilation("P", {
      id: "T1",
      title: "Trilogy Collection",
      games: [{ name: "Part 1" }, { name: "Part 2" }],
      parentCatalogId: "cat-1",
      parentRawgId: 111,
    });

    const { games, compilations } = store();
    expect(compilations[0].copies).toHaveLength(2);
    expect(compilations[0].released).toBe("2021-05-14");
    expect(games).toHaveLength(2);
    for (const g of games) {
      expect(g.copies?.map((c) => c.platform)).toEqual(["PlayStation 5", "PC"]);
      expect(g.copies?.[0]?.cost).toBe(25); // $50 / 2
      expect(g.copies?.[1]?.cost).toBe(5); // $10 / 2
      expect(g.released).toBe("2021-05-14"); // fill-blanks from the parent
    }
  });
});

describe("Family Discount activation (offline)", () => {
  const edition = (over: Partial<Game>): Game =>
    ({
      id: "g",
      title: "Edition",
      status: "backlog",
      genres: [],
      platforms: [],
      released: "2015-01-01",
      hours: 10,
      addedAt: 1,
      ...over,
    }) as Game;

  beforeEach(() => {
    useStore.setState({ games: [], compilations: [] });
  });

  it("buys a sibling edition at the Replay-Bonus percentage and logs the discount ledger row", async () => {
    const bazaar = edition({ id: "a", familyId: "F", title: "Zelda Switch" });
    useStore.setState({
      games: [bazaar, edition({ id: "b", familyId: "F", status: "finished" })],
      coins: 500,
    });
    const full = computeFormula(bazaar, DEFAULT_PRICE_FORMULA);
    const discounted = computeFamilyDiscountPrice(full, store().replayBonusPct);
    expect(discounted).toBeLessThan(full);

    await store().buyGame("a");

    const bought = store().games.find((g) => g.id === "a")!;
    expect(bought.status).toBe("playing");
    expect(bought.pricePaid).toBe(discounted);
    expect(store().coins).toBe(500 - discounted);
    const top = store().ledger[0];
    expect(top.kind).toBe("family_discount_purchase");
    expect(top.coinDelta).toBe(-discounted);
  });

  it("charges full price once the qualifying sibling is gone (derived, not stored)", async () => {
    const bazaar = edition({ id: "a", familyId: "F" });
    useStore.setState({
      games: [bazaar, edition({ id: "b", familyId: "F", status: "finished" })],
      coins: 500,
    });
    await store().removeGame("b"); // also dissolves the 2-member family

    const full = computeFormula(store().games.find((g) => g.id === "a")!, DEFAULT_PRICE_FORMULA);
    await store().buyGame("a");
    expect(store().games.find((g) => g.id === "a")!.pricePaid).toBe(full);
    expect(store().ledger[0].kind).toBe("purchase");
  });
});

describe("removeGame dissolves orphaned families (offline)", () => {
  const edition = (over: Partial<Game>): Game =>
    ({
      id: "g",
      title: "Edition",
      status: "backlog",
      genres: [],
      platforms: [],
      addedAt: 1,
      ...over,
    }) as Game;

  beforeEach(() => {
    useStore.setState({ games: [], compilations: [] });
  });

  it("clears the survivor's family link when a 2-member family loses one", async () => {
    useStore.setState({
      games: [
        edition({ id: "a", familyId: "F", familyName: "Tales of Symphonia" }),
        edition({ id: "b", familyId: "F", familyName: "Tales of Symphonia" }),
      ],
    });
    await store().removeGame("b");
    const survivor = store().games.find((g) => g.id === "a")!;
    expect(survivor.familyId).toBeNull();
    expect(survivor.familyName).toBeUndefined();
  });

  it("leaves a 3-member family intact after one deletion", async () => {
    useStore.setState({
      games: [
        edition({ id: "a", familyId: "F" }),
        edition({ id: "b", familyId: "F" }),
        edition({ id: "c", familyId: "F" }),
      ],
    });
    await store().removeGame("c");
    expect(store().games.every((g) => g.familyId === "F")).toBe(true);
  });

  it("does not touch other games when the deleted game had no family", async () => {
    useStore.setState({
      games: [edition({ id: "a", familyId: "F" }), edition({ id: "b", familyId: "F" }), edition({ id: "x" })],
    });
    await store().removeGame("x");
    expect(store().games.every((g) => g.familyId === "F")).toBe(true);
  });
});

describe("expandGameToCompilation (offline)", () => {
  const template = {
    id: "T1",
    title: "Trilogy Collection",
    games: [{ name: "Part 1" }, { name: "Part 2" }, { name: "Part 3" }],
    parentCatalogId: "cat-1",
    parentRawgId: 111,
  };
  const parent = (over: Partial<Game> = {}): Game =>
    ({
      id: "P",
      title: "Trilogy Collection",
      status: "backlog",
      genres: [],
      platforms: [],
      addedAt: 1,
      rawgId: 111,
      image: "trilogy.png",
      copies: [{ id: "c1", platform: "PlayStation 5", format: "physical", cost: 50 }],
      ...over,
    }) as Game;

  beforeEach(() => {
    useStore.setState({ games: [], compilations: [] });
  });

  it("converts the parent card into a compilation with an even cent split", async () => {
    useStore.setState({ games: [parent()] });
    await store().expandGameToCompilation("P", template);

    const { games, compilations } = store();
    expect(games.find((g) => g.id === "P")).toBeUndefined(); // parent card gone
    expect(compilations).toHaveLength(1);
    expect(compilations[0].title).toBe("Trilogy Collection");
    expect(compilations[0].totalCost).toBe(50);
    expect(compilations[0].templateId).toBe("T1");
    expect(compilations[0].parentImage).toBe("trilogy.png");
    expect(compilations[0].expanded).toBe(true);

    expect(games).toHaveLength(3);
    // $50 / 3 = $16.67 + $16.67 + $16.66 — the split sums exactly to the total.
    const cents = games.map((g) => Math.round((g.copies?.[0]?.cost ?? 0) * 100));
    expect(cents.reduce((a, b) => a + b, 0)).toBe(5000);
    expect(Math.max(...cents) - Math.min(...cents)).toBeLessThanOrEqual(1);
    expect(games.every((g) => g.compilationId === compilations[0].id)).toBe(true);
    expect(games.every((g) => g.copies?.[0]?.platform === "PlayStation 5")).toBe(true);
    expect(games.every((g) => g.status === "backlog")).toBe(true);
  });

  it("banks the parent's logged hours as bundle-level carryover", async () => {
    useStore.setState({ games: [parent({ playedHours: 12.5 })] });
    await store().expandGameToCompilation("P", template);
    expect(store().compilations[0].carryoverHours).toBe(12.5);
    expect(store().games.every((g) => (g.playedHours ?? 0) === 0)).toBe(true);
  });

  it("stamps the template's order as the bundle's childOrder (140ac868)", async () => {
    useStore.setState({ games: [parent()] });
    await store().expandGameToCompilation("P", template);
    const id = (name: string) => store().games.find((g) => g.title === name)!.id;
    expect(store().compilations[0].childOrder).toEqual([id("Part 1"), id("Part 2"), id("Part 3")]);
  });

  it("canonicalizes template metadata — off-list platform spellings drop (955090f2)", async () => {
    useStore.setState({
      games: [parent()],
      platformList: ["PC", "Xbox Series X/S"],
      genreList: ["Shooter"],
    });
    await store().expandGameToCompilation("P", {
      ...template,
      games: [
        // RAWG's 'Xbox Series S/X' spelling isn't on the master list; 'pc'
        // maps to the master casing.
        { name: "Part 1", platforms: ["Xbox Series S/X", "pc"], genres: ["Shooter", "Unknown Genre"] },
      ],
    });
    const child = store().games.find((g) => g.title === "Part 1")!;
    expect(child.platforms).toEqual(["PC"]);
    expect(child.genres).toEqual(["Shooter"]);
  });

  it("refunds a started parent's activation fee in full", async () => {
    const before = store().coins;
    useStore.setState({ games: [parent({ status: "playing", pricePaid: 30 })] });
    await store().expandGameToCompilation("P", template);
    expect(store().coins).toBe(before + 30);
    expect(store().ledger[0]?.kind).toBe("expand_refund");
    expect(store().ledger[0]?.coinDelta).toBe(30);
  });

  it("does not refund an unstarted (backlog) parent", async () => {
    const before = store().coins;
    useStore.setState({ games: [parent()] });
    await store().expandGameToCompilation("P", template);
    expect(store().coins).toBe(before);
    expect(store().ledger.some((e) => e.kind === "expand_refund")).toBe(false);
  });

  it("gives a finished parent finished children (its earned reward stands)", async () => {
    useStore.setState({ games: [parent({ status: "finished", finishedAt: 123 })] });
    await store().expandGameToCompilation("P", template);
    expect(store().games.every((g) => g.status === "finished")).toBe(true);
    expect(store().games.every((g) => g.finishedAt === 123)).toBe(true);
  });

  it("refuses wishlist parents and rows already inside a compilation", async () => {
    useStore.setState({ games: [parent({ status: "wishlist" })] });
    await store().expandGameToCompilation("P", template);
    expect(store().compilations).toHaveLength(0);
    expect(store().games).toHaveLength(1);

    useStore.setState({ games: [parent({ compilationId: "other" })], compilations: [] });
    await store().expandGameToCompilation("P", template);
    expect(store().compilations).toHaveLength(0);
  });

  it("persists both mirrors (games + compilations)", async () => {
    useStore.setState({ games: [parent()] });
    await store().expandGameToCompilation("P", template);
    const savedGames = JSON.parse(localStorage.getItem("backlog-bazaar")!);
    const savedComps = JSON.parse(localStorage.getItem("bb-compilations")!);
    expect(savedGames.games).toHaveLength(3);
    expect(savedComps).toHaveLength(1);
    expect(savedComps[0].carryoverHours).toBe(0);
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

describe("rotationCheckin", () => {
  const rotationGame = (inRotation: boolean): Game =>
    ({
      id: "g-rot",
      title: "Hearthstone",
      status: "playing",
      genres: [],
      addedAt: 1,
      slotId: null,
      inRotation,
    }) as Game;

  it("credits the reward once and blocks a second check-in this period", async () => {
    useStore.setState({
      coins: 100,
      rotationCheckinReward: 3,
      rotationCheckedIn: [],
      games: [rotationGame(true)],
    });

    await store().rotationCheckin("g-rot");
    expect(store().coins).toBe(103);
    expect(store().rotationCheckedIn).toContain("g-rot");

    // Already checked in this weekly period → no further coins.
    await store().rotationCheckin("g-rot");
    expect(store().coins).toBe(103);
  });

  it("ignores a game that isn't in the Rotation lane", async () => {
    useStore.setState({
      coins: 100,
      rotationCheckinReward: 3,
      rotationCheckedIn: [],
      games: [rotationGame(false)], // playing in a focus slot, not Rotation
    });

    await store().rotationCheckin("g-rot");
    expect(store().coins).toBe(100);
    expect(store().rotationCheckedIn).not.toContain("g-rot");
  });
});

describe("enterRotation / exitRotation", () => {
  it("starts an ongoing backlog game into the lane for free (no coins spent)", async () => {
    useStore.setState({
      coins: 100,
      rotationSlots: 3,
      games: [
        { id: "g1", title: "Hearthstone", status: "backlog", ongoing: true, genres: [], addedAt: 1 } as Game,
      ],
    });
    await store().enterRotation("g1");
    const g = store().games.find((x) => x.id === "g1")!;
    expect(g.status).toBe("playing");
    expect(g.inRotation).toBe(true);
    expect(g.slotId).toBeNull();
    expect(g.pricePaid).toBe(0);
    expect(store().coins).toBe(100); // free — no coins moved
  });

  it("refuses a non-ongoing game (Rotation is live-service only)", async () => {
    useStore.setState({
      rotationSlots: 3,
      games: [
        { id: "n1", title: "Celeste", status: "backlog", ongoing: false, genres: [], addedAt: 1 } as Game,
      ],
    });
    await store().enterRotation("n1");
    expect(store().games.find((x) => x.id === "n1")!.status).toBe("backlog");
  });

  it("never refuses on occupancy — the lane is uncapped (issue 2a435c06)", async () => {
    // The legacy per-user cap (rotationSlots) is ignored: a lane already
    // holding a game accepts the next one all the same.
    useStore.setState({
      rotationSlots: 1,
      games: [
        { id: "a", title: "MTGA", status: "playing", inRotation: true, ongoing: true, genres: [], addedAt: 1 } as Game,
        { id: "b", title: "Pokémon", status: "backlog", ongoing: true, genres: [], addedAt: 1 } as Game,
      ],
    });
    await store().enterRotation("b");
    const b = store().games.find((x) => x.id === "b")!;
    expect(b.status).toBe("playing");
    expect(b.inRotation).toBe(true);
  });

  it("exitRotation returns an in-rotation game to parked (backlog), free", async () => {
    useStore.setState({
      rotationSlots: 3,
      games: [
        { id: "g1", title: "Hearthstone", status: "playing", inRotation: true, ongoing: true, genres: [], addedAt: 1 } as Game,
      ],
    });
    await store().exitRotation("g1");
    const g = store().games.find((x) => x.id === "g1")!;
    expect(g.status).toBe("backlog");
    expect(g.inRotation).toBe(false);
  });
});

describe("social — activity feed cheers (optimistic)", () => {
  const feedEvent = (over: Partial<import("./types").ActivityEvent> = {}) => ({
    id: "a1",
    actor: "u2",
    actorName: "Pat",
    actorAvatar: null,
    kind: "bounty_claimed" as const,
    gameTitle: "Hollow Knight",
    detail: {},
    createdAt: Date.now(),
    cheerCount: 2,
    cheeredByMe: false,
    ...over,
  });

  it("cheering bumps the count and lights up immediately (before any network)", async () => {
    useStore.setState({ feed: [feedEvent()] });
    await store().cheerActivity("a1");
    const e = store().feed[0];
    expect(e.cheeredByMe).toBe(true);
    expect(e.cheerCount).toBe(3);
  });

  it("cheering an already-cheered post does not double-count", async () => {
    useStore.setState({ feed: [feedEvent({ cheeredByMe: true, cheerCount: 5 })] });
    await store().cheerActivity("a1");
    expect(store().feed[0].cheerCount).toBe(5);
  });

  it("un-cheering removes the cheer and decrements (never below zero)", async () => {
    useStore.setState({ feed: [feedEvent({ cheeredByMe: true, cheerCount: 1 })] });
    await store().uncheerActivity("a1");
    const e = store().feed[0];
    expect(e.cheeredByMe).toBe(false);
    expect(e.cheerCount).toBe(0);
  });
});

describe("rotation lane — re-entry from Finished (retired endless games)", () => {
  it("lets a finished ongoing game re-enter the Rotation lane", async () => {
    useStore.setState({
      cloud: false,
      rotationSlots: 2,
      games: [
        {
          id: "g1",
          title: "Warframe",
          genres: [],
          status: "finished",
          ongoing: true,
          inRotation: false,
          finishTag: "endless",
          finishedAt: Date.now(),
          reward: 0,
          addedAt: Date.now(),
        } as unknown as Game,
      ],
    });
    await store().enterRotation("g1");
    const g = store().games.find((x) => x.id === "g1")!;
    expect(g.status).toBe("playing");
    expect(g.inRotation).toBe(true);
    expect(g.finishedAt).toBeUndefined();
  });
});

describe("social — messaging (conversation/thread, optimistic)", () => {
  const conv = (over: Partial<import("./types").Conversation> = {}) => ({
    otherId: "u2",
    otherName: "Pat",
    otherAvatar: null,
    lastBody: "hi",
    lastOutgoing: false,
    lastCreatedAt: Date.now(),
    lastDeleted: false,
    unreadCount: 2,
    archived: false,
    ...over,
  });
  const msg = (over: Partial<import("./types").Message> = {}) => ({
    id: "m1",
    sender: "u2",
    recipient: "me",
    outgoing: false,
    otherId: "u2",
    otherName: "Pat",
    otherAvatar: null,
    body: "hi",
    gameId: null,
    gameTitle: null,
    gameImage: null,
    readAt: null,
    createdAt: Date.now(),
    editedAt: null,
    deleted: false,
    images: [],
    reactions: {},
    myReactions: [],
    quoted: null,
    ...over,
  });

  it("reading a thread marks it read, zeroes the conversation, and drops the badge by its unread", async () => {
    useStore.setState({
      thread: [msg(), msg({ id: "m2" })],
      conversations: [conv({ unreadCount: 2 })],
      unreadMessageCount: 5,
    });
    await store().markThreadRead("u2");
    expect(store().thread.every((m) => m.readAt != null)).toBe(true);
    expect(store().conversations[0].unreadCount).toBe(0);
    expect(store().unreadMessageCount).toBe(3);
  });

  it("does not mark outgoing thread messages as newly read", async () => {
    const sent = msg({ id: "m3", outgoing: true, sender: "me", recipient: "u2", readAt: null });
    useStore.setState({
      thread: [sent],
      conversations: [conv({ unreadCount: 0 })],
      unreadMessageCount: 0,
    });
    await store().markThreadRead("u2");
    expect(store().thread[0].readAt).toBeNull();
  });

  it("archiving flips the conversation's archived flag optimistically", async () => {
    useStore.setState({ conversations: [conv()] });
    await store().archiveConversation("u2", true);
    expect(store().conversations[0].archived).toBe(true);
  });

  it("removing a chat drops it from the list (history preserved server-side)", async () => {
    useStore.setState({ conversations: [conv(), conv({ otherId: "u3", otherName: "Lee" })] });
    await store().removeConversation("u2");
    expect(store().conversations.map((c) => c.otherId)).toEqual(["u3"]);
  });

  it("editing a thread message updates its body and sets an edited marker", async () => {
    useStore.setState({ thread: [msg({ id: "m9", outgoing: true, body: "helo" })] });
    await store().editMessage("m9", "hello");
    expect(store().thread[0].body).toBe("hello");
    expect(store().thread[0].editedAt).not.toBeNull();
  });

  it("deleting a thread message tombstones it for everyone", async () => {
    useStore.setState({ thread: [msg({ id: "m9", outgoing: true, body: "oops" })] });
    await store().deleteMessage("m9");
    expect(store().thread[0].deleted).toBe(true);
    expect(store().thread[0].body).toBe("");
  });

  it("toggling a reaction on adds it to the tally and my-reactions optimistically", async () => {
    useStore.setState({ thread: [msg({ id: "m9" })] });
    await store().toggleMessageReaction("m9", "👍", true);
    expect(store().thread[0].reactions).toEqual({ "👍": 1 });
    expect(store().thread[0].myReactions).toEqual(["👍"]);
  });

  it("toggling off your sole reaction removes it from the tally and my-reactions", async () => {
    useStore.setState({
      thread: [msg({ id: "m9", reactions: { "👍": 1 }, myReactions: ["👍"] })],
    });
    await store().toggleMessageReaction("m9", "👍", false);
    expect(store().thread[0].reactions["👍"]).toBeUndefined();
    expect(store().thread[0].myReactions).toEqual([]);
  });

  it("toggling off your reaction keeps others' tally", async () => {
    useStore.setState({
      thread: [msg({ id: "m9", reactions: { "👍": 2 }, myReactions: ["👍"] })],
    });
    await store().toggleMessageReaction("m9", "👍", false);
    expect(store().thread[0].reactions["👍"]).toBe(1);
    expect(store().thread[0].myReactions).toEqual([]);
  });
});

describe("reporting (offline guards)", () => {
  it("submitReport is a no-op that returns false in local mode", async () => {
    const ok = await store().submitReport({
      reportedUser: "u1",
      kind: "user",
      reason: "spam",
    });
    expect(ok).toBe(false);
  });

  it("fetchReports returns [] without the reports.moderate permission", async () => {
    const rows = await store().fetchReports();
    expect(rows).toEqual([]);
  });

  it("resolveReport returns false without the reports.moderate permission", async () => {
    const ok = await store().resolveReport(
      // a minimal Report shape is enough for the guard to bail early
      { id: "r1", reportedUser: "u1", gameId: null } as never,
      "dismiss",
    );
    expect(ok).toBe(false);
  });
});

describe("taxonomy replace (offline guards)", () => {
  it("replacePlatform is a no-op that returns false in local mode", async () => {
    expect(await store().replacePlatform("PS5", "PlayStation 5")).toBe(false);
  });

  it("replaceGenre is a no-op that returns false in local mode", async () => {
    expect(await store().replaceGenre("RPG", "Role-playing")).toBe(false);
  });

  it("rejects a same-term replacement before any backend call", async () => {
    // Case-insensitive equality guard — never tries to replace a term with itself.
    expect(await store().replacePlatform("PC", "pc")).toBe(false);
    expect(await store().replaceGenre("", "Action")).toBe(false);
  });
});

describe("account danger zone (guest)", () => {
  it("freshStart resets the guest collection + economy to day one", async () => {
    await store().addGame(sampleMeta({ rawgId: 7 }));
    await store().addGame(sampleMeta({ rawgId: 8, title: "Second Game" }));
    useStore.setState({
      coins: 42,
      charters: 3,
      vouchers: 1,
      compilations: [
        { id: "comp1", title: "Trilogy" } as unknown as import("./types").Compilation,
      ],
      myPlatforms: ["PC"],
      customPlatforms: ["Steam Deck"],
      hiddenMarket: [99],
      trackEditions: true,
    });
    localStorage.setItem("bb-platforms", JSON.stringify(["PC"]));
    localStorage.setItem("bb-hidden-market", JSON.stringify([99]));

    expect(await store().freshStart()).toBe(true);

    const s = store();
    expect(s.coins).toBe(STARTING_COINS);
    expect(s.charters).toBe(0);
    expect(s.vouchers).toBe(0);
    expect(s.games).toEqual([]);
    expect(s.compilations).toEqual([]);
    expect(s.myPlatforms).toEqual([]);
    expect(s.customPlatforms).toEqual([]);
    expect(s.hiddenMarket).toEqual([]);
    expect(s.trackEditions).toBe(false);
    // The ledger restarts at the opening baseline, like a brand-new account.
    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0].kind).toBe("opening");
    expect(s.ledger[0].coinBalanceAfter).toBe(STARTING_COINS);
    // The guest persistence keys are gone.
    expect(localStorage.getItem("backlog-bazaar")).toBeNull();
    expect(localStorage.getItem("bb-platforms")).toBeNull();
    expect(localStorage.getItem("bb-hidden-market")).toBeNull();
  });

  it("deleteMyAccount is a cloud-only no-op in guest mode", async () => {
    expect(await store().deleteMyAccount()).toBe(false);
  });
});

describe("onboarding vouchers — claim & compat grant (offline)", () => {
  it("claimOnboardingVouchers is a guest no-op (the tutorial is cloud-only)", async () => {
    useStore.setState({
      vouchers: 0,
      onboardingVouchers: 2,
      onboardingVouchersPending: true,
      onboardingVouchersGrantedAt: null,
    });
    await store().claimOnboardingVouchers();
    expect(store().vouchers).toBe(0);
    expect(store().onboardingVouchersGrantedAt).toBeNull();
  });

  it("completeOnboarding still grants on a skip that never reached the checklist", async () => {
    useStore.setState({
      onboardingCompletedAt: null,
      onboardingVouchersPending: true,
      onboardingVouchersGrantedAt: null,
      onboardingVouchers: 2,
      vouchers: 0,
    });
    await store().completeOnboarding();
    const s = store();
    expect(s.vouchers).toBe(2);
    expect(s.onboardingVouchersPending).toBe(false);
    expect(s.onboardingVouchersGrantedAt).not.toBeNull();
    expect(s.onboardingCompletedAt).not.toBeNull();
  });

  it("completeOnboarding never re-grants once the up-front claim happened", async () => {
    useStore.setState({
      onboardingCompletedAt: null,
      onboardingVouchersPending: true,
      onboardingVouchersGrantedAt: 123,
      onboardingVouchers: 2,
      vouchers: 2,
    });
    await store().completeOnboarding();
    const s = store();
    expect(s.vouchers).toBe(2); // no double grant
    expect(s.onboardingVouchersPending).toBe(false);
    expect(s.onboardingCompletedAt).not.toBeNull();
  });
});

describe("pre-orders (offline twin of the Bazaar-locked marker)", () => {
  it("marks a Bazaar card, keeps its placed time on a re-date, and unlocks in place", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;

    await store().setPreorder(id, "2026-09-01");
    const marked = store().games[0];
    expect(marked.preorderedAt).toBeTruthy();
    expect(marked.preorderExpectedOn).toBe("2026-09-01");
    expect(marked.status).toBe("backlog"); // a pre-order IS part of the collection

    // A re-date changes the date, not when the pre-order was placed.
    const placedAt = marked.preorderedAt;
    await store().setPreorder(id, "2026-10-15");
    expect(store().games[0].preorderedAt).toBe(placedAt);
    expect(store().games[0].preorderExpectedOn).toBe("2026-10-15");

    // The release unlock clears the marker in place — no board move.
    await store().fulfillPreorder(id);
    expect(store().games[0].preorderedAt).toBeNull();
    expect(store().games[0].preorderExpectedOn).toBeNull();
    expect(store().games[0].status).toBe("backlog");
  });

  it("refuses to mark anything that isn't in the Bazaar", async () => {
    await store().addGame(sampleMeta(), "wishlist");
    const id = store().games[0].id;
    await store().setPreorder(id, "2026-09-01");
    expect(store().games[0].preorderedAt).toBeUndefined();
  });

  it("a locked pre-order can't be bought before release", async () => {
    await store().addGame(sampleMeta());
    ageLibrary();
    const id = store().games[0].id;
    await store().setPreorder(id, "2099-12-01");

    await store().buyGame(id);
    expect(store().games[0].status).toBe("backlog"); // still locked in place
    expect(store().coins).toBe(STARTING_COINS); // nothing was charged

    // Unlocked, the same card starts normally.
    await store().fulfillPreorder(id);
    await store().buyGame(id);
    expect(store().games[0].status).toBe("playing");
  });

  it("cancel-to-Wishlist demotes the card to a plain want", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    await store().setPreorder(id, "2026-09-01");

    await store().cancelPreorder(id, "wishlist");
    const g = store().games[0];
    expect(g.status).toBe("wishlist");
    expect(g.preorderedAt).toBeNull();
    expect(g.preorderExpectedOn).toBeNull();
  });

  it("cancel-and-remove deletes the card outright", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    await store().setPreorder(id, "2026-09-01");

    await store().cancelPreorder(id, "remove");
    expect(store().games).toHaveLength(0);
  });

  it("addGame lands a marked pre-order straight in the Bazaar", async () => {
    await store().addGame(sampleMeta(), "backlog", null, {
      preorder: { expectedOn: "2026-11-01" },
    });
    const g = store().games[0];
    expect(g.status).toBe("backlog");
    expect(g.preorderedAt).toBeTruthy();
    expect(g.preorderExpectedOn).toBe("2026-11-01");

    // The marker is Bazaar-only: a wishlist add ignores the option.
    await store().addGame(sampleMeta({ rawgId: 9, title: "Want" }), "wishlist", null, {
      preorder: { expectedOn: "2026-11-01" },
    });
    const want = store().games.find((g2) => g2.title === "Want")!;
    expect(want.preorderedAt).toBeUndefined();
  });
});

describe("pre-orders via wishlist import (issue fe5f7f54, offline twin)", () => {
  const futureRelease = "2099-06-01";

  async function addWishlistPreorderable() {
    await store().addGame(sampleMeta({ released: futureRelease }), "wishlist");
    useStore.setState({ charters: 1 });
    return store().games[0].id;
  }

  it("intercepts an import of a not-yet-released game into the prompt — nothing spent yet", async () => {
    const id = await addWishlistPreorderable();
    await store().importWithCharter(id);
    const s = store();
    expect(s.preorderImportPromptId).toBe(id);
    expect(s.games[0].status).toBe("wishlist"); // untouched until the answer
    expect(s.charters).toBe(1);

    store().closePreorderImportPrompt();
    expect(store().preorderImportPromptId).toBeNull();
  });

  it("released-already games import straight through with no prompt", async () => {
    await store().addGame(sampleMeta({ released: "2020-01-01" }), "wishlist");
    useStore.setState({ charters: 1 });
    const id = store().games[0].id;
    await store().importWithCharter(id);
    expect(store().preorderImportPromptId).toBeNull();
    expect(store().games[0].status).toBe("backlog");
    expect(store().games[0].preorderedAt).toBeUndefined();
  });

  it("confirming lands the game as a locked, charter-funded pre-order (one charter spent)", async () => {
    const id = await addWishlistPreorderable();
    await store().importWithCharter(id, {
      preorder: { expectedOn: futureRelease, copies: [{ id: "c1", platform: "", cost: 69.99 }] },
    });
    const s = store();
    const g = s.games[0];
    expect(g.status).toBe("backlog");
    expect(g.preorderedAt).toBeTruthy();
    expect(g.preorderExpectedOn).toBe(futureRelease);
    expect(g.preorderCharter).toBe(true);
    expect(g.copies?.[0]?.cost).toBe(69.99);
    expect(s.charters).toBe(0);
    expect(s.ledger[0].kind).toBe("charter_consume");
  });

  it("answering 'just import it' runs the plain import", async () => {
    const id = await addWishlistPreorderable();
    await store().importWithCharter(id, { preorder: "skip" });
    const g = store().games[0];
    expect(g.status).toBe("backlog");
    expect(g.preorderedAt).toBeUndefined();
    expect(store().charters).toBe(0);
  });

  it("cancel-to-Wishlist of a charter-funded pre-order refunds the charter (the exact reverse of the import)", async () => {
    const id = await addWishlistPreorderable();
    await store().importWithCharter(id, { preorder: { expectedOn: futureRelease } });
    expect(store().charters).toBe(0);

    await store().cancelPreorder(id, "wishlist");
    const s = store();
    expect(s.games[0].status).toBe("wishlist");
    expect(s.games[0].preorderCharter).toBe(false);
    expect(s.charters).toBe(1);
    expect(s.ledger[0].kind).toBe("charter_refund");
    expect(s.ledger[0].charterDelta).toBe(1);
  });

  it("cancel-and-remove of a charter-funded pre-order also refunds the charter", async () => {
    const id = await addWishlistPreorderable();
    await store().importWithCharter(id, { preorder: { expectedOn: futureRelease } });

    await store().cancelPreorder(id, "remove");
    const s = store();
    expect(s.games).toHaveLength(0);
    expect(s.charters).toBe(1);
    expect(s.ledger[0].kind).toBe("charter_refund");
  });

  it("cancelling a hand-marked pre-order (no charter behind it) refunds nothing", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    await store().setPreorder(id, "2099-06-01");

    await store().cancelPreorder(id, "wishlist");
    expect(store().charters).toBe(0);
    expect(store().ledger.find((e) => e.kind === "charter_refund")).toBeUndefined();
  });

  it("merge-on-import is exempt from the prompt — an owned card can't become a pre-order", async () => {
    await store().addGame(
      sampleMeta({ rawgId: 7, copies: [{ id: "c1", platform: "PC", format: "digital" }] }),
    );
    await store().addGame(
      sampleMeta({
        rawgId: 7,
        released: futureRelease,
        copies: [{ id: "c2", platform: "PC", format: "physical" }],
      }),
      "wishlist",
    );
    useStore.setState({ charters: 1 });
    const wish = store().games.find((g) => g.status === "wishlist")!;
    await store().importWithCharter(wish.id);
    const s = store();
    expect(s.preorderImportPromptId).toBeNull();
    expect(s.games).toHaveLength(1); // merged, not prompted
    expect(s.games[0].preorderedAt).toBeUndefined();
    expect(s.charters).toBe(0);
  });
});
