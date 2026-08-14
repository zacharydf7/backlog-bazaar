import { describe, it, expect } from "vitest";
import {
  pendingCount,
  releaseYear,
  rowToIdentityLink,
  sideLabel,
  sortForReview,
  yearsDisagree,
  type IdentityLink,
  type IdentityLinkRow,
} from "./identityLinks";

function row(over: Partial<IdentityLinkRow> = {}): IdentityLinkRow {
  return {
    id: "l1",
    rawg_id: 52371,
    igdb_id: 229177,
    title_key: "super mario sunshine",
    status: "linked",
    source: "auto",
    decided_by: null,
    decided_name: null,
    decided_at: null,
    created_at: "2026-08-14T00:00:00.000Z",
    rawg_title: "Super Mario Sunshine",
    rawg_released: "2002-08-26",
    igdb_title: "Super Mario Sunshine",
    igdb_released: "2020-09-18",
    copy_count: 5,
    ...over,
  };
}

function link(over: Partial<IdentityLink> = {}): IdentityLink {
  return { ...rowToIdentityLink(row()), ...over };
}

describe("rowToIdentityLink", () => {
  it("maps a row, parsing dates and counts", () => {
    const l = rowToIdentityLink(row({ decided_name: "Zach", decided_at: "2026-08-14T01:00:00Z" }));
    expect(l.rawgId).toBe(52371);
    expect(l.igdbId).toBe(229177);
    expect(l.status).toBe("linked");
    expect(l.copyCount).toBe(5);
    expect(l.decidedByName).toBe("Zach");
    expect(l.decidedAt).toBe(Date.parse("2026-08-14T01:00:00Z"));
  });

  it("falls back to a review-needed state for an unknown status", () => {
    expect(rowToIdentityLink(row({ status: "who-knows" })).status).toBe("suggested");
    expect(rowToIdentityLink(row({ source: "who-knows" })).source).toBe("auto");
    expect(rowToIdentityLink(row({ title_key: null, copy_count: null })).titleKey).toBe("");
    expect(rowToIdentityLink(row({ copy_count: null })).copyCount).toBe(0);
  });
});

describe("releaseYear / yearsDisagree", () => {
  it("reads the year off an ISO date", () => {
    expect(releaseYear("2002-08-26")).toBe(2002);
    expect(releaseYear(null)).toBeNull();
    expect(releaseYear("not-a-date")).toBeNull();
  });

  it("flags a pair whose two sides carry different years", () => {
    // Doom 1993 vs Doom 2016 — the pair a title match must never settle alone.
    expect(yearsDisagree(link({ rawgReleased: "1993-12-10", igdbReleased: "2016-05-13" }))).toBe(
      true,
    );
    expect(yearsDisagree(link({ rawgReleased: "2017-01-01", igdbReleased: "2017-09-09" }))).toBe(
      false,
    );
  });

  it("stays quiet when either side has no date to compare", () => {
    expect(yearsDisagree(link({ rawgReleased: null }))).toBe(false);
    expect(yearsDisagree(link({ igdbReleased: null }))).toBe(false);
  });
});

describe("sideLabel", () => {
  it("names a side with its year, falling back to the matched title", () => {
    expect(sideLabel("Doom", "1993-12-10", "doom")).toBe("Doom (1993)");
    expect(sideLabel("Doom", null, "doom")).toBe("Doom");
    expect(sideLabel(null, "2016-05-13", "doom")).toBe("doom (2016)");
    expect(sideLabel("  ", null, "")).toBe("Untitled");
  });
});

describe("sortForReview / pendingCount", () => {
  it("puts open candidates first, then live links, then dismissals", () => {
    const rows = [
      link({ id: "a", status: "dismissed", createdAt: 3 }),
      link({ id: "b", status: "linked", createdAt: 1 }),
      link({ id: "c", status: "suggested", createdAt: 2 }),
      link({ id: "d", status: "suggested", createdAt: 9 }),
    ];
    expect(sortForReview(rows).map((l) => l.id)).toEqual(["d", "c", "b", "a"]);
    expect(pendingCount(rows)).toBe(2);
  });

  it("doesn't mutate the input", () => {
    const rows = [link({ id: "a", status: "dismissed" }), link({ id: "b", status: "suggested" })];
    sortForReview(rows);
    expect(rows.map((l) => l.id)).toEqual(["a", "b"]);
  });
});
