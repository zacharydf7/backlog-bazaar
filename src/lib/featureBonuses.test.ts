import { describe, it, expect } from "vitest";
import {
  FEATURE_BONUS_DEFAULTS as CFG,
  earnsStoryOrder,
  finishBonuses,
  finishBonusSummary,
  finishBonusTotal,
  hasCollectorsRecord,
  reviewQualifies,
  sessionQualifies,
  startsStoryLocked,
} from "./featureBonuses";
import type { Game, GameStatus } from "../types";

const game = (id: string, over: Partial<Game> = {}): Game => ({
  id,
  title: id,
  genres: [],
  status: "backlog" as GameStatus,
  addedAt: Date.now(),
  ...over,
});

describe("hasCollectorsRecord", () => {
  it("counts a recorded cost, including a free ($0) copy", () => {
    expect(hasCollectorsRecord([{ id: "c", platform: "PC", cost: 59.99 }])).toBe(true);
    expect(hasCollectorsRecord([{ id: "c", platform: "PC", cost: 0 }])).toBe(true);
  });

  it("counts a subscription or borrowed copy that names its service/lender", () => {
    expect(
      hasCollectorsRecord([{ id: "c", platform: "Xbox", acquisition: "subscription", provider: "Game Pass" }]),
    ).toBe(true);
    expect(hasCollectorsRecord([{ id: "c", platform: "PS5", acquisition: "borrowed", provider: "Sam" }])).toBe(true);
  });

  it("ignores bare platforms, blank providers and Player 2 seats", () => {
    expect(hasCollectorsRecord(undefined)).toBe(false);
    expect(hasCollectorsRecord([{ id: "c", platform: "PC" }])).toBe(false);
    expect(hasCollectorsRecord([{ id: "c", platform: "PC", acquisition: "subscription", provider: "  " }])).toBe(
      false,
    );
    expect(
      hasCollectorsRecord([{ id: "c", platform: "PS5", acquisition: "player2", provider: "Alex", cost: 70 }]),
    ).toBe(false);
  });
});

describe("Story Order eligibility", () => {
  const prequel = game("p", { status: "finished" });

  it("stamps a start only when the prerequisite is already Finished", () => {
    const sequel = game("s", { prerequisiteGameId: "p" });
    expect(startsStoryLocked([prequel, sequel], sequel)).toBe(true);
    expect(startsStoryLocked([{ ...prequel, status: "playing" }, sequel], sequel)).toBe(false);
    expect(startsStoryLocked([sequel], sequel)).toBe(false);
    expect(startsStoryLocked([prequel, game("x")], game("x"))).toBe(false);
  });

  it("previews on a story-locked Bazaar game, but a playing run needs the start stamp", () => {
    const backlog = game("s", { prerequisiteGameId: "p" });
    expect(earnsStoryOrder([prequel, backlog], backlog)).toBe(true);
    // Locked mid-run: the live link alone never earns it.
    const lockedMidRun = game("s", { status: "playing", prerequisiteGameId: "p" });
    expect(earnsStoryOrder([prequel, lockedMidRun], lockedMidRun)).toBe(false);
    const stamped = { ...lockedMidRun, startedStoryLocked: true };
    expect(earnsStoryOrder([prequel, stamped], stamped)).toBe(true);
    expect(earnsStoryOrder([prequel], { ...stamped, status: "finished" })).toBe(false);
  });
});

describe("finishBonuses", () => {
  const prequel = game("p", { status: "finished" });
  const run = game("s", {
    status: "playing",
    prerequisiteGameId: "p",
    startedStoryLocked: true,
    copies: [{ id: "c", platform: "PC", cost: 20 }],
  });

  it("pays both bonuses on a paying first clear", () => {
    const b = finishBonuses([prequel, run], run, { firstClear: true, paying: true }, CFG);
    expect(b).toEqual({ storyOrder: 20, collectorsRecord: 10 });
    expect(finishBonusTotal(b)).toBe(30);
    expect(finishBonusSummary(b)).toBe("Story Order +20 · Collector's Record +10");
  });

  it("pays nothing on a replay or a non-paying (economy-off / free-start) finish", () => {
    expect(finishBonuses([prequel, run], run, { firstClear: false, paying: true }, CFG)).toEqual({
      storyOrder: 0,
      collectorsRecord: 0,
    });
    expect(finishBonuses([prequel, run], run, { firstClear: true, paying: false }, CFG)).toEqual({
      storyOrder: 0,
      collectorsRecord: 0,
    });
  });

  it("honors admin amounts (0 disables a bonus) and lists only paid ones", () => {
    const b = finishBonuses([prequel, run], run, { firstClear: true, paying: true }, { ...CFG, storyOrder: 0 });
    expect(b).toEqual({ storyOrder: 0, collectorsRecord: 10 });
    expect(finishBonusSummary(b)).toBe("Collector's Record +10");
  });
});

describe("reviewQualifies / sessionQualifies", () => {
  it("measures the trimmed review in characters", () => {
    expect(reviewQualifies("a".repeat(100), 100)).toBe(true);
    expect(reviewQualifies(`  ${"a".repeat(99)}  `, 100)).toBe(false);
    // Emoji count once each, like Postgres char_length.
    expect(reviewQualifies("🎮".repeat(100), 100)).toBe(true);
    expect(reviewQualifies(undefined, 100)).toBe(false);
  });

  it("counts whole logged minutes against the minimum", () => {
    expect(sessionQualifies(20 / 60, 20)).toBe(true);
    expect(sessionQualifies(1.5, 20)).toBe(true);
    expect(sessionQualifies(19 / 60, 20)).toBe(false);
    expect(sessionQualifies(Number.NaN, 20)).toBe(false);
  });
});
