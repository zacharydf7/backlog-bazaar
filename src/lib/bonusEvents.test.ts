import { describe, expect, it } from "vitest";
import {
  bonusEventDraftProblem,
  boostLabels,
  coerceAdminBonusEvents,
  coerceBonusEvents,
  eventWhenLabel,
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
