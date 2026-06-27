import { describe, it, expect } from "vitest";
import {
  DEFAULT_GENERAL_SLOTS,
  playingGames,
  slotCapacity,
  totalCapacity,
  openSlots,
  canStartGame,
  gameMatchesDefinition,
  planSlotForGame,
  movableTargetedSlots,
  openEndlessSlots,
  openReplaySlots,
  isReplaySlot,
  isEndlessSlot,
  rotationSlots,
  focusSlots,
  eligibleStartSlots,
  defaultStartChoice,
  slotCriteriaSummary,
  type SlotDefinition,
  type TargetedSlot,
} from "./slots";
import type { Game, GameStatus } from "../types";

const game = (status: GameStatus, over: Partial<Game> = {}): Game => ({
  id: Math.random().toString(36).slice(2),
  title: "G",
  genres: [],
  status,
  addedAt: Date.now(),
  ...over,
});

const def = (over: Partial<SlotDefinition> = {}): SlotDefinition => ({
  id: "d" + Math.random().toString(36).slice(2),
  name: "Quick Clear",
  kind: "standard",
  minHours: null,
  maxHours: 10,
  minYear: null,
  maxYear: null,
  minMetacritic: null,
  maxMetacritic: null,
  genres: [],
  platforms: [],
  defaultGrantCount: 0,
  active: true,
  ...over,
});

const grant = (definition: SlotDefinition): TargetedSlot => ({
  id: "g" + Math.random().toString(36).slice(2),
  definition,
});

describe("general slots", () => {
  it("defaults to 2 general slots", () => {
    expect(DEFAULT_GENERAL_SLOTS).toBe(2);
  });

  it("counts only playing games as occupying slots", () => {
    const games = [game("playing"), game("backlog"), game("playing"), game("finished")];
    expect(playingGames(games)).toHaveLength(2);
  });

  it("capacity floors at zero and ignores fractions", () => {
    expect(slotCapacity(2)).toBe(2);
    expect(slotCapacity(-3)).toBe(0);
    expect(slotCapacity(2.9)).toBe(2);
  });

  it("blocks a new game once general slots are full", () => {
    const full = [game("playing"), game("playing")];
    expect(canStartGame({ hours: 5 }, full, 2)).toBe(false);
    expect(canStartGame({ hours: 5 }, [game("playing")], 2)).toBe(true);
  });
});

describe("gameMatchesDefinition", () => {
  it("an unbounded slot accepts anything, including unknown length", () => {
    const d = def({ minHours: null, maxHours: null });
    expect(gameMatchesDefinition({ hours: 50 }, d)).toBe(true);
    expect(gameMatchesDefinition({ hours: undefined }, d)).toBe(true);
  });

  it("respects min and max hour bounds", () => {
    expect(gameMatchesDefinition({ hours: 8 }, def({ maxHours: 10 }))).toBe(true);
    expect(gameMatchesDefinition({ hours: 12 }, def({ maxHours: 10 }))).toBe(false);
    expect(gameMatchesDefinition({ hours: 45 }, def({ minHours: 40, maxHours: null }))).toBe(true);
    expect(gameMatchesDefinition({ hours: 20 }, def({ minHours: 40, maxHours: null }))).toBe(false);
  });

  it("unknown length can't satisfy a bounded slot", () => {
    expect(gameMatchesDefinition({ hours: undefined }, def({ maxHours: 10 }))).toBe(false);
  });

  it("matches on release year (Classic ≤2009 / Modern ≥2015)", () => {
    const classic = def({ minHours: null, maxHours: null, maxYear: 2009 });
    const modern = def({ minHours: null, maxHours: null, minYear: 2015 });
    expect(gameMatchesDefinition({ released: "1998-11-08" }, classic)).toBe(true);
    expect(gameMatchesDefinition({ released: "2017-03-03" }, classic)).toBe(false);
    expect(gameMatchesDefinition({ released: "2017-03-03" }, modern)).toBe(true);
    // Unknown release date can't satisfy a year-bounded slot.
    expect(gameMatchesDefinition({ released: undefined }, modern)).toBe(false);
  });

  it("matches genre and platform case-insensitively (any-of)", () => {
    const rpg = def({ minHours: null, maxHours: null, genres: ["RPG"] });
    expect(gameMatchesDefinition({ genres: ["Action", "rpg"] }, rpg)).toBe(true);
    expect(gameMatchesDefinition({ genres: ["Shooter"] }, rpg)).toBe(false);
    const handheld = def({ minHours: null, maxHours: null, platforms: ["Nintendo Switch", "Steam Deck"] });
    expect(gameMatchesDefinition({ platforms: ["PC", "steam deck"] }, handheld)).toBe(true);
    expect(gameMatchesDefinition({ platforms: ["PlayStation 5"] }, handheld)).toBe(false);
  });

  it("matches a Metacritic range and ANDs all set criteria", () => {
    const d = def({ minHours: null, maxHours: 10, minMetacritic: 85, genres: ["RPG"] });
    // Fits hours + score + genre.
    expect(gameMatchesDefinition({ hours: 8, metacritic: 92, genres: ["RPG"] }, d)).toBe(true);
    // Fails the score.
    expect(gameMatchesDefinition({ hours: 8, metacritic: 70, genres: ["RPG"] }, d)).toBe(false);
    // Fails the genre.
    expect(gameMatchesDefinition({ hours: 8, metacritic: 92, genres: ["Puzzle"] }, d)).toBe(false);
  });

  it("endless/replay ignore all criteria", () => {
    const endless = def({ kind: "endless", maxHours: 1, genres: ["RPG"], maxYear: 1990 });
    expect(gameMatchesDefinition({ hours: 500, genres: ["Shooter"], released: "2024-01-01" }, endless)).toBe(true);
  });
});

