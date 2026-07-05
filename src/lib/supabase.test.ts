import { describe, it, expect } from "vitest";
import {
  rowToGame,
  rowToComment,
  rowToIssue,
  rowToIssueAttachment,
  rowToIssueRelation,
  rowToViewProfile,
  rowToAdminUser,
  rowToRole,
  rowToGameSubmission,
  rowToMySubmission,
  rowToCommunityCatalog,
  rowToLedgerEntry,
  rowToUserStats,
  rowToSlotDefinition,
  rowToUserSearchResult,
  rowToFriend,
  rowToFriendRequest,
  rowToActivityEvent,
  rowToMessage,
  rowToConversation,
  jsonToCatalogFields,
  normalizeCopies,
  type GameRow,
  type MySubmissionRow,
  type CommentRow,
  type IssueRow,
  type IssueAttachmentRow,
  type ViewProfileRow,
  type AdminUserRow,
  type GameSubmissionRow,
  type LedgerRow,
} from "./supabase";

const baseRow: GameRow = {
  id: "id1",
  user_id: "u1",
  rawg_id: 42,
  title: "T",
  released: "2020-01-01",
  hours: 10,
  rating: 4.5,
  metacritic: 80,
  genres: ["RPG", "Action"],
  image: "img.png",
  stock_image: "img.png",
  original_image: "img.png",
  platforms: ["PC", "PS5"],
  developers: ["Studio X"],
  esrb: "Mature",
  status: "finished",
  price_paid: 50,
  reward: 100,
  played_hours: 12.5,
  copies: [{ id: "c1", platform: "PS5", cost: 70 }],
  progress_note: "Chapter 3",
  review: "A timeless classic.",
  review_score: 9,
  reviewed_at: "2021-01-02T00:00:00Z",
  liked_at: "2021-01-03T00:00:00Z",
  slot_id: null,
  in_rotation: false,
  rotation_origin: null,
  pre_rotation_ongoing: null,
  ongoing: false,
  completionist: false,
  finish_tag: null,
  family_id: null,
  family_name: null,
  family_image: null,
  family_cover_game_id: null,
  family_split: null,
  compilation_id: null,
  compilation_name: null,
  catalog_id: null,
  private: null,
  resumed: null,
  prerequisite_game_id: null,
  added_at: "2020-01-01T00:00:00Z",
  started_at: null,
  finished_at: "2021-01-01T00:00:00Z",
};

describe("rowToGame", () => {
  it("maps a fully-populated row", () => {
    const g = rowToGame(baseRow);
    expect(g.rawgId).toBe(42);
    expect(g.genres).toEqual(["RPG", "Action"]);
    expect(g.platforms).toEqual(["PC", "PS5"]);
    expect(g.developers).toEqual(["Studio X"]);
    expect(g.esrb).toBe("Mature");
    expect(g.status).toBe("finished");
    expect(g.image).toBe("img.png");
    expect(typeof g.addedAt).toBe("number");
    expect(g.finishedAt).toBe(Date.parse("2021-01-01T00:00:00Z"));
    expect(g.startedAt).toBeUndefined();
    expect(g.playedHours).toBe(12.5);
    expect(g.copies).toEqual([{ id: "c1", platform: "PS5", cost: 70 }]);
    expect(g.progressNote).toBe("Chapter 3");
    expect(g.review).toBe("A timeless classic.");
    expect(g.reviewScore).toBe(9);
    expect(g.reviewedAt).toBe(Date.parse("2021-01-02T00:00:00Z"));
    expect(g.likedAt).toBe(Date.parse("2021-01-03T00:00:00Z"));
  });

  it("preserves a fractional game length (hours is stored to the minute)", () => {
    // Regression: game length used to be an integer column; a 1h 30m length must
    // round-trip as 1.5, not get floored.
    const g = rowToGame({ ...baseRow, hours: 1.5 });
    expect(g.hours).toBe(1.5);
  });

  it("turns nulls into undefined and non-array genres into []", () => {
    const g = rowToGame({
      ...baseRow,
      rawg_id: null,
      image: null,
      genres: null,
      played_hours: null,
      copies: null,
      progress_note: null,
      review: null,
      review_score: null,
      reviewed_at: null,
      liked_at: null,
    });
    expect(g.rawgId).toBeUndefined();
    expect(g.image).toBeUndefined();
    expect(g.genres).toEqual([]);
    expect(g.playedHours).toBe(0);
    expect(g.copies).toEqual([]);
    expect(g.review).toBeUndefined();
    expect(g.reviewScore).toBeUndefined();
    expect(g.reviewedAt).toBeUndefined();
    expect(g.likedAt).toBeNull();
  });

  it("coerces a copy with a null/missing platform to an empty string", () => {
    // Regression: a compilation saved with no platform stores a null platform in
    // the copies JSONB; the client assumed platform was always a string and
    // crashed the whole board. rowToGame must normalize it.
    const g = rowToGame({
      ...baseRow,
      copies: [
        { id: "c1", platform: null, cost: 5 },
        { id: "c2" }, // platform key absent entirely
        { id: "c3", platform: "PC" },
      ] as unknown as GameRow["copies"],
    });
    expect(g.copies).toEqual([
      { id: "c1", platform: "", cost: 5 },
      { id: "c2", platform: "" },
      { id: "c3", platform: "PC" },
    ]);
  });

  it("maps the private flag, defaulting a null to false", () => {
    expect(rowToGame({ ...baseRow, private: true }).private).toBe(true);
    expect(rowToGame({ ...baseRow, private: false }).private).toBe(false);
    expect(rowToGame({ ...baseRow, private: null }).private).toBe(false);
  });
});

