import { describe, it, expect } from "vitest";
import { isUnseen, RELEASES, LATEST_RELEASE_ID, normalizeReleaseItem, formatReleaseDate } from "./changelog";

describe("isUnseen", () => {
  it("is true when the user has seen nothing", () => {
    expect(isUnseen("v2", null)).toBe(true);
  });

  it("is true when a newer release exists than the one seen", () => {
    expect(isUnseen("v2", "v1")).toBe(true);
  });

  it("is false once the latest has been seen", () => {
    expect(isUnseen("v2", "v2")).toBe(false);
  });

  it("is false when there is no latest id", () => {
    expect(isUnseen("", null)).toBe(false);
  });
});

describe("formatReleaseDate", () => {
  it("renders a date-only string as that exact calendar day in any time zone", () => {
    // Regression: new Date("2026-06-29") is UTC midnight, which renders as Jun 28
    // in zones behind UTC. Parsing as a LOCAL date keeps the 29th everywhere.
    expect(formatReleaseDate("2026-06-29", "en-US")).toBe("Jun 29, 2026");
    expect(formatReleaseDate("2026-01-01", "en-US")).toBe("Jan 1, 2026");
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatReleaseDate("not-a-date", "en-US")).toBe("not-a-date");
  });
});

describe("RELEASES", () => {
  it("has unique ids", () => {
    const ids = RELEASES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes the newest entry as LATEST_RELEASE_ID", () => {
    expect(LATEST_RELEASE_ID).toBe(RELEASES[0].id);
  });

  it("every release has at least one item", () => {
    for (const r of RELEASES) expect(r.items.length).toBeGreaterThan(0);
  });

  it("every item normalizes to non-empty text with a valid tag (or none)", () => {
    const valid = new Set(["feature", "fix", "improvement"]);
    for (const r of RELEASES) {
      for (const raw of r.items) {
        const item = normalizeReleaseItem(raw);
        expect(item.text.length).toBeGreaterThan(0);
        if (item.tag) expect(valid.has(item.tag)).toBe(true);
      }
    }
  });
});

describe("normalizeReleaseItem", () => {
  it("wraps a plain string as untagged text", () => {
    expect(normalizeReleaseItem("Hello")).toEqual({ text: "Hello" });
  });

  it("passes an already-object item through", () => {
    const item = { text: "Fixed a thing", tag: "fix" as const };
    expect(normalizeReleaseItem(item)).toBe(item);
  });
});