describe("planSlotForGame", () => {
  it("prefers an open matching targeted slot over a general slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const plan = planSlotForGame({ hours: 5 }, [], 2, [quick]);
    expect(plan).toEqual({ ok: true, slotId: quick.id });
  });

  it("falls back to a general slot when no targeted slot matches", () => {
    const quick = grant(def({ maxHours: 10 }));
    const plan = planSlotForGame({ hours: 50 }, [], 2, [quick]);
    expect(plan).toEqual({ ok: true, slotId: null });
  });

  it("won't reuse an occupied targeted slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const playing = [game("playing", { hours: 4, slotId: quick.id })];
    // Second short game can't take the taken Quick Clear slot, so a general slot.
    expect(planSlotForGame({ hours: 5 }, playing, 2, [quick])).toEqual({ ok: true, slotId: null });
  });

  it("reports no room when general slots are full and nothing matches", () => {
    const quick = grant(def({ maxHours: 10 }));
    const playing = [
      game("playing", { hours: 50, slotId: null }),
      game("playing", { hours: 50, slotId: null }),
    ];
    expect(planSlotForGame({ hours: 50 }, playing, 2, [quick])).toEqual({ ok: false });
    // …but a short game still fits the empty Quick Clear slot.
    expect(planSlotForGame({ hours: 5 }, playing, 2, [quick])).toEqual({ ok: true, slotId: quick.id });
  });

  it("ignores inactive targeted slots", () => {
    const quick = grant(def({ maxHours: 10, active: false }));
    expect(planSlotForGame({ hours: 5 }, [], 0, [quick])).toEqual({ ok: false });
  });
});

describe("movableTargetedSlots", () => {
  it("offers an open matching targeted slot for a game in a general slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const inGeneral = game("playing", { hours: 5, slotId: null });
    const moves = movableTargetedSlots(inGeneral, [inGeneral], [quick]);
    expect(moves.map((m) => m.id)).toEqual([quick.id]);
  });

  it("won't offer a slot the game doesn't fit", () => {
    const quick = grant(def({ maxHours: 10 }));
    const big = game("playing", { hours: 40, slotId: null });
    expect(movableTargetedSlots(big, [big], [quick])).toEqual([]);
  });

  it("won't offer an occupied slot or the game's current slot", () => {
    const quick = grant(def({ maxHours: 10 }));
    const other = game("playing", { hours: 4, slotId: quick.id }); // already in Quick
    const mine = game("playing", { hours: 5, slotId: null });
    expect(movableTargetedSlots(mine, [other, mine], [quick])).toEqual([]);

    // The game already in the slot isn't offered its own slot again.
    expect(movableTargetedSlots(other, [other, mine], [quick])).toEqual([]);
  });
});

