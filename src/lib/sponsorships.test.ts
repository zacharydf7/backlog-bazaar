import { describe, expect, it } from "vitest";
import {
  activeBackersFor,
  backersTooltip,
  coerceSponsorship,
  expiryLabel,
  myActiveStakeOn,
  pairBudgetUsed,
  soonestExpiry,
  totalStaked,
  validateStake,
  type Sponsorship,
} from "./sponsorships";

const NOW = Date.parse("2026-07-18T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function stake(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: "s" + Math.random().toString(36).slice(2, 7),
    sponsor: "me",
    recipient: "friend",
    sponsorName: "Sarah",
    recipientName: "Ben",
    gameId: "g1",
    gameTitle: "Outer Wilds",
    amount: 30,
    status: "active",
    createdAt: NOW - DAY,
    expiresAt: NOW + 12 * DAY,
    resolvedAt: null,
    ...over,
  };
}

describe("coerceSponsorship", () => {
  it("coerces a full RPC row", () => {
    const s = coerceSponsorship({
      id: "s1",
      sponsor: "u1",
      recipient: "u2",
      sponsor_name: "Sarah",
      recipient_name: "Ben",
      game_id: "g1",
      game_title: "Outer Wilds",
      amount: 30,
      status: "active",
      created_at: "2026-07-17T12:00:00Z",
      expires_at: "2026-09-15T12:00:00Z",
      resolved_at: null,
    });
    expect(s).toMatchObject({
      id: "s1",
      sponsorName: "Sarah",
      gameId: "g1",
      amount: 30,
      status: "active",
      resolvedAt: null,
    });
  });

  it("drops malformed rows and defaults names/status", () => {
    expect(coerceSponsorship({ id: 5 })).toBeNull();
    expect(coerceSponsorship({ id: "s", sponsor: "a", recipient: "b", amount: 0 })).toBeNull();
    const s = coerceSponsorship({
      id: "s",
      sponsor: "a",
      recipient: "b",
      amount: 10,
      status: "bogus",
      sponsor_name: " ",
    });
    expect(s?.status).toBe("active");
    expect(s?.sponsorName).toBe("A friend");
  });
});

describe("activeBackersFor / myActiveStakeOn", () => {
  const rows = [
    stake({ id: "a", gameId: "g1" }),
    stake({ id: "b", gameId: "g1", sponsor: "other", status: "paid" }),
    stake({ id: "c", gameId: "g2" }),
  ];

  it("returns only active stakes on the game", () => {
    expect(activeBackersFor(rows, "g1").map((s) => s.id)).toEqual(["a"]);
  });

  it("finds my active stake, ignoring resolved and others' stakes", () => {
    expect(myActiveStakeOn(rows, "me", "g1")?.id).toBe("a");
    expect(myActiveStakeOn(rows, "other", "g1")).toBeNull();
  });
});

describe("pairBudgetUsed", () => {
  it("counts active stakes plus this month's payouts, not refunds or old payouts", () => {
    const rows = [
      stake({ amount: 30 }), // active → counts
      stake({ amount: 20, status: "paid", resolvedAt: NOW - 2 * DAY }), // this month → counts
      stake({ amount: 40, status: "paid", resolvedAt: Date.parse("2026-06-02T00:00:00Z") }), // last month
      stake({ amount: 50, status: "refunded", resolvedAt: NOW - DAY }), // refund → room back
      stake({ amount: 15, recipient: "someone-else" }), // other pair
    ];
    expect(pairBudgetUsed(rows, "me", "friend", NOW)).toBe(50);
  });
});

describe("validateStake", () => {
  const opts = { maxStake: 50, balance: 100, pairUsed: 60, pairCap: 100 };

  it("accepts a stake inside every limit", () => {
    expect(validateStake(40, opts)).toBeNull();
  });

  it("rejects non-positive, fractional, over-max, over-balance and over-cap stakes", () => {
    expect(validateStake(0, opts)).toMatch(/at least 1/);
    expect(validateStake(2.5, opts)).toMatch(/whole number/);
    expect(validateStake(60, opts)).toMatch(/maximum stake is 50/);
    expect(validateStake(45, { ...opts, balance: 20 })).toMatch(/don't have/);
    expect(validateStake(41, opts)).toMatch(/Only 40 more coins/);
    expect(validateStake(1, { ...opts, pairUsed: 100 })).toMatch(/monthly backing limit/);
  });
});

describe("expiry + summaries", () => {
  it("labels expiries as a day countdown", () => {
    expect(expiryLabel(NOW + 12 * DAY, NOW)).toBe("12d left");
    expect(expiryLabel(NOW + 3 * 60 * 60 * 1000, NOW)).toBe("expires today");
    expect(expiryLabel(NOW - 1, NOW)).toBe("expired");
  });

  it("sums stakes and finds the soonest expiry", () => {
    const backers = [
      stake({ amount: 30, expiresAt: NOW + 12 * DAY }),
      stake({ amount: 10, expiresAt: NOW + 3 * DAY, sponsorName: "Ben" }),
    ];
    expect(totalStaked(backers)).toBe(40);
    expect(soonestExpiry(backers)).toBe(NOW + 3 * DAY);
    expect(soonestExpiry([])).toBeNull();
  });

  it("builds the backers tooltip", () => {
    const backers = [
      stake({ amount: 30, sponsorName: "Sarah", expiresAt: NOW + 12 * DAY }),
      stake({ amount: 10, sponsorName: "Ben", expiresAt: NOW + 3 * DAY }),
    ];
    expect(backersTooltip(backers, NOW)).toBe(
      "Backed by Sarah (30) and Ben (10) — 40 bonus coins if you finish. Soonest stake: 3d left.",
    );
  });
});