describe("normalizeCopies", () => {
  it("returns [] for non-array input", () => {
    expect(normalizeCopies(null)).toEqual([]);
    expect(normalizeCopies(undefined)).toEqual([]);
    expect(normalizeCopies("nope")).toEqual([]);
  });

  it("drops non-object entries and coerces a null platform", () => {
    expect(normalizeCopies([null, "x", { id: "a", platform: null }])).toEqual([
      { id: "a", platform: "" },
    ]);
  });
});

describe("rowToIssue", () => {
  const baseReq: IssueRow = {
    id: "r1",
    kind: "feature",
    title: "T",
    description: "D",
    status: "submitted",
    user_id: "u1",
    requester_name: "Alice",
    is_admin_item: false,
    created_at: "2020-01-01T00:00:00Z",
    edited_at: null,
    vote_count: 3,
    voted_by_me: true,
    comment_count: 5,
    attachment_count: 2,
    tags: ["mobile", "enhancement"],
    priority: "high",
    effort: "low",
  };

  it("maps the comment count to a number", () => {
    expect(rowToIssue(baseReq).commentCount).toBe(5);
  });

  it("maps tags, priority and effort, defaulting nulls", () => {
    const r = rowToIssue(baseReq);
    expect(r.tags).toEqual(["mobile", "enhancement"]);
    expect(r.priority).toBe("high");
    expect(r.effort).toBe("low");
    const missing = rowToIssue({
      ...baseReq,
      tags: null,
      priority: null,
      effort: null,
    });
    expect(missing.tags).toEqual([]);
    expect(missing.priority).toBe("medium");
    expect(missing.effort).toBe("medium");
  });

  it("defaults a missing comment count to 0", () => {
    const r = rowToIssue({ ...baseReq, comment_count: undefined as unknown as number });
    expect(r.commentCount).toBe(0);
  });

  it("maps the attachment count, defaulting a missing value to 0", () => {
    expect(rowToIssue(baseReq).attachmentCount).toBe(2);
    const r = rowToIssue({
      ...baseReq,
      attachment_count: undefined as unknown as number,
    });
    expect(r.attachmentCount).toBe(0);
  });
});

describe("rowToIssueAttachment", () => {
  const row: IssueAttachmentRow = {
    id: "a1",
    request_id: "r1",
    user_id: "u1",
    url: "https://example.com/a.jpg",
    path: "u1/r1/a.jpg",
    name: "a.jpg",
    content_type: "image/jpeg",
    size: 1234,
    created_at: "2020-01-01T00:00:00Z",
  };

  it("maps fields and parses the timestamp", () => {
    const a = rowToIssueAttachment(row);
    expect(a).toMatchObject({
      id: "a1",
      requestId: "r1",
      userId: "u1",
      url: "https://example.com/a.jpg",
      path: "u1/r1/a.jpg",
      name: "a.jpg",
      contentType: "image/jpeg",
      size: 1234,
    });
    expect(a.createdAt).toBe(Date.parse("2020-01-01T00:00:00Z"));
  });
});

describe("rowToIssueRelation", () => {
  it("maps the directed link fields and parses the timestamp", () => {
    const rel = rowToIssueRelation({
      id: "rel1",
      from_request: "r1",
      to_request: "r2",
      kind: "blocks",
      created_at: "2020-01-01T00:00:00Z",
    });
    expect(rel).toMatchObject({
      id: "rel1",
      fromRequest: "r1",
      toRequest: "r2",
      kind: "blocks",
    });
    expect(rel.createdAt).toBe(Date.parse("2020-01-01T00:00:00Z"));
  });
});

