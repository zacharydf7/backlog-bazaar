import { describe, it, expect } from "vitest";
import { COMMUNITY_VIEWS, isCommunityView } from "./community";

describe("COMMUNITY_VIEWS", () => {
  it("lists the four sections in tab order, Friends first", () => {
    expect(COMMUNITY_VIEWS).toEqual([
      "community",
      "community-activity",
      "community-messages",
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
