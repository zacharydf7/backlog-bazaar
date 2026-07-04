import { describe, it, expect } from "vitest";
import {
  coerceCommunityReview,
  reviewStatusLabel,
  reviewDateLabel,
} from "./communityReviews";

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  user_id: "u1",
  display_name: "Sky",
  avatar_url: "https://x/a.jpg",
  review: "Wonderful story, though the gameplay tends to be a slog.",
  score: 7,
  status: "finished",
  finish_tag: "completed",
  platforms: ["Nintendo Switch"],
  reviewed_at: "2026-06-14T12:00:00.000Z",
  ...over,
});

describe("coerceCommunityReview", () => {
  it("maps a full row", () => {
    const r = coerceCommunityReview(row());
    expect(r).toEqual({
      userId: "u1",
      displayName: "Sky",
      avatarUrl: "https://x/a.jpg",
      review: "Wonderful story, though the gameplay tends to be a slog.",
      score: 7,
      status: "finished",
      finishTag: "completed",
      platforms: ["Nintendo Switch"],
      reviewedAt: "2026-06-14T12:00:00.000Z",
    });
  });

  it("keeps a score-only row (empty write-up) and a text-only row (no score)", () => {
    expect(coerceCommunityReview(row({ review: "  " }))?.review).toBe("");
    expect(coerceCommunityReview(row({ score: null }))?.score).toBeNull();
  });

  it("drops rows with nothing reviewable or no user", () => {
    expect(coerceCommunityReview(row({ review: "", score: null }))).toBeNull();
    expect(coerceCommunityReview(row({ review: " ", score: 0 }))).toBeNull();
    expect(coerceCommunityReview(row({ user_id: 7 }))).toBeNull();
  });

  it("defends against malformed fields", () => {
    const r = coerceCommunityReview(
      row({
        display_name: "  ",
        avatar_url: null,
        status: "bogus",
        finish_tag: "bogus",
        platforms: ["PC", "", 3],
        reviewed_at: 12345,
      }),
    );
    expect(r?.displayName).toBe("Someone");
    expect(r?.avatarUrl).toBeNull();
    expect(r?.status).toBe("backlog");
    expect(r?.finishTag).toBeNull();
    expect(r?.platforms).toEqual(["PC"]);
    expect(r?.reviewedAt).toBeNull();
  });
});

describe("reviewStatusLabel", () => {
  it("labels a finished game by how it concluded (untagged ⇒ Beaten)", () => {
    expect(reviewStatusLabel("finished", "completed")).toBe("Completed");
    expect(reviewStatusLabel("finished", "beaten")).toBe("Beaten");
    expect(reviewStatusLabel("finished", "endless")).toBe("Endless");
    expect(reviewStatusLabel("finished", null)).toBe("Beaten");
  });

  it("labels the other statuses", () => {
    expect(reviewStatusLabel("playing", null)).toBe("Now Playing");
    expect(reviewStatusLabel("backlog", null)).toBe("In their Bazaar");
    expect(reviewStatusLabel("wishlist", null)).toBe("Wishlisted");
  });
});

describe("reviewDateLabel", () => {
  it("formats an absolute date and tolerates junk", () => {
    expect(reviewDateLabel("2026-06-27T15:00:00.000Z")).toMatch(/Jun 2\d, 2026/);
    expect(reviewDateLabel(null)).toBe("");
    expect(reviewDateLabel("not-a-date")).toBe("");
  });
});