describe("rowToLedgerEntry", () => {
  const row: LedgerRow = {
    id: "e1",
    kind: "charter_buy",
    coin_delta: -100,
    charter_delta: 1,
    voucher_delta: 0,
    coin_balance_after: 50,
    charter_balance_after: 1,
    voucher_balance_after: null,
    game_title: null,
    label: null,
    created_at: "2020-01-01T00:00:00Z",
  };

  it("maps the dual-currency fields and parses the timestamp", () => {
    const e = rowToLedgerEntry(row);
    expect(e).toMatchObject({
      id: "e1",
      kind: "charter_buy",
      coinDelta: -100,
      charterDelta: 1,
      coinBalanceAfter: 50,
      charterBalanceAfter: 1,
      gameTitle: null,
      label: null,
    });
    expect(e.createdAt).toBe(Date.parse("2020-01-01T00:00:00Z"));
  });

  it("maps the voucher currency fields", () => {
    const e = rowToLedgerEntry({
      ...row,
      kind: "voucher_redeem",
      coin_delta: 0,
      charter_delta: 0,
      voucher_delta: -1,
      voucher_balance_after: 1,
    });
    expect(e.voucherDelta).toBe(-1);
    expect(e.voucherBalanceAfter).toBe(1);
    // A row from before vouchers existed (nullish) reads as a neutral 0 movement.
    expect(rowToLedgerEntry({ ...row, voucher_delta: null }).voucherDelta).toBe(0);
  });

  it("defaults null deltas to 0 and keeps a null balance", () => {
    const e = rowToLedgerEntry({
      ...row,
      coin_delta: null as unknown as number,
      charter_delta: null as unknown as number,
      coin_balance_after: null,
    });
    expect(e.coinDelta).toBe(0);
    expect(e.charterDelta).toBe(0);
    expect(e.coinBalanceAfter).toBeNull();
  });
});

describe("rowToComment", () => {
  const row: CommentRow = {
    id: "c1",
    request_id: "r1",
    user_id: "u1",
    parent_id: null,
    author_name: "Bob",
    body: "Nice idea",
    created_at: "2021-06-01T00:00:00Z",
    updated_at: "2021-06-01T00:00:00Z",
    reactions: { "👍": 2, "🎉": 1 },
    my_reactions: ["👍"],
    attachments: [
      {
        id: "a1",
        request_id: "r1",
        user_id: "u1",
        url: "https://x/y.png",
        path: "u1/r1/y.png",
        name: "y.png",
        content_type: "image/png",
        size: 10,
        created_at: "2021-06-01T00:00:00Z",
      },
    ],
  };

  it("maps a top-level comment", () => {
    const c = rowToComment(row);
    expect(c.parentId).toBeNull();
    expect(c.authorName).toBe("Bob");
    expect(c.body).toBe("Nice idea");
    expect(c.createdAt).toBe(Date.parse("2021-06-01T00:00:00Z"));
  });

  it("maps embedded comment attachments (and defaults a null list to empty)", () => {
    expect(rowToComment(row).attachments.map((a) => a.name)).toEqual(["y.png"]);
    expect(rowToComment({ ...row, attachments: null }).attachments).toEqual([]);
  });

  it("preserves parent_id for replies", () => {
    expect(rowToComment({ ...row, parent_id: "c0" }).parentId).toBe("c0");
  });

  it("maps reaction tallies and the caller's own reactions", () => {
    const c = rowToComment(row);
    expect(c.reactions).toEqual({ "👍": 2, "🎉": 1 });
    expect(c.myReactions).toEqual(["👍"]);
  });

  it("defaults null reactions to empty", () => {
    const c = rowToComment({ ...row, reactions: null, my_reactions: null });
    expect(c.reactions).toEqual({});
    expect(c.myReactions).toEqual([]);
  });
});

describe("rowToUserStats", () => {
  it("coerces bigint-as-string columns to numbers and passes through tops", () => {
    const s = rowToUserStats({
      coins_earned: "340",
      coins_spent: "120",
      sunk_cost: "45",
      hours_played: 12.5,
      games_added: "5",
      games_finished: "2",
      games_shelved: "1",
      top_game: "Hollow Knight",
      top_genre: "Metroidvania",
      top_platform: "PC",
    });
    expect(s.coinsEarned).toBe(340);
    expect(s.coinsSpent).toBe(120);
    expect(s.sunkCost).toBe(45);
    expect(s.hoursPlayed).toBe(12.5);
    expect(s.gamesAdded).toBe(5);
    expect(s.gamesFinished).toBe(2);
    expect(s.gamesShelved).toBe(1);
    expect(s.topGame).toBe("Hollow Knight");
    expect(s.topPlatform).toBe("PC");
  });

  it("defaults nulls/missing to 0 and null", () => {
    const s = rowToUserStats({
      coins_earned: 0,
      coins_spent: 0,
      sunk_cost: 0,
      hours_played: 0,
      games_added: 0,
      games_finished: 0,
      games_shelved: 0,
      top_game: null,
      top_genre: null,
      top_platform: null,
    });
    expect(s.coinsEarned).toBe(0);
    expect(s.topGame).toBeNull();
    expect(s.topGenre).toBeNull();
  });
});

