import { describe, it, expect } from "vitest";
import {
  type CatalogFields,
  type CatalogOverride,
  emptyCatalogFields,
  normalizeCatalogFields,
  normalizeList,
  parseDevelopers,
  diffCatalog,
  hasChanges,
  displayField,
  validateSubmission,
  applyCatalogOverride,
  canRevertSubmission,
  revertResultMessage,
  normalizeCatalogTitle,
} from "./submissions";
import type { GameMeta, GameSubmission } from "../types";

function fields(over: Partial<CatalogFields> = {}): CatalogFields {
  return {
    title: "Hollow Knight",
    image: "https://x/cover.jpg",
    platforms: ["PC", "Nintendo Switch"],
    genres: ["Metroidvania"],
    developers: ["Team Cherry"],
    released: "2017-02-24",
    hours: 27,
    screenshots: [],
    ...over,
  };
}

describe("normalizeCatalogTitle", () => {
  it("trims and lowercases so case/whitespace variants match (mirrors the SQL form)", () => {
    expect(normalizeCatalogTitle("  Xenoblade Chronicles  ")).toBe("xenoblade chronicles");
    expect(normalizeCatalogTitle("XENOBLADE chronicles")).toBe(
      normalizeCatalogTitle("xenoblade Chronicles"),
    );
  });
});

describe("normalizeList", () => {
  it("trims, drops blanks, and dedupes case-insensitively", () => {
    expect(normalizeList([" PC ", "pc", "", "Switch"])).toEqual(["PC", "Switch"]);
  });
  it("treats undefined as empty", () => {
    expect(normalizeList(undefined)).toEqual([]);
  });
});

describe("parseDevelopers", () => {
  it("splits a comma-delimited string, trims, and dedupes", () => {
    expect(parseDevelopers("CD PROJEKT RED, CD PROJEKT")).toEqual([
      "CD PROJEKT RED",
      "CD PROJEKT",
    ]);
    expect(parseDevelopers(" Team Cherry ")).toEqual(["Team Cherry"]);
    expect(parseDevelopers("")).toEqual([]);
    expect(parseDevelopers("Naughty Dog, naughty dog")).toEqual(["Naughty Dog"]);
  });
});

describe("normalizeCatalogFields", () => {
  it("trims strings and coerces a bad playtime to null", () => {
    const n = normalizeCatalogFields(
      fields({ title: "  T  ", released: " 2020-01-01 ", hours: -5 }),
    );
    expect(n.title).toBe("T");
    expect(n.released).toBe("2020-01-01");
    expect(n.hours).toBeNull();
  });
  it("keeps a valid playtime and normalizes lists", () => {
    const n = normalizeCatalogFields(fields({ platforms: ["PC", "pc"], hours: 12 }));
    expect(n.platforms).toEqual(["PC"]);
    expect(n.hours).toBe(12);
  });
});

describe("displayField", () => {
  it("joins lists and dashes empties", () => {
    expect(displayField("platforms", fields())).toBe("PC, Nintendo Switch");
    expect(displayField("genres", fields({ genres: [] }))).toBe("—");
    expect(displayField("hours", fields({ hours: null }))).toBe("—");
    expect(displayField("hours", fields({ hours: 27 }))).toBe("27h");
    expect(displayField("released", fields({ released: "" }))).toBe("—");
  });
});

describe("diffCatalog", () => {
  it("returns nothing when normalized values match (trim + dedupe, first spelling kept)", () => {
    const a = fields();
    // " PC " trims to the kept "PC"; the trailing "pc" is a case-insensitive dupe.
    const b = fields({ platforms: [" PC ", "Nintendo Switch", "pc"] });
    expect(diffCatalog(a, b)).toEqual([]);
    expect(hasChanges(a, b)).toBe(false);
  });

  it("flags only the changed fields with before/after display strings", () => {
    const before = fields();
    const after = fields({ title: "Hollow Knight: Silksong", hours: 40, platforms: ["PC"] });
    const d = diffCatalog(before, after);
    expect(d.map((x) => x.key).sort()).toEqual(["hours", "platforms", "title"]);
    const title = d.find((x) => x.key === "title")!;
    expect(title.before).toBe("Hollow Knight");
    expect(title.after).toBe("Hollow Knight: Silksong");
    const hours = d.find((x) => x.key === "hours")!;
    expect(hours.before).toBe("27h");
    expect(hours.after).toBe("40h");
  });
});

describe("applyCatalogOverride", () => {
  const meta: GameMeta = {
    title: "RAWG Title",
    released: "2017-01-01",
    hours: 10,
    image: "rawg.jpg",
    genres: ["Action"],
    platforms: ["PC"],
    developers: ["RAWG Studio"],
  };

  it("returns the meta unchanged when there's no catalog record", () => {
    expect(applyCatalogOverride(meta, null)).toEqual(meta);
  });

  it("overrides every field the catalog has set and replaces platforms", () => {
    const c: CatalogOverride = {
      catalogId: "cat1",
      title: "Approved Title",
      image: "approved.jpg",
      genres: ["Action", "RPG"],
      developers: ["Approved Studio"],
      released: "2018-02-02",
      hours: 25,
      platforms: ["Nintendo Switch 2"],
      screenshots: [],
    };
    const out = applyCatalogOverride(meta, c); // meta.platforms = ["PC"]
    expect(out.catalogId).toBe("cat1");
    expect(out.title).toBe("Approved Title");
    expect(out.image).toBe("approved.jpg");
    expect(out.genres).toEqual(["Action", "RPG"]);
    expect(out.developers).toEqual(["Approved Studio"]);
    expect(out.released).toBe("2018-02-02");
    expect(out.hours).toBe(25);
    // Replaced, not merged — a removed platform must not reappear from RAWG.
    expect(out.platforms).toEqual(["Nintendo Switch 2"]);
  });

  it("keeps the RAWG value for fields the catalog hasn't set", () => {
    const c: CatalogOverride = {
      catalogId: "cat1",
      title: "",
      image: "",
      genres: [],
      developers: [], // catalog has no developers → keep RAWG's
      released: "",
      hours: null,
      platforms: [], // catalog has no platforms → keep RAWG's
      screenshots: [],
    };
    const out = applyCatalogOverride(meta, c);
    expect(out.title).toBe("RAWG Title");
    expect(out.image).toBe("rawg.jpg");
    expect(out.genres).toEqual(["Action"]);
    expect(out.developers).toEqual(["RAWG Studio"]);
    expect(out.released).toBe("2017-01-01");
    expect(out.hours).toBe(10);
    expect(out.platforms).toEqual(["PC"]);
    expect(out.catalogId).toBe("cat1");
  });
});

