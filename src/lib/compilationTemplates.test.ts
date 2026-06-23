import { describe, it, expect } from "vitest";
import {
  normalizeTemplateGames,
  validateTemplateSubmission,
  diffTemplate,
  hasTemplateChanges,
  templateGamesToChildDrafts,
  type TemplateGame,
} from "./compilationTemplates";

const g = (name: string, hours?: number): TemplateGame => ({ name, hours });

describe("normalizeTemplateGames", () => {
  it("trims names, drops nameless games, and clears non-positive hours", () => {
    const out = normalizeTemplateGames([
      { name: "  Mario 64  ", hours: 12 },
      { name: "  ", hours: 5 },
      { name: "Sunshine", hours: 0 },
    ]);
    expect(out).toEqual([
      { name: "Mario 64", hours: 12, image: undefined, rawgId: undefined, catalogId: undefined, genres: undefined },
      { name: "Sunshine", hours: undefined, image: undefined, rawgId: undefined, catalogId: undefined, genres: undefined },
    ]);
  });
});

describe("validateTemplateSubmission", () => {
  it("requires a title and at least one named game", () => {
    expect(validateTemplateSubmission("", [g("A")])).toMatch(/title/i);
    expect(validateTemplateSubmission("Bundle", [{ name: "  " }])).toMatch(/at least one/i);
    expect(validateTemplateSubmission("Bundle", [g("A")])).toBeNull();
  });
});

describe("diffTemplate", () => {
  it("reports title change, added, removed, and changed games", () => {
    const before = { title: "Bundle", games: [g("Mario 64", 12), g("Sunshine", 14)] };
    const after = { title: "All-Stars", games: [g("Mario 64", 13), g("Galaxy", 16)] };
    const d = diffTemplate(before, after);
    expect(d.titleChanged).toEqual({ before: "Bundle", after: "All-Stars" });
    expect(d.added.map((x) => x.name)).toEqual(["Galaxy"]);
    expect(d.removed.map((x) => x.name)).toEqual(["Sunshine"]);
    expect(d.changed).toEqual([{ name: "Mario 64", beforeHours: 12, afterHours: 13 }]);
  });

  it("matches games by name case-insensitively", () => {
    const d = diffTemplate(
      { title: "B", games: [g("Mario 64", 12)] },
      { title: "B", games: [g("mario 64", 12)] },
    );
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(hasTemplateChanges(
      { title: "B", games: [g("Mario 64", 12)] },
      { title: "B", games: [g("mario 64", 12)] },
    )).toBe(false);
  });
});

describe("templateGamesToChildDrafts", () => {
  it("maps games to drafts without cost or gameId", () => {
    const drafts = templateGamesToChildDrafts([
      { name: "Mario 64", hours: 12, image: "x.png", rawgId: 5, genres: ["Platformer"] },
    ]);
    expect(drafts).toEqual([
      { name: "Mario 64", hours: 12, image: "x.png", rawgId: 5, catalogId: undefined, genres: ["Platformer"] },
    ]);
    // No personal fields leak in.
    expect(drafts[0]).not.toHaveProperty("cost");
    expect(drafts[0]).not.toHaveProperty("gameId");
  });
});