describe("rowToAdminUser", () => {
  const row: AdminUserRow = {
    id: "u1",
    email: "a@b.com",
    display_name: "Alice",
    avatar_url: null,
    coins: 100,
    vouchers: 2,
    general_slots: 2,
    rotation_slots: 3,
    replay_slots: 2,
    completionist_slots: 2,
    targeted_slots: [
      { name: "Old Reliable", kind: "replay" },
      { name: "Can't Get Enough", kind: "endless" },
    ],
    is_admin: false,
    blocked: false,
    blocked_reason: null,
    hidden: true,
    created_at: "2024-01-01T00:00:00Z",
    onboarding_completed_at: null,
    games_count: 5,
    last_seen_at: null,
    activity: null,
    badges: null,
    roles: null,
  };

  it("maps the hidden flag and coerces it to a boolean", () => {
    expect(rowToAdminUser(row).hidden).toBe(true);
    expect(rowToAdminUser({ ...row, hidden: false }).hidden).toBe(false);
    // Defensive: a nullish value from the RPC becomes false, not undefined.
    expect(rowToAdminUser({ ...row, hidden: null as unknown as boolean }).hidden).toBe(false);
  });

  it("maps onboarding completion (null when never finished)", () => {
    expect(rowToAdminUser(row).onboardingCompletedAt).toBeNull();
    const done = rowToAdminUser({ ...row, onboarding_completed_at: "2024-02-02T00:00:00Z" });
    expect(done.onboardingCompletedAt).toBe(Date.parse("2024-02-02T00:00:00Z"));
  });

  it("maps the roles jsonb array (empty when null)", () => {
    expect(rowToAdminUser(row).roles).toEqual([]);
    const withRoles = rowToAdminUser({
      ...row,
      roles: [{ id: "r1", key: "moderator", name: "Moderator" }],
    });
    expect(withRoles.roles).toEqual([{ id: "r1", key: "moderator", name: "Moderator" }]);
  });

  it("maps targeted slot summaries (name + kind), defaulting a bad kind/list", () => {
    expect(rowToAdminUser(row).targetedSlots).toEqual([
      { name: "Old Reliable", kind: "replay" },
      { name: "Can't Get Enough", kind: "endless" },
    ]);
    // A nullish list becomes empty; a nameless entry is dropped; an unknown kind
    // falls back to 'standard'.
    expect(rowToAdminUser({ ...row, targeted_slots: null }).targetedSlots).toEqual([]);
    expect(
      rowToAdminUser({ ...row, targeted_slots: [{ name: "X", kind: "weird" }, { kind: "endless" }] })
        .targetedSlots,
    ).toEqual([{ name: "X", kind: "standard" }]);
  });
});

describe("rowToRole", () => {
  it("maps a role row and drops stale permission keys", () => {
    const role = rowToRole({
      id: "r1",
      key: "moderator",
      name: "Moderator",
      description: "Reviews submissions",
      permissions: ["issues.moderate", "totally.invalid"],
      is_system: true,
      member_count: "3",
      created_at: "2024-01-01T00:00:00Z",
    });
    expect(role.permissions).toEqual(["issues.moderate"]); // stale key filtered out
    expect(role.isSystem).toBe(true);
    expect(role.memberCount).toBe(3); // bigint string coerced
  });

  it("defaults missing permissions/member count safely", () => {
    const role = rowToRole({
      id: "r2",
      key: "custom",
      name: "Custom",
      description: null,
      permissions: null,
      is_system: false,
    });
    expect(role.permissions).toEqual([]);
    expect(role.memberCount).toBeUndefined();
    expect(role.description).toBeNull();
  });
});

describe("jsonToCatalogFields", () => {
  it("parses a catalog row jsonb and coerces hours", () => {
    const f = jsonToCatalogFields({
      title: "T",
      image: "u",
      platforms: ["PC"],
      genres: ["RPG"],
      developers: ["Team Cherry"],
      released: "2020-01-01",
      hours: "12",
    });
    expect(f).toEqual({
      title: "T",
      image: "u",
      platforms: ["PC"],
      genres: ["RPG"],
      developers: ["Team Cherry"],
      released: "2020-01-01",
      hours: 12,
      screenshots: [],
      isLiveService: false,
    });
  });

  it("parses a screenshots array", () => {
    const f = jsonToCatalogFields({ screenshots: ["https://x/a.jpg", "https://x/b.jpg"] });
    expect(f?.screenshots).toEqual(["https://x/a.jpg", "https://x/b.jpg"]);
  });
  it("returns null for a missing payload and defaults missing fields", () => {
    expect(jsonToCatalogFields(null)).toBeNull();
    expect(jsonToCatalogFields({})).toEqual({
      title: "",
      image: "",
      platforms: [],
      genres: [],
      developers: [],
      released: "",
      hours: null,
      screenshots: [],
      isLiveService: false,
    });
  });
});

