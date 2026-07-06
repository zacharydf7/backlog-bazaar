import { describe, it, expect } from "vitest";
import type { Game } from "../types";
import { parseCsv, mapHeaders, buildImportPlan, type CsvImportPlan } from "./csvImport";

const PLATFORMS = ["PC", "PlayStation 5", "Nintendo Switch"];

function plan(text: string, library: Pick<Game, "title" | "copies" | "status">[] = []) {
  const p = buildImportPlan(text, { platformList: PLATFORMS, library });
  if ("error" in p) throw new Error("unexpected error: " + p.error);
  return p as CsvImportPlan;
}

describe("parseCsv", () => {
  it("parses quoted fields with embedded commas, quotes, and newlines", () => {
    const rows = parseCsv('title,note\n"Hello, World","He said ""hi""\nsecond line"\n');
    expect(rows).toEqual([
      ["title", "note"],
      ["Hello, World", 'He said "hi"\nsecond line'],
    ]);
  });

  it("handles CRLF, a BOM, and drops fully empty rows", () => {
    const rows = parseCsv("﻿title\r\nHalo\r\n , \r\n\r\nDoom\r\n");
    expect(rows).toEqual([["title"], ["Halo"], ["Doom"]]);
  });
});

describe("mapHeaders", () => {
  it("maps loose header spellings and reports the ignored ones", () => {
    const { columns, mapped, unmapped } = mapHeaders([
      "Game Title",
      "System",
      "Price Paid",
      "Hours Played",
      "Rating",
    ]);
    expect(columns).toEqual(["title", "platform", "cost", "played", null]);
    expect(mapped.title).toBe("Game Title");
    expect(unmapped).toEqual(["Rating"]);
  });

  it("gives a duplicate-looking header to the first column only", () => {
    const { columns } = mapHeaders(["Title", "Name"]);
    expect(columns).toEqual(["title", null]);
  });
});

describe("buildImportPlan", () => {
  it("builds addGame-ready drafts: canonical platform, cost, length, played, status", () => {
    const p = plan(
      [
        "Title,Platform,Format,Cost,Length,Played,Status,Notes",
        'Hades,pc,digital,$24.99,22,"1h 30m",finished,gift',
        "Stray,playstation 5,physical,,7,,wishlist,",
      ].join("\n"),
    );
    expect(p.addable).toBe(2);
    const [hades, stray] = p.rows.map((r) => r.draft!);
    expect(hades).toMatchObject({
      title: "Hades",
      platform: "PC", // canonical spelling, not "pc"
      format: "digital",
      cost: 24.99,
      hours: 22,
      playedHours: 1.5,
      status: "finished",
      finishTag: "beaten",
      note: "gift",
    });
    expect(stray).toMatchObject({ title: "Stray", platform: "PlayStation 5", status: "wishlist" });
    expect(stray.cost).toBeUndefined();
  });

  it("maps completed/100% to the Completed finish tag", () => {
    const p = plan("Title,Status\nCeleste,100%");
    expect(p.rows[0].draft).toMatchObject({ status: "finished", finishTag: "completed" });
  });

  it("refuses to import straight into Now Playing — coerces to Bazaar with a warning", () => {
    const p = plan("Title,Status\nElden Ring,playing");
    expect(p.rows[0].action).toBe("add");
    expect(p.rows[0].draft!.status).toBe("backlog");
    expect(p.rows[0].issues.join(" ")).toMatch(/Now Playing/i);
  });

  it("drops an off-list platform (server would reject it) but keeps the game", () => {
    const p = plan("Title,Platform\nOkami,Dreamcast 2");
    expect(p.rows[0].action).toBe("add");
    expect(p.rows[0].draft!.platform).toBeUndefined();
    expect(p.rows[0].issues.join(" ")).toMatch(/Unknown platform "Dreamcast 2"/);
  });

  it("skips duplicates: already-owned title+platform, and repeats within the file", () => {
    const library = [
      { title: "Hades", status: "backlog", copies: [{ id: "c", platform: "PC" }] } as Game,
    ];
    const p = plan(
      ["Title,Platform", "Hades,PC", "Hades,Nintendo Switch", "Stray,PC", "Stray,PC"].join("\n"),
      library,
    );
    // Hades/PC = library dup; Hades/Switch = a NEW per-platform instance (kept);
    // second Stray/PC = in-file dup.
    expect(p.rows.map((r) => r.action)).toEqual(["skip-duplicate", "add", "add", "skip-duplicate"]);
    expect(p.addable).toBe(2);
    expect(p.duplicates).toBe(2);
  });

  it("marks title-less rows invalid and counts them", () => {
    const p = plan("Title,Platform\n,PC\nOkami,PC");
    expect(p.rows[0].action).toBe("skip-invalid");
    expect(p.invalid).toBe(1);
    expect(p.addable).toBe(1);
  });

  it("errors on an empty file, a headerless file, and a header-only file", () => {
    const ctx = { platformList: PLATFORMS, library: [] };
    expect(buildImportPlan("", ctx)).toHaveProperty("error");
    expect(buildImportPlan("Halo\nDoom", ctx)).toHaveProperty("error"); // no Title header
    expect(buildImportPlan("Title,Platform", ctx)).toHaveProperty("error");
  });
});
