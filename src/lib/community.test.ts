import { describe, it, expect, beforeEach } from "vitest";
import {
  COMMUNITY_VIEWS,
  isCommunityView,
  loadCommunitySection,
  saveCommunitySection,
} from "./community";

describe("COMMUNITY_VIEWS", () => {
  it("lists the sections in tab order, Friends first", () => {
    expect(COMMUNITY_VIEWS).toEqual([
      "community",
      "community-activity",
      "community-messages",
      "community-recs",
      "community-discover",
    ]);
  });
});

describe("isCommunityView", () => {
  it("accepts every Community section", () => {
    for (const v of COMMUNITY_VIEWS) expect(isCommunityView(v)).toBe(true);
  });

  it("rejects other views", () => {
    expect(isCommunityView("backlog")).toBe(false);
    expect(isCommunityView("profile")).toBe(false);
    expect(isCommunityView("master-ledger")).toBe(false);
  });
});

describe("remembered section", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to Friends when nothing is stored", () => {
    expect(loadCommunitySection()).toBe("community");
  });

  it("round-trips the last-viewed section", () => {
    saveCommunitySection("community-messages");
    expect(loadCommunitySection()).toBe("community-messages");
  });

  it("falls back to Friends for an unrecognized stored value", () => {
    localStorage.setItem("bb:community-section", "leaderboard");
    expect(loadCommunitySection()).toBe("community");
  });
});
