import { describe, expect, it } from "vitest";
import {
  collectionPayload,
  collectionReview,
  type CollectionDraft,
} from "./collectionDrafts";
export const draft: CollectionDraft = {
  draft_id: "draft",
  revision: 2,
  source_key: "b",
  state: "draft",
  created_at: "2026-09-08T12:00:00Z",
  base_catalog: {
    sets: [
      { key: "a", name: "Alpha", badge_id: null },
      { key: "b", name: "Beta", badge_id: null },
    ],
    badges: [],
    items: [
      {
        id: "one",
        slug: "one",
        name: "Active One",
        kind: "frame",
        style: "bronze-ring",
        active: true,
        set_key: "a",
        price: 100,
      },
      {
        id: "two",
        slug: "two",
        name: "Retired Two",
        kind: "frame",
        style: "bronze-ring",
        active: false,
        set_key: "b",
        price: 100,
      },
    ],
  },
  payload: {
    set: { key: "b", name: "Beta Revised", description: null, badge_id: null },
    member_ids: ["one"],
  },
};
describe("collection review", () => {
  it("shows moves and removals with active counts for both collections", () => {
    const result = collectionReview(draft);
    expect(
      result.memberships.map(({ id, from, to }) => ({ id, from, to })),
    ).toEqual([
      { id: "one", from: "a", to: "b" },
      { id: "two", from: "b", to: null },
    ]);
    expect(result.impacts).toEqual(
      expect.arrayContaining([
        { key: "a", name: "Alpha", before: 1, after: 0 },
        { key: "b", name: "Beta Revised", before: 0, after: 1 },
      ]),
    );
    expect(result.changes).toContainEqual({
      label: "Name",
      before: "Beta",
      after: "Beta Revised",
    });
  });
  it("serializes a unique member list and editable metadata only", () => {
    expect(
      collectionPayload(
        { key: "new", name: "New", description: null, badgeId: null },
        ["two", "one", "two"],
      ),
    ).toEqual({
      set: { key: "new", name: "New", description: null, badge_id: null },
      member_ids: ["one", "two"],
    });
  });
});
