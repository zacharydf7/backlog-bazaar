import { describe, expect, it } from "vitest";
import {
  bonusEventDraftProblem,
  boostLabels,
  coerceAdminBonusEvents,
  coerceBonusEvents,
  boostedReward,
  coerceBonusPerks,
  eventFinishBonus,
  rewardsBoost,
  eventStartPrice,
  eventWhenLabel,
  spanUntil,
  repeatLabel,
  targetLabel,
  type BonusEventDraft,
} from "./bonusEvents";

const H = 3_600_000;
const D = 24 * H;

const DRAFT: BonusEventDraft = {
  id: null,
  name: "Double Bounty Weekend",
  description: "",
  startsAt: 0,
  endsAt: 2 * D,
  repeat: null,
  repeatUntil: null,
  bountyMult: 2,
  sessionMult: 1,
  rewardsMult: 1,
  startDiscountPct: 0,
  discountLimit: null,
  genres: [],
  platforms: [],
  offMainPlatform: false,
  minHours: null,
  maxHours: null,
  playerCap: null,
};

describe("coerceBonusEvents", () => {
  it("reads the RPC's rows, with numeric strings and missing fields", () => {
    const [e] = coerceBonusEvents([
      {
        id: "e1",
        name: "Cheap Starts",
        starts_at: "2026-10-17T04:00:00Z",
        ends_at: "2026-10-19T04:00:00Z",
        repeat: "weekly",
        start_discount_pct: 25,
        bounty_mult: "1.5",
        genres: ["RPG", 3],
        min_hours: null,
        max_hours: "10",
        player_cap: 200,
        cap_used: "40",
      },
      { name: "no id" },
    ]);
    expect(e).toMatchObject({
      id: "e1",
      repeat: "weekly",
      startDiscountPct: 25,
      bountyMult: 1.5,
      sessionMult: 1,
      genres: ["RPG"],
      minHours: null,
      maxHours: 10,
      playerCap: 200,
      capUsed: 40,
      startsAt: Date.parse("2026-10-17T04:00:00Z"),
    });
    expect(coerceBonusEvents(null)).toEqual([]);
  });

  it("reads the admin rows' next run, live flag and payouts", () => {
    const [e] = coerceAdminBonusEvents([
      { id: "e1", next_start: "2026-11-01T04:00:00Z", next_end: null, live: true, paid_coins: "300", players: 4, repeat: "bogus" },
    ]);
    expect(e).toMatchObject({ repeat: null, nextStart: Date.parse("2026-11-01T04:00:00Z"), nextEnd: null, live: true, paidCoins: 300, players: 4 });
  });
});

describe("labels", () => {
  it("names each active boost", () => {
    expect(boostLabels({ bountyMult: 2, sessionMult: 1.5, rewardsMult: 1, startDiscountPct: 25, discountLimit: null })).toEqual([
      "Bounties ×2",
      "Daily Session coins ×1.5",
      "25% off starts",
    ]);
    expect(boostLabels({ bountyMult: 1, sessionMult: 1, rewardsMult: 1, startDiscountPct: 50, discountLimit: 2 })).toEqual([
      "50% off 2 starts",
    ]);
  });

  it("words the targets, or null for every game", () => {
    expect(targetLabel(DRAFT)).toBeNull();
    expect(
      targetLabel({ ...DRAFT, genres: ["RPG", "Indie"], maxHours: 10, platforms: ["Switch"], offMainPlatform: true }),
    ).toBe("RPG, Indie · games up to 10h · on Switch · off your main platform");
    expect(targetLabel({ ...DRAFT, minHours: 5, maxHours: 20 })).toBe("5–20h games");
  });

  it("counts down to the end while live, else to the start", () => {
    expect(eventWhenLabel({ startsAt: 0, endsAt: 3 * D }, D)).toBe("Ends in 2 days");
    expect(eventWhenLabel({ startsAt: 5 * H, endsAt: D }, 30 * 60_000)).toBe("Starts in 5h");
  });

  it("describes a repeat", () => {
    expect(repeatLabel(null)).toBeNull();
    expect(repeatLabel("weekly")).toBe("Every week");
    expect(repeatLabel("monthly", Date.UTC(2026, 11, 31, 12))).toMatch(/^Every month until /);
  });
});

