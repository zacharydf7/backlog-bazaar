import { describe, it, expect } from "vitest";
import {
  isUnseen,
  RELEASES,
  LATEST_RELEASE_ID,
  formatReleaseDate,
  groupReleases,
  type Release,
} from "./changelog";

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

  it("every release has a well-formed date that matches its id prefix", () => {
    for (const r of RELEASES) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.id.startsWith(`${r.date}-`)).toBe(true);
    }
  });

  it("no release is dated in the future (the July-5th-on-July-4th regression)", () => {
    // Release dates are local calendar days, so compare against the LOCAL
    // today; dates are ISO (YYYY-MM-DD), so string compare is safe.
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    for (const r of RELEASES) expect(r.date <= today).toBe(true);
  });

  it("is ordered newest first", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(RELEASES[i - 1].date >= RELEASES[i].date).toBe(true);
    }
  });
});

// The owner's writing rules (2026-10-17): short, plain, scannable. These keep
// new entries from drifting back to long, wordy notes.
describe("release style", () => {
  const words = (s: string) => s.trim().split(/\s+/).length;
  const texts = (r: Release) => [r.title, r.summary, ...(r.items ?? [])];

  it("keeps titles to 8 words, summaries to 24 and bullets to 15", () => {
    for (const r of RELEASES) {
      expect(words(r.title), r.id).toBeLessThanOrEqual(8);
      expect(r.summary.length, r.id).toBeGreaterThan(0);
      expect(words(r.summary), r.id).toBeLessThanOrEqual(24);
      for (const item of r.items ?? []) expect(words(item), `${r.id}: ${item}`).toBeLessThanOrEqual(15);
    }
  });

  it("has at most four bullets per release", () => {
    for (const r of RELEASES) expect((r.items ?? []).length, r.id).toBeLessThanOrEqual(4);
  });

  it("uses no em or en dashes", () => {
    for (const r of RELEASES) for (const t of texts(r)) expect(t, r.id).not.toMatch(/[—–]/);
  });

  it("uses American spelling", () => {
    const british = /\b(colour|favourite|behaviour|organis|neighbour|cancelled|centre|catalogue)/i;
    for (const r of RELEASES) for (const t of texts(r)) expect(t, r.id).not.toMatch(british);
  });

  it("links only to pages every player can open", () => {
    const playerPages = new Set([
      "backlog", "playing", "finished", "wishlist", "market", "profile", "lists", "subscriptions",
      "master-ledger", "transaction-ledger", "community", "community-activity", "community-messages",
      "community-recs", "community-discover", "cosmetics", "shop", "achievements", "challenges",
      "account", "about", "calendar",
    ]);
    for (const r of RELEASES) if (r.link) expect(playerPages.has(r.link.view), r.id).toBe(true);
  });
});

describe("groupReleases", () => {
  const rel = (id: string): Release => ({ id, date: id.slice(0, 10), title: "T", summary: "S", tag: "feature" });

  it("opens the newest few, then groups the rest by month, newest first", () => {
    const { recent, months } = groupReleases(
      [rel("2026-10-17-a"), rel("2026-10-02-b"), rel("2026-09-30-c"), rel("2026-09-01-d"), rel("2026-07-04-e")],
      2,
      "en-US",
    );
    expect(recent.map((r) => r.id)).toEqual(["2026-10-17-a", "2026-10-02-b"]);
    expect(months.map((m) => [m.key, m.label, m.releases.map((r) => r.id)])).toEqual([
      ["2026-09", "September 2026", ["2026-09-30-c", "2026-09-01-d"]],
      ["2026-07", "July 2026", ["2026-07-04-e"]],
    ]);
  });

  it("has no months when everything fits in the open part", () => {
    expect(groupReleases([rel("2026-10-17-a")], 5).months).toEqual([]);
  });
});