describe("rowToGameSubmission", () => {
  const row: GameSubmissionRow = {
    id: "s1",
    submitter: "u1",
    submitter_name: "Alice",
    kind: "edit",
    catalog_id: "c1",
    rawg_id: 42,
    title: "New Title",
    image: "https://x/c.jpg",
    platforms: ["PC", "PS5"],
    genres: ["RPG"],
    developers: ["Team Cherry"],
    released: "2019-05-05",
    hours: 30,
    screenshots: ["https://x/s1.jpg"],
    is_live_service: false,
    before: { title: "Old Title", image: "", platforms: ["PC"], genres: [], developers: [], released: "", hours: null },
    current: { title: "Old Title", image: "", platforms: ["PC"], genres: ["RPG"], released: "2019-05-05", hours: 25 },
    status: "approved",
    reviewer: "admin1",
    reviewer_name: "Mod Bob",
    reviewed_at: "2026-06-23T00:00:00Z",
    review_note: "Looks right",
    reward: 7,
    approved_fields: ["genres", "hours"],
    created_at: "2026-06-22T00:00:00Z",
    deleted_at: null,
    reverted_at: null,
    reverted_by: null,
    reverted_by_name: null,
    reverted_fields: null,
  };

  it("maps the proposed values, before/current, and the review decision", () => {
    const s = rowToGameSubmission(row);
    expect(s.kind).toBe("edit");
    expect(s.submitterName).toBe("Alice");
    expect(s.proposed.title).toBe("New Title");
    expect(s.proposed.platforms).toEqual(["PC", "PS5"]);
    expect(s.proposed.developers).toEqual(["Team Cherry"]);
    expect(s.proposed.hours).toBe(30);
    expect(s.before?.title).toBe("Old Title");
    expect(s.current?.hours).toBe(25);
    expect(s.status).toBe("approved");
    expect(s.reviewerName).toBe("Mod Bob");
    expect(s.reviewedAt).toBe(Date.parse("2026-06-23T00:00:00Z"));
    expect(s.reward).toBe(7);
    expect(s.approvedFields).toEqual(["genres", "hours"]);
    expect(s.createdAt).toBe(Date.parse("2026-06-22T00:00:00Z"));
    expect(s.revertedAt).toBeNull();
    expect(s.revertedFields).toBeNull();
  });

  it("maps the revert audit fields when an approved edit was rolled back", () => {
    const s = rowToGameSubmission({
      ...row,
      reverted_at: "2026-06-24T00:00:00Z",
      reverted_by: "admin1",
      reverted_by_name: "Mod Bob",
      reverted_fields: ["genres"],
    });
    expect(s.revertedAt).toBe(Date.parse("2026-06-24T00:00:00Z"));
    expect(s.revertedByName).toBe("Mod Bob");
    expect(s.revertedFields).toEqual(["genres"]);
  });

  it("tolerates a new-game submission with no catalog/before/current", () => {
    const s = rowToGameSubmission({
      ...row,
      kind: "new",
      catalog_id: null,
      rawg_id: null,
      before: null,
      current: null,
      platforms: null,
      genres: null,
    });
    expect(s.kind).toBe("new");
    expect(s.catalogId).toBeNull();
    expect(s.proposed.platforms).toEqual([]);
    expect(s.before).toBeNull();
    expect(s.current).toBeNull();
  });
});

describe("rowToMySubmission", () => {
  const row: MySubmissionRow = {
    id: "s1",
    kind: "edit",
    title: "My Game",
    image: "https://x/c.jpg",
    platforms: ["PC", "PS5"],
    genres: ["RPG"],
    developers: ["Team Cherry"],
    released: "2020-01-01",
    hours: 12,
    screenshots: [],
    is_live_service: false,
    before: { title: "My Game", image: "", platforms: ["PC"], genres: ["RPG"], developers: [], released: "2020-01-01", hours: 12 },
    status: "approved",
    review_note: "Nice find!",
    reward: 7,
    approved_fields: ["hours"],
    created_at: "2026-06-20T00:00:00Z",
    reviewed_at: "2026-06-21T00:00:00Z",
  };

  it("maps fields, the proposed/before diff baseline, the reward, approved fields, and timestamps", () => {
    const s = rowToMySubmission(row);
    expect(s).toMatchObject({
      id: "s1",
      kind: "edit",
      title: "My Game",
      status: "approved",
      reviewNote: "Nice find!",
      reward: 7,
    });
    expect(s.approvedFields).toEqual(["hours"]);
    expect(s.proposed.platforms).toEqual(["PC", "PS5"]);
    expect(s.before?.platforms).toEqual(["PC"]);
    expect(s.createdAt).toBe(Date.parse("2026-06-20T00:00:00Z"));
    expect(s.reviewedAt).toBe(Date.parse("2026-06-21T00:00:00Z"));
  });

  it("defaults a missing title/note/reviewed_at and a null before for a pending item", () => {
    const s = rowToMySubmission({
      ...row,
      title: null,
      platforms: null,
      genres: null,
      before: null,
      review_note: null,
      reward: null,
      approved_fields: null,
      reviewed_at: null,
      status: "pending",
    });
    expect(s.title).toBe("");
    expect(s.proposed.platforms).toEqual([]);
    expect(s.before).toBeNull();
    expect(s.reviewNote).toBeNull();
    expect(s.reward).toBeNull();
    expect(s.approvedFields).toBeNull();
    expect(s.reviewedAt).toBeNull();
    expect(s.status).toBe("pending");
  });
});