describe("bonusEventDraftProblem", () => {
  it("accepts a valid draft", () => {
    expect(bonusEventDraftProblem(DRAFT)).toBeNull();
  });

  it("explains each problem the database would reject", () => {
    expect(bonusEventDraftProblem({ ...DRAFT, name: " " })).toMatch(/name/);
    expect(bonusEventDraftProblem({ ...DRAFT, endsAt: 0 })).toMatch(/after the start/);
    expect(bonusEventDraftProblem({ ...DRAFT, bountyMult: 1 })).toMatch(/at least one/);
    expect(bonusEventDraftProblem({ ...DRAFT, bountyMult: 6 })).toMatch(/×5/);
    expect(bonusEventDraftProblem({ ...DRAFT, startDiscountPct: 95 })).toMatch(/90%/);
    expect(bonusEventDraftProblem({ ...DRAFT, minHours: 20, maxHours: 10 })).toMatch(/shortest/);
    expect(bonusEventDraftProblem({ ...DRAFT, playerCap: 0 })).toMatch(/cap/);
    expect(bonusEventDraftProblem({ ...DRAFT, discountLimit: 1.5 })).toMatch(/Discounted starts/);
  });

  it("caps a repeat's length and wants its stop date after the first run", () => {
    expect(bonusEventDraftProblem({ ...DRAFT, repeat: "weekly", endsAt: 8 * D })).toMatch(/7 days/);
    expect(bonusEventDraftProblem({ ...DRAFT, repeat: "monthly", endsAt: 28 * D })).toBeNull();
    expect(bonusEventDraftProblem({ ...DRAFT, repeat: "monthly", endsAt: 29 * D })).toMatch(/28 days/);
    expect(bonusEventDraftProblem({ ...DRAFT, repeat: "weekly", repeatUntil: 0 })).toMatch(/Stop repeating/);
  });
});

describe("perks", () => {
  it("reads my_bonus_event_perks, dropping empty or junk entries", () => {
    expect(
      coerceBonusPerks({
        a: { discount: { event: "Half Off", pct: 50, cap_left: "40" } },
        b: { bounty: { event: "Double", factor: "2" }, session: { event: "Double", factor: 2 }, saved: 25 },
        c: { bounty: { event: "Flat", factor: 1 } },
        d: "nope",
      }),
    ).toEqual({
      a: { discount: { event: "Half Off", pct: 50, capLeft: 40 }, saved: 0 },
      b: {
        bounty: { event: "Double", factor: 2, capLeft: null },
        session: { event: "Double", factor: 2, capLeft: null },
        saved: 25,
      },
      c: { saved: 0 },
    });
    expect(coerceBonusPerks(null)).toEqual({});
    expect(coerceBonusPerks([1])).toEqual({});
  });

  it("prices a start like bonus_event_discount: floored saving, stopped at the cap", () => {
    const perk = (pct: number, capLeft: number | null = null) => ({ discount: { event: "E", pct, capLeft }, saved: 0 });
    expect(eventStartPrice(125, perk(50))).toEqual({ price: 63, saving: 62, event: "E", pct: 50 });
    expect(eventStartPrice(100, perk(50, 30))).toMatchObject({ price: 70, saving: 30 });
    expect(eventStartPrice(100, perk(50, 0))).toBeNull();
    expect(eventStartPrice(0, perk(50))).toBeNull();
    expect(eventStartPrice(100, undefined)).toBeNull();
  });

  it("boosts what's paid at finish like bonus_event_pay: floored, stopped at the cap", () => {
    const perk = (factor: number, capLeft: number | null = null) => ({ bounty: { event: "E", factor, capLeft }, saved: 0 });
    expect(eventFinishBonus(330, perk(2))).toBe(330);
    expect(eventFinishBonus(101, perk(1.5))).toBe(50);
    expect(eventFinishBonus(330, perk(2, 100))).toBe(100);
    expect(eventFinishBonus(0, perk(2))).toBe(0);
    expect(eventFinishBonus(330, undefined)).toBe(0);
  });

  it("words the time left", () => {
    expect(spanUntil(5 * H, 0)).toBe("5h");
    expect(spanUntil(10 * 60_000, 0)).toBe("1h");
    expect(spanUntil(2 * D + H, 0)).toBe("3 days");
  });
});

describe("rewards boost", () => {
  const ev = (over: Record<string, unknown> = {}) =>
    ({
      id: "e",
      name: "Double",
      description: "",
      startsAt: 0,
      endsAt: 10 * D,
      repeat: null,
      bountyMult: 1,
      sessionMult: 1,
      rewardsMult: 2,
      startDiscountPct: 0,
      discountLimit: null,
      genres: [],
      platforms: [],
      offMainPlatform: false,
      minHours: null,
      maxHours: null,
      playerCap: null,
      capUsed: 0,
      discountUsed: 0,
      ...over,
    }) as Parameters<typeof rewardsBoost>[0][number];

  it("picks the strongest live rewards event, with its cap left", () => {
    expect(rewardsBoost([ev(), ev({ name: "Triple", rewardsMult: 3, playerCap: 100, capUsed: 40 })], D)).toEqual({
      event: "Triple",
      mult: 3,
      capLeft: 60,
    });
  });

  it("ignores upcoming events, other boosts, and a used-up cap", () => {
    expect(rewardsBoost([ev({ startsAt: 2 * D })], D)).toBeNull();
    expect(rewardsBoost([ev({ rewardsMult: 1, bountyMult: 2 })], D)).toBeNull();
    expect(rewardsBoost([ev({ playerCap: 50, capUsed: 50 })], D)).toBeNull();
  });

  it("pays a claim like bonus_event_pay", () => {
    expect(boostedReward(25, { mult: 2, capLeft: null })).toBe(50);
    expect(boostedReward(25, { mult: 1.5, capLeft: null })).toBe(37);
    expect(boostedReward(25, { mult: 2, capLeft: 10 })).toBe(35);
    expect(boostedReward(25, null)).toBe(25);
  });
});