describe("validateSubmission", () => {
  it("requires a title", () => {
    expect(validateSubmission(emptyCatalogFields(), fields({ title: "  " }), "new")).toBe(
      "A title is required.",
    );
  });

  it("rejects a non-URL cover and an invalid date", () => {
    expect(validateSubmission(emptyCatalogFields(), fields({ image: "not-a-url" }), "new")).toBe(
      "Cover art must be a valid http(s) URL.",
    );
    expect(
      validateSubmission(emptyCatalogFields(), fields({ released: "13/40/2020" }), "new"),
    ).toBe("Release date is invalid.");
  });

  it("rejects a negative playtime", () => {
    expect(validateSubmission(emptyCatalogFields(), fields({ hours: -2 }), "new")).toBe(
      "Estimated playtime can't be negative.",
    );
  });

  it("requires an edit to actually change something", () => {
    const same = fields();
    expect(validateSubmission(same, fields(), "edit")).toBe("No changes to submit yet.");
    expect(validateSubmission(same, fields({ hours: 30 }), "edit")).toBeNull();
  });

  it("accepts a valid new-game proposal (no prior values, no diff required)", () => {
    expect(validateSubmission(emptyCatalogFields(), fields(), "new")).toBeNull();
  });

  it("accepts an empty cover and empty release date", () => {
    expect(
      validateSubmission(emptyCatalogFields(), fields({ image: "", released: "" }), "new"),
    ).toBeNull();
  });

  it("caps the number of screenshots and requires http(s) URLs", () => {
    expect(
      validateSubmission(emptyCatalogFields(), fields({ screenshots: ["not-a-url"] }), "new"),
    ).toBe("Screenshots must be valid http(s) URLs.");
    const seven = Array.from({ length: 7 }, (_, i) => `https://x/${i}.jpg`);
    expect(validateSubmission(emptyCatalogFields(), fields({ screenshots: seven }), "new")).toMatch(
      /Up to 6 screenshots/,
    );
  });
});

describe("diffCatalog — screenshots", () => {
  it("detects a screenshot change even when the count is unchanged", () => {
    const before = fields({ screenshots: ["https://x/a.jpg", "https://x/b.jpg"] });
    const after = fields({ screenshots: ["https://x/a.jpg", "https://x/c.jpg"] });
    const diff = diffCatalog(before, after);
    const shot = diff.find((d) => d.key === "screenshots");
    expect(shot).toBeTruthy();
    expect(shot?.after).toBe("2 images");
  });

  it("reports no change when the screenshot list matches", () => {
    const f = fields({ screenshots: ["https://x/a.jpg"] });
    expect(diffCatalog(f, fields({ screenshots: ["https://x/a.jpg"] }))).toEqual([]);
  });
});

describe("canRevertSubmission", () => {
  type RevertInput = Pick<GameSubmission, "kind" | "status" | "deletedAt" | "revertedAt">;
  const sub = (over: Partial<RevertInput> = {}): RevertInput => ({
    kind: "edit",
    status: "approved",
    deletedAt: null,
    revertedAt: null,
    ...over,
  });

  it("allows reverting an approved, not-yet-reverted edit", () => {
    expect(canRevertSubmission(sub())).toBe(true);
  });

  it("refuses a new-game approval (no prior state, may be in libraries)", () => {
    expect(canRevertSubmission(sub({ kind: "new" }))).toBe(false);
  });

  it("refuses pending or rejected submissions", () => {
    expect(canRevertSubmission(sub({ status: "pending" }))).toBe(false);
    expect(canRevertSubmission(sub({ status: "rejected" }))).toBe(false);
  });

  it("refuses an already-reverted or soft-deleted submission", () => {
    expect(canRevertSubmission(sub({ revertedAt: 1700000000000 }))).toBe(false);
    expect(canRevertSubmission(sub({ deletedAt: 1700000000000 }))).toBe(false);
  });
});

describe("revertResultMessage", () => {
  it("lists reverted fields by their human label", () => {
    expect(revertResultMessage(["title", "image"], [])).toBe("Reverted Title, Cover art.");
  });

  it("notes skipped fields that changed since approval", () => {
    expect(revertResultMessage(["title"], ["platforms"])).toBe(
      "Reverted Title. Left Platforms (changed since approval).",
    );
  });

  it("handles nothing reverted", () => {
    expect(revertResultMessage([], ["hours"])).toBe(
      "Nothing reverted. Left Estimated playtime (changed since approval).",
    );
  });
});
