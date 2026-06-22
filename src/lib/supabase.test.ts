import { describe, it, expect } from "vitest";
import {
  rowToGame,
  rowToComment,
  rowToFeatureRequest,
  rowToFeatureAttachment,
  rowToViewProfile,
  rowToAdminUser,
  rowToGameSubmission,
  rowToMySubmission,
  jsonToCatalogFields,
  type GameRow,
  type MySubmissionRow,
  type CommentRow,
  type FeatureRequestRow,
  type FeatureAttachmentRow,
  type ViewProfileRow,
  type AdminUserRow,
  type GameSubmissionRow,
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
  platforms: ["PC", "PS5"],
  developers: ["Studio X"],
  esrb: "Mature",
  status: "finished",
  price_paid: 50,
  reward: 100,
  played_hours: 12.5,
  copies: [{ id: "c1", platform: "PS5", cost: 70 }],
  progress_note: "Chapter 3",
  slot_id: null,
  family_id: null,
  family_name: null,
  catalog_id: null,
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
    });
    expect(g.rawgId).toBeUndefined();
    expect(g.image).toBeUndefined();
    expect(g.genres).toEqual([]);
    expect(g.playedHours).toBe(0);
    expect(g.copies).toEqual([]);
  });
});

describe("rowToFeatureRequest", () => {
  const baseReq: FeatureRequestRow = {
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
  };

  it("maps the comment count to a number", () => {
    expect(rowToFeatureRequest(baseReq).commentCount).toBe(5);
  });

  it("maps tags and priority, defaulting nulls", () => {
    const r = rowToFeatureRequest(baseReq);
    expect(r.tags).toEqual(["mobile", "enhancement"]);
    expect(r.priority).toBe("high");
    const missing = rowToFeatureRequest({
      ...baseReq,
      tags: null,
      priority: null,
    });
    expect(missing.tags).toEqual([]);
    expect(missing.priority).toBe("medium");
  });

  it("defaults a missing comment count to 0", () => {
    const r = rowToFeatureRequest({ ...baseReq, comment_count: undefined as unknown as number });
    expect(r.commentCount).toBe(0);
  });

  it("maps the attachment count, defaulting a missing value to 0", () => {
    expect(rowToFeatureRequest(baseReq).attachmentCount).toBe(2);
    const r = rowToFeatureRequest({
      ...baseReq,
      attachment_count: undefined as unknown as number,
    });
    expect(r.attachmentCount).toBe(0);
  });
});

describe("rowToFeatureAttachment", () => {
  const row: FeatureAttachmentRow = {
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
    const a = rowToFeatureAttachment(row);
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

describe("rowToAdminUser", () => {
  const row: AdminUserRow = {
    id: "u1",
    email: "a@b.com",
    display_name: "Alice",
    avatar_url: null,
    coins: 100,
    general_slots: 2,
    is_admin: false,
    blocked: false,
    blocked_reason: null,
    hidden: true,
    created_at: "2024-01-01T00:00:00Z",
    games_count: 5,
    last_seen_at: null,
    activity: null,
    badges: null,
  };

  it("maps the hidden flag and coerces it to a boolean", () => {
    expect(rowToAdminUser(row).hidden).toBe(true);
    expect(rowToAdminUser({ ...row, hidden: false }).hidden).toBe(false);
    // Defensive: a nullish value from the RPC becomes false, not undefined.
    expect(rowToAdminUser({ ...row, hidden: null as unknown as boolean }).hidden).toBe(false);
  });
});

describe("jsonToCatalogFields", () => {
  it("parses a catalog row jsonb and coerces hours", () => {
    const f = jsonToCatalogFields({
      title: "T",
      image: "u",
      platforms: ["PC"],
      genres: ["RPG"],
      released: "2020-01-01",
      hours: "12",
    });
    expect(f).toEqual({
      title: "T",
      image: "u",
      platforms: ["PC"],
      genres: ["RPG"],
      released: "2020-01-01",
      hours: 12,
    });
  });
  it("returns null for a missing payload and defaults missing fields", () => {
    expect(jsonToCatalogFields(null)).toBeNull();
    expect(jsonToCatalogFields({})).toEqual({
      title: "",
      image: "",
      platforms: [],
      genres: [],
      released: "",
      hours: null,
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
    released: "2019-05-05",
    hours: 30,
    before: { title: "Old Title", image: "", platforms: ["PC"], genres: [], released: "", hours: null },
    current: { title: "Old Title", image: "", platforms: ["PC"], genres: ["RPG"], released: "2019-05-05", hours: 25 },
    created_at: "2026-06-22T00:00:00Z",
  };

  it("maps the proposed values, the before snapshot, and the live current", () => {
    const s = rowToGameSubmission(row);
    expect(s.kind).toBe("edit");
    expect(s.submitterName).toBe("Alice");
    expect(s.proposed.title).toBe("New Title");
    expect(s.proposed.platforms).toEqual(["PC", "PS5"]);
    expect(s.proposed.hours).toBe(30);
    expect(s.before?.title).toBe("Old Title");
    expect(s.current?.hours).toBe(25);
    expect(s.createdAt).toBe(Date.parse("2026-06-22T00:00:00Z"));
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
    released: "2020-01-01",
    hours: 12,
    before: { title: "My Game", image: "", platforms: ["PC"], genres: ["RPG"], released: "2020-01-01", hours: 12 },
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
    });
    expect(p.avatarUrl).toBeNull();
    expect(p.theme).toBeNull();
    expect(p.hideSpend).toBe(false);
    expect(p.lastSeenAt).toBeNull();
    expect(p.activity).toBeNull();
    // Defensive: a null badges payload becomes an empty array; no title.
    expect(p.badges).toEqual([]);
    expect(p.title).toBeNull();
  });
});