describe("linked editions share a slot", () => {
  it("a second family edition reuses its sibling's slot (no extra capacity)", () => {
    const playing = [game("playing", { id: "a", familyId: "F", slotId: null })];
    // Both general slots would normally be needed, but the linked sibling shares.
    const plan = planSlotForGame({ id: "b", familyId: "F", hours: 30 }, playing, 2, []);
    expect(plan).toEqual({ ok: true, slotId: null });
  });

  it("shares a targeted slot the family already occupies", () => {
    const quick = grant(def({ maxHours: 10 }));
    const playing = [game("playing", { id: "a", familyId: "F", slotId: quick.id })];
    const plan = planSlotForGame({ id: "b", familyId: "F", hours: 5 }, playing, 0, [quick]);
    expect(plan).toEqual({ ok: true, slotId: quick.id });
  });

  it("lets a family start even when all general slots are otherwise full", () => {
    const playing = [
      game("playing", { id: "a", familyId: "F", slotId: null }),
      game("playing", { id: "x", slotId: null }),
    ];
    // 2 general slots full (family unit + x), but a 2nd family edition still fits.
    expect(canStartGame({ id: "b", familyId: "F", hours: 40 }, playing, 2, [])).toBe(true);
    // …whereas an unrelated new game has no room.
    expect(canStartGame({ id: "z", hours: 40 }, playing, 2, [])).toBe(false);
  });

  it("counts a family as one occupant for open-slot math", () => {
    const games = [
      game("playing", { id: "a", familyId: "F", slotId: null }),
      game("playing", { id: "b", familyId: "F", slotId: null }),
    ];
    // Two editions playing, but one unit -> one general slot used of two.
    expect(openSlots(games, 2)).toBe(1);
  });
});

describe("endless slots", () => {
  const endless = () => grant(def({ name: "Ongoing", kind: "endless", minHours: null, maxHours: null }));

  it("are length-agnostic (any game fits)", () => {
    const d = def({ kind: "endless", maxHours: 10 });
    expect(gameMatchesDefinition({ hours: 500 }, d)).toBe(true);
    expect(gameMatchesDefinition({ hours: undefined }, d)).toBe(true);
  });

  it("are never auto-placed at purchase", () => {
    const e = endless();
    // A long game with only an endless slot open → no auto slot (general full at 0).
    expect(planSlotForGame({ hours: 50 }, [], 0, [e])).toEqual({ ok: false });
  });

  it("still let a game start (parked by choice) even with general slots full", () => {
    const e = endless();
    const full = [game("playing", { slotId: null }), game("playing", { slotId: null })];
    expect(canStartGame({ hours: 50 }, full, 2, [e])).toBe(true);
    expect(openEndlessSlots(playingGames(full), [e]).map((s) => s.id)).toEqual([e.id]);
  });

  it("are offered as a move target for a playing game, regardless of length", () => {
    const e = endless();
    const big = game("playing", { hours: 80, slotId: null });
    expect(movableTargetedSlots(big, [big], [e]).map((m) => m.id)).toEqual([e.id]);
  });

  it("let a game move OUT of an endless slot to another open slot (never stuck)", () => {
    const e1 = grant(def({ name: "Ongoing", kind: "endless" }));
    const e2 = grant(def({ name: "Ongoing 2", kind: "endless" }));
    const inEndless = game("playing", { hours: 80, slotId: e1.id });
    // From its endless slot, the other open slot is a valid move target; its own
    // current slot is excluded — so a game parked in Endless is never stuck.
    expect(movableTargetedSlots(inEndless, [inEndless], [e1, e2]).map((m) => m.id)).toEqual([
      e2.id,
    ]);
  });
});

describe("replay slots", () => {
  const replay = () => grant(def({ name: "Replay", kind: "replay", minHours: null, maxHours: null }));

  it("are never auto-placed and never offered as a move target", () => {
    const r = replay();
    expect(planSlotForGame({ hours: 5 }, [], 0, [r])).toEqual({ ok: false });
    const playing = game("playing", { hours: 5, slotId: null });
    expect(movableTargetedSlots(playing, [playing], [r])).toEqual([]);
  });

  it("openReplaySlots lists open replay grants only", () => {
    const r = replay();
    const e = grant(def({ kind: "endless" }));
    expect(openReplaySlots([], [r, e]).map((s) => s.id)).toEqual([r.id]);
    const taken = [game("playing", { slotId: r.id })];
    expect(openReplaySlots(taken, [r])).toEqual([]);
  });

  it("isReplaySlot identifies a replay grant by id", () => {
    const r = replay();
    const e = grant(def({ kind: "endless" }));
    expect(isReplaySlot(r.id, [r, e])).toBe(true);
    expect(isReplaySlot(e.id, [r, e])).toBe(false);
    expect(isReplaySlot(null, [r])).toBe(false);
  });
});

