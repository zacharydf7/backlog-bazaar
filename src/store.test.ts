import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./store";
import {
  STARTING_COINS,
  SHELVE,
  computePrice,
  computeReward,
  computeShelveRefund,
  computeTrickle,
} from "./lib/pricing";
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
    games: [],
    error: null,
    notice: null,
    shelveRefundPct: SHELVE.defaultPct,
    generalSlots: DEFAULT_GENERAL_SLOTS,
    myTargetedSlots: [],
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
    const price = computePrice(game);

    await store().buyGame(game.id);

    expect(store().coins).toBe(STARTING_COINS - price);
    const g = store().games[0];
    expect(g.status).toBe("playing");
    expect(g.pricePaid).toBe(price);
    expect(g.startedAt).toBeTypeOf("number");
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
    const reward = computeReward();

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

  it("logs play time: adds hours and trickles coins for a playing game", async () => {
    await store().addGame(sampleMeta());
    await store().buyGame(store().games[0].id);
    const coinsAfterBuy = store().coins;

    await store().logPlaytime(store().games[0].id, 3);

    expect(store().games[0].playedHours).toBe(3);
    expect(store().coins).toBe(coinsAfterBuy + computeTrickle(3));
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

  it("snaps edited playtime to half-hours and clamps negatives to zero", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;

    await store().setPlayedHours(id, 3.7);
    expect(store().games[0].playedHours).toBe(3.5);

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

  it("removes a game", async () => {
    await store().addGame(sampleMeta());
    await store().removeGame(store().games[0].id);
    expect(store().games).toHaveLength(0);
  });

  it("moves a backlog game to the wishlist and back", async () => {
    await store().addGame(sampleMeta());
    const id = store().games[0].id;
    expect(store().games[0].status).toBe("backlog");

    await store().bazaarToWishlist(id);
    expect(store().games[0].status).toBe("wishlist");

    await store().wishlistToBazaar(id);
    expect(store().games[0].status).toBe("backlog");
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
