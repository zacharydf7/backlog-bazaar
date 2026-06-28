import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import { STARTING_COINS, SHELVE, computeShelveRefund, computeReplayBonus } from "./lib/pricing";
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

describe("compilations (offline)", () => {
  beforeEach(() => {
    useStore.setState({ games: [], compilations: [] });
  });

  it("creates one child game per bundled title with an even cost split", async () => {
    await store().addCompilation(
      { title: "Bundle", totalCost: 40, platform: "Nintendo Switch", format: "physical" },
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

  it("refuses to add when the lane is full", async () => {
    useStore.setState({
      rotationSlots: 1,
      games: [
        { id: "a", title: "MTGA", status: "playing", inRotation: true, ongoing: true, genres: [], addedAt: 1 } as Game,
        { id: "b", title: "Pokémon", status: "backlog", ongoing: true, genres: [], addedAt: 1 } as Game,
      ],
    });
    await store().enterRotation("b");
    expect(store().games.find((x) => x.id === "b")!.status).toBe("backlog");
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
