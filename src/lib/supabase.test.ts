import { describe, it, expect } from "vitest";
import {
  rowToGame,
  rowToComment,
  rowToFeatureRequest,
  type GameRow,
  type CommentRow,
  type FeatureRequestRow,
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
  platforms: ["PC", "PS5"],
  developers: ["Studio X"],
  esrb: "Mature",
  status: "finished",
  price_paid: 50,
  reward: 100,
  played_hours: 12.5,
  copies: [{ id: "c1", platform: "PS5", cost: 70 }],
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
  });

  it("turns nulls into undefined and non-array genres into []", () => {
    const g = rowToGame({
      ...baseRow,
      rawg_id: null,
      image: null,
      genres: null,
      played_hours: null,
      copies: null,
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
    vote_count: 3,
    voted_by_me: true,
    comment_count: 5,
  };

  it("maps the comment count to a number", () => {
    expect(rowToFeatureRequest(baseReq).commentCount).toBe(5);
  });

  it("defaults a missing comment count to 0", () => {
    const r = rowToFeatureRequest({ ...baseReq, comment_count: undefined as unknown as number });
    expect(r.commentCount).toBe(0);
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
    reactions: { "👍": 2, "🎉": 1 },
    my_reactions: ["👍"],
  };

  it("maps a top-level comment", () => {
    const c = rowToComment(row);
    expect(c.parentId).toBeNull();
    expect(c.authorName).toBe("Bob");
    expect(c.body).toBe("Nice idea");
    expect(c.createdAt).toBe(Date.parse("2021-06-01T00:00:00Z"));
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