describe("rowToCommunityCatalog", () => {
  it("maps fields, coerces a bigint-ish owner_count, and parses timestamps", () => {
    const e = rowToCommunityCatalog({
      id: "c1",
      title: "Xenoblade Chronicles",
      image: "https://x/cover.jpg",
      platforms: ["Nintendo Switch 2"],
      genres: ["RPG"],
      developers: ["Monolith Soft"],
      released: "2026-06-09",
      hours: 60,
      screenshots: ["https://x/s1.jpg"],
      is_live_service: true,
      owner_count: 3,
      created_at: "2026-06-20T00:00:00Z",
      updated_at: "2026-06-23T00:00:00Z",
    });
    expect(e).toMatchObject({
      id: "c1",
      title: "Xenoblade Chronicles",
      ownerCount: 3,
      platforms: ["Nintendo Switch 2"],
    });
    expect(e.createdAt).toBe(Date.parse("2026-06-20T00:00:00Z"));
    expect(e.updatedAt).toBe(Date.parse("2026-06-23T00:00:00Z"));
  });

  it("defaults a null title, lists, and owner_count", () => {
    const e = rowToCommunityCatalog({
      id: "c2",
      title: null,
      image: null,
      platforms: null,
      genres: null,
      developers: null,
      released: null,
      hours: null,
      screenshots: null,
      is_live_service: null,
      owner_count: null,
      created_at: "2026-06-20T00:00:00Z",
      updated_at: "2026-06-20T00:00:00Z",
    });
    expect(e.title).toBe("");
    expect(e.platforms).toEqual([]);
    expect(e.ownerCount).toBe(0);
  });
});

describe("rowToViewProfile", () => {
  const row: ViewProfileRow = {
    display_name: "Hippo",
    avatar_url: "pic.jpg",
    coins: 250,
    theme: "inferno",
    games_finished: 7,
    hours_finished: 140,
    hide_spend: true,
    last_seen_at: "2026-06-22T00:00:00Z",
    activity: "Browsing the Caravan",
    badges: [
      { id: "b1", slug: "beta-tester", name: "Beta Tester", description: null, icon: "flask-conical", prestige: 10 },
    ],
    title: { id: "b1", slug: "beta-tester", name: "Beta Tester", description: null, icon: "flask-conical", prestige: 10 },
    about_me: "Veteran gamer | Achievement hunter",
    banner_url: "banner.jpg",
    accent: "violet",
    bg: "#131a2b",
  };

  it("maps the public header and coerces types", () => {
    const p = rowToViewProfile(row);
    expect(p.displayName).toBe("Hippo");
    expect(p.avatarUrl).toBe("pic.jpg");
    expect(p.coins).toBe(250);
    expect(p.theme).toBe("inferno");
    expect(p.gamesFinished).toBe(7);
    expect(p.hoursFinished).toBe(140);
    expect(p.hideSpend).toBe(true);
    expect(p.lastSeenAt).toBe(Date.parse("2026-06-22T00:00:00Z"));
    expect(p.activity).toBe("Browsing the Caravan");
    expect(p.badges.map((b) => b.slug)).toEqual(["beta-tester"]);
    expect(p.title?.slug).toBe("beta-tester");
    expect(p.aboutMe).toBe("Veteran gamer | Achievement hunter");
    expect(p.bannerUrl).toBe("banner.jpg");
    expect(p.accent).toBe("violet");
    expect(p.bg).toBe("#131a2b");
  });

  it("defaults nullish avatar/theme/presence and hide_spend", () => {
    const p = rowToViewProfile({
      ...row,
      avatar_url: null,
      theme: null,
      hide_spend: false,
      last_seen_at: null,
      activity: null,
      badges: null,
      title: null,
      about_me: null,
      banner_url: null,
      accent: null,
      bg: null,
    });
    expect(p.avatarUrl).toBeNull();
    expect(p.theme).toBeNull();
    expect(p.hideSpend).toBe(false);
    expect(p.lastSeenAt).toBeNull();
    expect(p.activity).toBeNull();
    expect(p.aboutMe).toBeNull();
    expect(p.bannerUrl).toBeNull();
    expect(p.accent).toBeNull();
    expect(p.bg).toBeNull();
    // Defensive: a null badges payload becomes an empty array; no title.
    expect(p.badges).toEqual([]);
    expect(p.title).toBeNull();
  });
});

