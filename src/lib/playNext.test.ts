import { describe, it, expect } from "vitest";
import {
  DEFAULT_ANSWERS,
  coerceAnswers,
  fitsLength,
  fitsMood,
  gamePlatforms,
  pickNext,
  pickReasons,
  poolPlatforms,
  waitLabel,
} from "./playNext";
import type { Game } from "../types";

const DAY = 86_400_000;
const NOW = 1_000 * 365 * DAY;

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    hours: 20,
    addedAt: NOW - 10 * DAY,
    ...over,
  } as Game;
}

describe("filters", () => {
  it("buckets length by your personal length first", () => {
    expect(fitsLength({ hours: 8 }, "quick")).toBe(true);
    expect(fitsLength({ hours: 8, personalHours: 40 }, "long")).toBe(true);
    expect(fitsLength({ hours: 10 }, "medium")).toBe(false);
    expect(fitsLength({ hours: 30 }, "medium")).toBe(true);
    expect(fitsLength({}, "quick")).toBe(false);
    expect(fitsLength({}, "any")).toBe(true);
  });

  it("maps genres to moods, however the provider spells them", () => {
    expect(fitsMood(["Hack and Slash/Beat 'em up"], "action")).toBe(true);
    expect(fitsMood(["Turn-based strategy (TBS)"], "strategic")).toBe(true);
    expect(fitsMood(["Board Games"], "relaxing")).toBe(true);
    expect(fitsMood(["RPG"], "story")).toBe(true);
    expect(fitsMood(["RPG"], "relaxing")).toBe(false);
    expect(fitsMood([], "story")).toBe(false);
    expect(fitsMood([], "any")).toBe(true);
  });

  it("reads platforms from your copies, else the catalog", () => {
    expect(gamePlatforms({ copies: [{ platform: "PC" }, { platform: "PC" }] as Game["copies"], platforms: ["PS5"] })).toEqual(["PC"]);
    expect(gamePlatforms({ copies: [], platforms: ["PS5"] })).toEqual(["PS5"]);
    expect(poolPlatforms([game({ platforms: ["Switch"] }), game({ platforms: ["PC", "Switch"] })])).toEqual(["PC", "Switch"]);
  });
});

describe("pickNext", () => {
  const old = game({ id: "old", addedAt: NOW - 900 * DAY });
  const essential = game({ id: "ess", priority: "essential" });
  const prequel = game({ id: "pre", status: "finished" });
  const sequel = game({ id: "seq", prerequisiteGameId: "pre" });
  const fresh = game({ id: "new" });
  const pool = [old, essential, sequel, fresh];
  const games = [...pool, prequel];
  const ids = (a: Partial<typeof DEFAULT_ANSWERS>) =>
    pickNext(pool, games, { ...DEFAULT_ANSWERS, ...a }, { now: NOW, storyOrderBonus: 20 }).picks.map((p) => p.game.id);

  it("ranks a good mix: priority, then waiting, then series, three at most", () => {
    expect(ids({})).toEqual(["ess", "old", "seq"]);
  });

  it("follows the aim", () => {
    expect(ids({ aim: "priority" })[0]).toBe("ess");
    expect(ids({ aim: "waiting" })[0]).toBe("old");
    expect(ids({ aim: "series" })).toEqual(["seq"]);
  });

  it("draws a surprise from the matches only", () => {
    const r = pickNext(pool, games, { ...DEFAULT_ANSWERS, aim: "surprise", length: "quick" }, {
      now: NOW,
      storyOrderBonus: 0,
      rng: () => 0,
    });
    expect(r).toEqual({ picks: [], matched: 0 });
    const all = pickNext(pool, games, { ...DEFAULT_ANSWERS, aim: "surprise" }, { now: NOW, storyOrderBonus: 0, rng: () => 0.5 });
    expect(all.matched).toBe(4);
    expect(new Set(all.picks.map((p) => p.game.id)).size).toBe(3);
  });

  it("explains each pick", () => {
    expect(pickReasons(sequel, games, NOW, 20)).toEqual(["Next in series", "+20 Story Order", "~20h"]);
    expect(pickReasons(old, games, NOW, 0)).toEqual(["Waiting 2 years", "~20h"]);
    expect(pickReasons(essential, games, NOW, 0)[0]).toBe("Essential");
  });
});

describe("helpers", () => {
  it("labels the wait in months, then years", () => {
    expect(waitLabel(NOW - 10 * DAY, NOW)).toBeNull();
    expect(waitLabel(NOW - 31 * DAY, NOW)).toBe("Waiting 1 month");
    expect(waitLabel(NOW - 400 * DAY, NOW)).toBe("Waiting 1 year");
  });

  it("restores remembered answers, dropping anything unknown", () => {
    expect(coerceAnswers({ length: "quick", platform: "PC", mood: "zany", aim: "series" })).toEqual({
      length: "quick",
      platform: "PC",
      mood: "any",
      aim: "series",
    });
    expect(coerceAnswers(null)).toEqual(DEFAULT_ANSWERS);
  });
});
