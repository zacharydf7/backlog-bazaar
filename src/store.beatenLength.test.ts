import { describe, it, expect, beforeEach } from "vitest";
import type { Game } from "./types";
import { useStore } from "./store";
import {
  DEFAULT_PRICE_FORMULA,
  computeFormula,
  cloneFormula,
  lengthActivationFee,
} from "./lib/economy";

// A plain finish of a game set to its completionist length pays as the main +
// extras game it was played as (coin outliers, 2026-10-17): the run settles to
// that length first — the extra activation fee refunded — and the bounty reads
// the shorter length. Exercised offline, where finishGame mirrors the server.
const store = () => useStore.getState();

const tiers = { main: 16, mainExtra: 50, completionist: 130 };

function game(over: Partial<Game> = {}): Game {
  return {
    id: "gb",
    title: "Granblue Fantasy: Relink",
    status: "playing",
    addedAt: Date.now(),
    startedAt: Date.now(),
    genres: [],
    hours: 130,
    lengthTiers: tiers,
    pricePaid: 530,
    playedHours: 40,
    ...over,
  } as Game;
}

// The live economy weights length into both the fee and the bounty.
// The bounty out-pays the fee, as it does live (Granblue: 530 to start, 813 out).
const bounty = { ...cloneFormula(DEFAULT_PRICE_FORMULA), base: 300 };
bounty.factors.recency = { ...bounty.factors.recency, enabled: false };

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    economy: { price: DEFAULT_PRICE_FORMULA, bounty },
    cloud: false,
    userId: null,
    economyEnabled: true,
    coins: 1000,
    ledger: [],
    clearStreak: 0,
    clearStreakBest: 0,
  });
});

describe("Beaten finishes pay on main + extras", () => {
  it("refunds the extra length fee and pays the bounty on 50h", async () => {
    useStore.setState({ games: [game()] });
    const { economy } = store();
    const refund = lengthActivationFee(economy.price, 130) - lengthActivationFee(economy.price, 50);
    expect(refund).toBeGreaterThan(0);
    const paid = computeFormula(game({ personalHours: 50 }), economy.bounty);

    await store().finishGame("gb");

    const done = store().games[0];
    expect(done.personalHours).toBe(50);
    expect(done.reward).toBe(paid);
    expect(store().coins).toBe(1000 + refund + paid);
    // Strictly less than the completionist-length bounty it would have paid.
    expect(paid).toBeLessThan(computeFormula(game(), economy.bounty));
  });

  it("with nothing logged, returns exactly the activation cost — never more (regression)", async () => {
    // Lowering the length refunds part of the fee; the finish's refund floor
    // must not pay that part back a second time.
    useStore.setState({ games: [game({ playedHours: 0 })], bountyGatePct: 25 });
    await store().finishGame("gb");
    expect(store().coins).toBe(1000 + 530);
    const done = store().games[0];
    expect(done.pricePaid).toBeLessThan(530);
    expect(done.bountyHeld).toBeGreaterThan(0);
  });

  it("refunds a shelve after a length cut only for what's still paid", async () => {
    useStore.setState({ games: [game()] });
    const { economy } = store();
    const cut = lengthActivationFee(economy.price, 130) - lengthActivationFee(economy.price, 50);
    await store().setPersonalLength("gb", 50);
    expect(store().games[0].pricePaid).toBe(530 - cut);
    await store().abandonGame("gb");
    // The length cut plus the shelve together return the 530 paid, once.
    expect(store().coins).toBe(1000 + 530);
  });

  it("pays a completionist run on its full length", async () => {
    useStore.setState({ games: [game({ completionist: true })] });
    await store().finishGame("gb");
    expect(store().games[0].personalHours).toBeUndefined();
  });

  it("leaves a game without saved length options as it was", async () => {
    useStore.setState({ games: [game({ lengthTiers: undefined })] });
    await store().finishGame("gb");
    expect(store().games[0].personalHours).toBeUndefined();
  });
});