describe("rowToSlotDefinition", () => {
  it("maps the slot kind and criteria through", () => {
    const d = rowToSlotDefinition({
      id: "d1",
      name: "Classic RPG",
      kind: "standard",
      min_hours: null,
      max_hours: null,
      min_year: null,
      max_year: 2009,
      min_metacritic: 85,
      max_metacritic: null,
      genres: ["RPG"],
      platforms: ["Nintendo Switch"],
      default_grant_count: 1,
      active: true,
    });
    expect(d.maxYear).toBe(2009);
    expect(d.minMetacritic).toBe(85);
    expect(d.genres).toEqual(["RPG"]);
    expect(d.platforms).toEqual(["Nintendo Switch"]);
    expect(d.defaultGrantCount).toBe(1);
  });

  it("defaults missing kind/criteria (pre-migration rows)", () => {
    const d = rowToSlotDefinition({
      id: "d2",
      name: "Quick Clear",
      min_hours: null,
      max_hours: 10,
      active: true,
    });
    expect(d.kind).toBe("standard");
    expect(d.genres).toEqual([]);
    expect(d.platforms).toEqual([]);
    expect(d.minYear).toBeNull();
    expect(d.defaultGrantCount).toBe(0);
  });
});

describe("social mappers", () => {
  it("maps a user search row, coercing an unknown status to 'none'", () => {
    expect(
      rowToUserSearchResult({ id: "u2", display_name: "Pat", avatar_url: null, status: "friends" }),
    ).toEqual({ id: "u2", displayName: "Pat", avatarUrl: null, status: "friends" });
    expect(
      rowToUserSearchResult({ id: "u3", display_name: "X", avatar_url: null, status: "bogus" })
        .status,
    ).toBe("none");
  });

  it("maps a friend row, preserving a null (hidden) coin balance", () => {
    const f = rowToFriend({
      id: "u4",
      display_name: "Sam",
      avatar_url: "a.png",
      coins: null,
      last_seen_at: "2026-01-01T00:00:00Z",
      activity: "Browsing",
      now_playing: "Hades",
    });
    expect(f.coins).toBeNull();
    expect(f.nowPlaying).toBe("Hades");
    expect(f.lastSeenAt).toBe(Date.parse("2026-01-01T00:00:00Z"));
  });

  it("maps a friend request row, defaulting an odd direction to incoming", () => {
    const r = rowToFriendRequest({
      id: "fr1",
      direction: "outgoing",
      other_id: "u5",
      other_name: "Lee",
      other_avatar: null,
      created_at: "2026-02-02T00:00:00Z",
    });
    expect(r.direction).toBe("outgoing");
    expect(r.otherId).toBe("u5");
    expect(
      rowToFriendRequest({
        id: "fr2",
        direction: "??",
        other_id: "u6",
        other_name: "Jo",
        other_avatar: null,
        created_at: "2026-02-02T00:00:00Z",
      }).direction,
    ).toBe("incoming");
  });

  it("maps an activity event, coercing the bigint cheer count and detail", () => {
    const e = rowToActivityEvent({
      id: "a1",
      actor: "u7",
      actor_name: "Max",
      actor_avatar: null,
      kind: "bounty_claimed",
      game_title: "Hollow Knight",
      detail: { coins: 120 },
      created_at: "2026-03-03T00:00:00Z",
      cheer_count: "3",
      cheered_by_me: true,
    });
    expect(e.kind).toBe("bounty_claimed");
    expect(e.cheerCount).toBe(3);
    expect(e.cheeredByMe).toBe(true);
    expect(e.detail.coins).toBe(120);
  });

  it("defaults a missing detail/cheer count and an unknown kind", () => {
    const e = rowToActivityEvent({
      id: "a2",
      actor: "u8",
      actor_name: "Ada",
      actor_avatar: null,
      kind: "mystery",
      game_title: null,
      detail: null,
      created_at: "2026-03-03T00:00:00Z",
      cheer_count: null,
      cheered_by_me: null,
    });
    expect(e.kind).toBe("game_imported");
    expect(e.detail).toEqual({});
    expect(e.cheerCount).toBe(0);
    expect(e.cheeredByMe).toBe(false);
  });
});

describe("rowToMessage", () => {
  it("maps a message row, parsing timestamps and the outgoing flag", () => {
    const m = rowToMessage({
      id: "m1",
      sender: "u1",
      recipient: "u2",
      outgoing: true,
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      body: "gg",
      game_id: null,
      game_title: null,
      read_at: null,
      created_at: "2026-04-04T00:00:00Z",
    });
    expect(m.outgoing).toBe(true);
    expect(m.otherName).toBe("Pat");
    expect(m.readAt).toBeNull();
    expect(m.createdAt).toBe(Date.parse("2026-04-04T00:00:00Z"));
  });

  it("parses read_at when present", () => {
    const m = rowToMessage({
      id: "m2",
      sender: "u2",
      recipient: "u1",
      outgoing: false,
      other_id: "u2",
      other_name: "Pat",
      other_avatar: "a.png",
      body: "hi",
      game_id: "g1",
      game_title: "Hades",
      read_at: "2026-04-05T00:00:00Z",
      created_at: "2026-04-04T00:00:00Z",
    });
    expect(m.readAt).toBe(Date.parse("2026-04-05T00:00:00Z"));
    expect(m.gameTitle).toBe("Hades");
  });
});

