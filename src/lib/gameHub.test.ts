import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import {
  hubMembers,
  hubRepresentative,
  hubTitle,
  hubEditions,
  editionKeyOf,
  editionLabel,
} from "./gameHub";

function game(over: Partial<Game> = {}): Game {
  return {
    id: "g1",
    title: "Chrono Trigger",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: 1,
    ...over,
  } as Game;
}

describe("hubMembers", () => {
  it("gathers all instances sharing the catalog identity", () => {
    const a = game({ id: "a", rawgId: 7, addedAt: 1 });
    const b = game({ id: "b", rawgId: 7, addedAt: 2 });
    const other = game({ id: "x", rawgId: 8 });
    expect(hubMembers([a, b, other], a).map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("pulls in a family-linked edition with a DIFFERENT catalog identity", () => {
    const base = game({ id: "a", rawgId: 7, familyId: "F" });
    const remaster = game({ id: "b", title: "CT Remaster", rawgId: 99, familyId: "F" });
    const unrelated = game({ id: "x", rawgId: 8 });
    expect(hubMembers([base, remaster, unrelated], base).map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("closes transitively: the remaster's own catalog twin joins too", () => {
    const base = game({ id: "a", rawgId: 7, familyId: "F" });
    const remaster = game({ id: "b", rawgId: 99, familyId: "F" });
    // A second, unlinked instance of the remaster on another platform.
    const remasterTwin = game({ id: "c", rawgId: 99 });
    expect(hubMembers([base, remaster, remasterTwin], base).map((g) => g.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    // …and entering from the twin lands on the same hub.
    expect(hubMembers([base, remaster, remasterTwin], remasterTwin).map((g) => g.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("a custom game with no catalog identity connects only through family links", () => {
    const custom = game({ id: "a" }); // no rawgId/catalogId
    const twinTitle = game({ id: "b" }); // same title, also identity-less
    expect(hubMembers([custom, twinTitle], custom).map((g) => g.id)).toEqual(["a"]);

    const linked = game({ id: "c", familyId: "F" });
    const customLinked = game({ id: "a", familyId: "F" });
    expect(hubMembers([customLinked, twinTitle, linked], customLinked).map((g) => g.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("an unconnected game is a hub of one (itself)", () => {
    const a = game({ id: "a", rawgId: 7 });
    expect(hubMembers([a], a).map((g) => g.id)).toEqual(["a"]);
  });
});

describe("hubRepresentative / hubTitle", () => {
  it("prefers the best-placed member, and its family primary when linked", () => {
    const playing = game({ id: "a", rawgId: 7, status: "playing", familyId: "F" });
    const primary = game({
      id: "b",
      title: "The Definitive One",
      rawgId: 7,
      familyId: "F",
      familyPrimaryGameId: "b",
    });
    const withPointer = { ...playing, familyPrimaryGameId: "b" };
    // The playing member is best-placed, but its family's designated primary
    // fronts the hub.
    expect(hubRepresentative([withPointer, primary]).id).toBe("b");
    expect(hubTitle([withPointer, primary])).toBe("The Definitive One");
  });

  it("falls back to the best-placed member for unlinked instances", () => {
    const backlog = game({ id: "a", rawgId: 7, status: "backlog" });
    const finished = game({ id: "b", rawgId: 7, status: "finished" });
    expect(hubRepresentative([backlog, finished]).id).toBe("a");
  });

  it("uses the family name for the title when set", () => {
    const a = game({ id: "a", familyId: "F", familyName: "Chrono Saga" });
    const b = game({ id: "b", familyId: "F" });
    expect(hubTitle([a, b])).toBe("Chrono Saga");
  });
});

describe("hubEditions", () => {
  it("collapses a family into ONE entry fronted by its primary", () => {
    const a = game({ id: "a", rawgId: 7, familyId: "F", familyPrimaryGameId: "b" });
    const b = game({ id: "b", rawgId: 7, familyId: "F", familyPrimaryGameId: "b" });
    const solo = game({ id: "c", rawgId: 7 });
    const editions = hubEditions([a, b, solo]);
    expect(editions.map((e) => e.kind)).toEqual(["family", "game"]);
    expect(editions[0].game.id).toBe("b");
    expect(editions[1].game.id).toBe("c");
  });

  it("a family reduced to one member inside the hub renders as a plain instance", () => {
    // Defensive: shouldn't happen (unlink cleans lonely members) but must not crash.
    const a = game({ id: "a", rawgId: 7, familyId: "F" });
    const b = game({ id: "b", rawgId: 7 });
    const editions = hubEditions([a, b]);
    expect(editions.map((e) => e.kind)).toEqual(["game", "game"]);
  });
});

describe("editionKeyOf", () => {
  it("selects the entry containing the routed game — a family member selects the family", () => {
    const a = game({ id: "a", rawgId: 7, familyId: "F" });
    const b = game({ id: "b", rawgId: 7, familyId: "F" });
    const solo = game({ id: "c", rawgId: 7 });
    const editions = hubEditions([a, b, solo]);
    expect(editionKeyOf(editions, "b")).toBe("f:F");
    expect(editionKeyOf(editions, "c")).toBe("g:c");
    // Unknown id falls back to the first entry.
    expect(editionKeyOf(editions, "zzz")).toBe("f:F");
  });
});

describe("editionLabel", () => {
  it("labels same-title instances by platform", () => {
    const e = hubEditions([
      game({ id: "a", copies: [{ id: "c1", platform: "PlayStation 4" }] }),
    ])[0];
    expect(editionLabel(e, "Chrono Trigger")).toBe("PlayStation 4");
  });

  it("leads with the member's own title when it differs from the hub's", () => {
    const e = hubEditions([
      game({ id: "a", title: "CT Remaster", copies: [{ id: "c1", platform: "PC" }] }),
    ])[0];
    expect(editionLabel(e, "Chrono Trigger")).toBe("CT Remaster (PC)");
  });

  it("falls back to the title when no platform is recorded", () => {
    const e = hubEditions([game({ id: "a" })])[0];
    expect(editionLabel(e, "Chrono Trigger")).toBe("Chrono Trigger");
  });

  it("labels a family entry with its name and size", () => {
    const a = game({ id: "a", familyId: "F", familyName: "Chrono Saga" });
    const b = game({ id: "b", familyId: "F", familyName: "Chrono Saga" });
    const e = hubEditions([a, b])[0];
    expect(editionLabel(e, "Chrono Trigger")).toBe("Chrono Saga — Family (2 editions)");
  });
});
