import { describe, it, expect, afterEach } from "vitest";
import {
  coerceRecommendation,
  coerceRecipientOption,
  incomingRecommendations,
  recBounty,
  recDiscountedPrice,
  recipientBlockReason,
  recommendationForGame,
  recommendationToAddMeta,
  recStatusLabel,
  sentRecommendations,
  REC_MAX_PENDING_PER_FRIEND,
  type GameRecommendation,
} from "./recommendations";
import { setIdentityLinks } from "./ownershipMerge";

afterEach(() => setIdentityLinks([]));

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "r1",
    sender: "alice",
    receiver: "bob",
    sender_name: "Alice",
    sender_avatar: null,
    receiver_name: "Bob",
    game_title: "Octopath Traveler",
    game_image: "https://img/x.jpg",
    rawg_id: 46667,
    igdb_id: null,
    catalog_id: null,
    hours: 60,
    pitch: "Trust me on this one.",
    status: "pending",
    imported_game_id: null,
    bounty_paid: null,
    created_at: "2026-08-29T12:00:00Z",
    responded_at: null,
    activated_at: null,
    ...over,
  };
}

function rec(over: Partial<GameRecommendation> = {}): GameRecommendation {
  return { ...coerceRecommendation(row())!, ...over };
}

describe("coerceRecommendation", () => {
  it("maps a full row and parses timestamps", () => {
    const r = coerceRecommendation(row())!;
    expect(r.gameTitle).toBe("Octopath Traveler");
    expect(r.pitch).toBe("Trust me on this one.");
    expect(r.createdAt).toBe(Date.parse("2026-08-29T12:00:00Z"));
    expect(r.status).toBe("pending");
  });

  it("drops malformed rows and blanks out an empty pitch", () => {
    expect(coerceRecommendation({ id: 5 })).toBeNull();
    expect(coerceRecommendation(row({ status: "weird" }))).toBeNull();
    expect(coerceRecommendation(row({ pitch: "   " }))!.pitch).toBeNull();
  });
});

describe("recipient options", () => {
  it("coerces a picker row", () => {
    const o = coerceRecipientOption({
      id: "u1",
      display_name: "Cleo",
      avatar_url: null,
      owns_game: false,
      pending_count: 1,
    })!;
    expect(o.displayName).toBe("Cleo");
    expect(recipientBlockReason(o)).toBeNull();
  });

  it("blocks owners and friends at the pending cap", () => {
    const owner = coerceRecipientOption({
      id: "u1", display_name: "C", owns_game: true, pending_count: 0,
    })!;
    expect(recipientBlockReason(owner)).toMatch(/Already has this game/);
    const capped = coerceRecipientOption({
      id: "u2", display_name: "D", owns_game: false,
      pending_count: REC_MAX_PENDING_PER_FRIEND,
    })!;
    expect(recipientBlockReason(capped)).toMatch(/3 recommendations/);
  });
});

describe("inbox selectors", () => {
  const recs = [
    rec({ id: "a", receiver: "me", status: "pending" }),
    rec({ id: "b", receiver: "me", status: "imported" }),
    rec({ id: "c", receiver: "me", status: "declined" }),
    rec({ id: "d", receiver: "me", status: "activated" }),
    rec({ id: "e", sender: "me", receiver: "friend" }),
  ];

  it("incoming = my pending cards only (imported ones live on the boards)", () => {
    expect(incomingRecommendations(recs, "me").map((r) => r.id)).toEqual(["a"]);
    expect(incomingRecommendations(recs, null)).toEqual([]);
  });

  it("sent = everything I authored, any status", () => {
    expect(sentRecommendations(recs, "me").map((r) => r.id)).toEqual(["e"]);
  });
});

describe("recommendationForGame", () => {
  it("matches my copy by explicit import link", () => {
    const r = rec({ receiver: "me", status: "imported", importedGameId: "g9", rawgId: null });
    expect(recommendationForGame([r], "me", { id: "g9" } as never)?.id).toBe("r1");
  });

  it("matches by shared catalog identity, crosswalk-aware", () => {
    // Rec snapshotted under the RAWG id; my copy was added from IGDB.
    setIdentityLinks([{ rawgId: 46667, igdbId: 26765 }]);
    const r = rec({ receiver: "me", status: "pending", rawgId: 46667 });
    const mine = { id: "g1", igdbId: 26765 } as never;
    expect(recommendationForGame([r], "me", mine)?.id).toBe("r1");
  });

  it("ignores resolved recs, other receivers, and unrelated games", () => {
    const done = rec({ receiver: "me", status: "activated", rawgId: 46667 });
    expect(recommendationForGame([done], "me", { id: "g1", rawgId: 46667 } as never)).toBeNull();
    const other = rec({ receiver: "someone-else", rawgId: 46667 });
    expect(recommendationForGame([other], "me", { id: "g1", rawgId: 46667 } as never)).toBeNull();
    const mine = rec({ receiver: "me", rawgId: 46667 });
    expect(recommendationForGame([mine], "me", { id: "g1", rawgId: 999 } as never)).toBeNull();
  });
});

describe("economy math (mirrors apply_purchase)", () => {
  it("discounts the start cost, whole coins, never negative", () => {
    expect(recDiscountedPrice(100, 20)).toBe(80);
    expect(recDiscountedPrice(33, 20)).toBe(26); // round(26.4)
    expect(recDiscountedPrice(10, 0)).toBe(10);
    expect(recDiscountedPrice(10, 200)).toBe(1); // pct clamped to 90
    expect(recDiscountedPrice(0, 50)).toBe(0);
  });

  it("bounty = ceil percentage of the PAID price, capped, zero on free runs", () => {
    expect(recBounty(80, 10, 25)).toBe(8);
    expect(recBounty(33, 10, 25)).toBe(4); // ceil(3.3)
    expect(recBounty(1000, 10, 25)).toBe(25); // cap wins
    expect(recBounty(0, 10, 25)).toBe(0); // economy-off / voucher runs pay nothing
  });
});

describe("presentation helpers", () => {
  it("builds an AddGameModal pick from the card's snapshot", () => {
    const m = recommendationToAddMeta(rec({ igdbId: 26765, rawgId: null }));
    expect(m.title).toBe("Octopath Traveler");
    expect(m.igdbId).toBe(26765);
    expect(m.rawgId).toBeUndefined();
    expect(m.genres).toEqual([]);
  });

  it("labels every sent-card status, bounty included", () => {
    expect(recStatusLabel(rec({ status: "pending" }))).toBe("Waiting");
    expect(recStatusLabel(rec({ status: "imported" }))).toMatch(/Added/);
    expect(recStatusLabel(rec({ status: "activated", bountyPaid: 8 }))).toMatch(/8 coins/);
    expect(recStatusLabel(rec({ status: "activated", bountyPaid: 0 }))).toBe("Playing it");
    expect(recStatusLabel(rec({ status: "declined" }))).toBe("Declined");
  });
});