describe("rowToConversation", () => {
  it("maps a conversation row, coercing the bigint unread count and flags", () => {
    const c = rowToConversation({
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      last_body: "see you then",
      last_outgoing: true,
      last_created_at: "2026-04-06T00:00:00Z",
      unread_count: "3",
      archived: false,
    });
    expect(c.otherId).toBe("u2");
    expect(c.lastOutgoing).toBe(true);
    expect(c.unreadCount).toBe(3);
    expect(c.archived).toBe(false);
    expect(c.lastCreatedAt).toBe(Date.parse("2026-04-06T00:00:00Z"));
  });

  it("defaults a null unread count and archived flag", () => {
    const c = rowToConversation({
      other_id: "u3",
      other_name: "Lee",
      other_avatar: "a.png",
      last_body: "hi",
      last_outgoing: false,
      last_created_at: "2026-04-06T00:00:00Z",
      unread_count: null,
      archived: null,
    });
    expect(c.unreadCount).toBe(0);
    expect(c.archived).toBe(false);
  });
});

describe("message edit/delete mapping", () => {
  it("maps edited_at and the deleted tombstone flag", () => {
    const edited = rowToMessage({
      id: "m9",
      sender: "me",
      recipient: "u2",
      outgoing: true,
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      body: "fixed typo",
      game_id: null,
      game_title: null,
      read_at: null,
      created_at: "2026-04-04T00:00:00Z",
      edited_at: "2026-04-04T00:05:00Z",
      deleted: false,
    });
    expect(edited.editedAt).toBe(Date.parse("2026-04-04T00:05:00Z"));
    expect(edited.deleted).toBe(false);

    const tombstoned = rowToMessage({
      id: "m10",
      sender: "me",
      recipient: "u2",
      outgoing: true,
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      body: "",
      game_id: null,
      game_title: null,
      read_at: null,
      created_at: "2026-04-04T00:00:00Z",
      edited_at: null,
      deleted: true,
    });
    expect(tombstoned.deleted).toBe(true);
    expect(tombstoned.editedAt).toBeNull();
  });

  it("defaults editedAt/deleted when the columns are absent", () => {
    const m = rowToMessage({
      id: "m11",
      sender: "u2",
      recipient: "me",
      outgoing: false,
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      body: "hi",
      game_id: null,
      game_title: null,
      read_at: null,
      created_at: "2026-04-04T00:00:00Z",
    });
    expect(m.editedAt).toBeNull();
    expect(m.deleted).toBe(false);
  });

  it("defaults reactions/quoted when absent and maps them when present", () => {
    const bare = rowToMessage({
      id: "m12",
      sender: "u2",
      recipient: "me",
      outgoing: false,
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      body: "hi",
      game_id: null,
      game_title: null,
      read_at: null,
      created_at: "2026-04-04T00:00:00Z",
    });
    expect(bare.reactions).toEqual({});
    expect(bare.myReactions).toEqual([]);
    expect(bare.quoted).toBeNull();
    expect(bare.images).toEqual([]);

    const rich = rowToMessage({
      id: "m13",
      sender: "me",
      recipient: "u2",
      outgoing: true,
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      body: "agreed",
      game_id: null,
      game_title: null,
      read_at: null,
      created_at: "2026-04-04T00:00:00Z",
      reactions: { "👍": 2, "🎉": 1 },
      my_reactions: ["👍"],
      reply_to: "m1",
      reply_body: "what do you think?",
      reply_outgoing: false,
      reply_deleted: false,
      reply_game_title: "Hades",
      reply_game_image: "hades.png",
      images: [{ path: "u/dm/1.jpg", url: "https://cdn/1.jpg" }],
    });
    expect(rich.images).toEqual([{ path: "u/dm/1.jpg", url: "https://cdn/1.jpg" }]);
    expect(rich.reactions).toEqual({ "👍": 2, "🎉": 1 });
    expect(rich.myReactions).toEqual(["👍"]);
    expect(rich.quoted).toEqual({
      id: "m1",
      body: "what do you think?",
      outgoing: false,
      deleted: false,
      gameTitle: "Hades",
      gameImage: "hades.png",
    });
  });

  it("maps the conversation last_deleted flag", () => {
    const c = rowToConversation({
      other_id: "u2",
      other_name: "Pat",
      other_avatar: null,
      last_body: "",
      last_outgoing: true,
      last_created_at: "2026-04-06T00:00:00Z",
      last_deleted: true,
      unread_count: 0,
      archived: false,
    });
    expect(c.lastDeleted).toBe(true);
  });
});