describe("Rotation lane partitioning", () => {
  const standard = () => grant(def({ name: "Quick Play", maxHours: 10 }));
  const endless = () => grant(def({ name: "Rotation", kind: "endless" }));
  const replay = () => grant(def({ name: "Replay", kind: "replay" }));

  it("isEndlessSlot identifies a Rotation grant by id", () => {
    const e = endless();
    const s = standard();
    expect(isEndlessSlot(e.id, [e, s])).toBe(true);
    expect(isEndlessSlot(s.id, [e, s])).toBe(false);
    expect(isEndlessSlot(null, [e])).toBe(false);
  });

  it("rotationSlots / focusSlots split grants by lane", () => {
    const e1 = endless();
    const e2 = endless();
    const s = standard();
    const r = replay();
    const grants = [s, e1, r, e2];
    expect(rotationSlots(grants).map((g) => g.id).sort()).toEqual([e1.id, e2.id].sort());
    // Focus keeps standard + replay (everything that isn't a Rotation slot).
    expect(focusSlots(grants).map((g) => g.id).sort()).toEqual([s.id, r.id].sort());
  });
});

describe("activation slot picker", () => {
  it("lists General + matching standard + endless slots a game qualifies for", () => {
    const quick = grant(def({ name: "Quick Play", maxHours: 10 }));
    const long = grant(def({ name: "Epics", minHours: 40, maxHours: null }));
    const ongoing = grant(def({ name: "Ongoing", kind: "endless", minHours: null, maxHours: null }));
    const opts = eligibleStartSlots({ hours: 8 }, [], 2, [quick, long, ongoing]);
    // General first, then the matching standard (Quick Play, not Epics), then endless.
    expect(opts.map((o) => o.label)).toEqual(["General slot", "Quick Play", "Ongoing"]);
  });

  it("omits the General option when no general slot is open", () => {
    const quick = grant(def({ name: "Quick Play", maxHours: 10 }));
    const full = [game("playing", { slotId: null }), game("playing", { slotId: null })];
    const opts = eligibleStartSlots({ hours: 5 }, full, 2, [quick]);
    expect(opts.map((o) => o.label)).toEqual(["Quick Play"]);
  });

  it("default choice prefers a matching standard slot, else general", () => {
    const quick = grant(def({ name: "Quick Play", maxHours: 10 }));
    expect(defaultStartChoice({ hours: 5 }, [], 2, [quick])).toEqual({ kind: "slot", id: quick.id });
    expect(defaultStartChoice({ hours: 50 }, [], 2, [quick])).toEqual({ kind: "general" });
  });

  it("default choice falls back to an endless slot when nothing auto-places", () => {
    const ongoing = grant(def({ name: "Ongoing", kind: "endless", minHours: null, maxHours: null }));
    // No general slots, only an endless slot open.
    expect(defaultStartChoice({ hours: 50 }, [], 0, [ongoing])).toEqual({ kind: "slot", id: ongoing.id });
  });
});

describe("slotCriteriaSummary", () => {
  it("summarizes a multi-criteria standard slot", () => {
    const d = def({ name: "Classic RPG", minHours: null, maxHours: null, maxYear: 2009, genres: ["RPG"] });
    expect(slotCriteriaSummary(d)).toBe("≤2009 · RPG");
    expect(slotCriteriaSummary(def({ minHours: null, maxHours: 10 }))).toBe("≤10h");
    expect(slotCriteriaSummary(def({ minHours: null, maxHours: null }))).toBe("any game");
  });

  it("labels endless and replay slots by behaviour", () => {
    expect(slotCriteriaSummary(def({ kind: "endless" }))).toMatch(/ongoing/);
    expect(slotCriteriaSummary(def({ kind: "replay" }))).toMatch(/replay/);
  });
});

describe("capacity helpers", () => {
  it("total capacity is general + granted targeted", () => {
    const grants = [grant(def()), grant(def())];
    expect(totalCapacity(2, grants)).toBe(4);
  });

  it("open slots never go negative", () => {
    const over = [game("playing"), game("playing"), game("playing")];
    expect(openSlots(over, 2)).toBe(0);
    expect(openSlots([game("playing")], 2, [grant(def())])).toBe(2);
  });
});
