import { describe, it, expect } from "vitest";
import {
  type CatalogFields,
  emptyCatalogFields,
  normalizeCatalogFields,
  normalizeList,
  diffCatalog,
  hasChanges,
  displayField,
  validateSubmission,
} from "./submissions";

function fields(over: Partial<CatalogFields> = {}): CatalogFields {
  return {
    title: "Hollow Knight",
    image: "https://x/cover.jpg",
    platforms: ["PC", "Nintendo Switch"],
    genres: ["Metroidvania"],
    released: "2017-02-24",
    hours: 27,
    ...over,
  };
}

describe("normalizeList", () => {
  it("trims, drops blanks, and dedupes case-insensitively", () => {
    expect(normalizeList([" PC ", "pc", "", "Switch"])).toEqual(["PC", "Switch"]);
  });
  it("treats undefined as empty", () => {
    expect(normalizeList(undefined)).toEqual([]);
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
});
