import { describe, it, expect } from "vitest";
import { filterSortRequests, hasActiveFilters, type RequestQuery } from "./requestFilter";
import type { Issue } from "../types";

function req(over: Partial<Issue>): Issue {
  return {
    id: "x",
    kind: "feature",
    title: "Title",
    description: null,
    status: "submitted",
    userId: "u1",
    requesterName: "Alice",
    isAdminItem: false,
    createdAt: 1000,
    editedAt: null,
    voteCount: 0,
    votedByMe: false,
    commentCount: 0,
    attachmentCount: 0,
    tags: [],
    priority: "medium",
    effort: "medium",
    ...over,
  };
}

const base: RequestQuery = {
  search: "",
  type: "all",
  status: "all",
  mineOnly: false,
  sort: "votes",
  userId: "u1",
};

describe("filterSortRequests — filtering", () => {
  const items = [
    req({ id: "a", kind: "feature", status: "submitted", title: "Dark mode" }),
    req({ id: "b", kind: "bug", status: "done", title: "Crash on save" }),
    req({ id: "c", kind: "feature", status: "declined", title: "Banner ads" }),
    req({ id: "d", kind: "bug", status: "in_progress", title: "Slow search", userId: "u2" }),
  ];

  it("filters by type", () => {
    const ids = filterSortRequests(items, { ...base, type: "bug" }).map((r) => r.id);
    expect(ids.sort()).toEqual(["b", "d"]);
  });

  it("open status hides done and declined", () => {
    const ids = filterSortRequests(items, { ...base, status: "open" }).map((r) => r.id).sort();
    expect(ids).toEqual(["a", "d"]);
  });

  it("changes_requested counts as open (it still needs work)", () => {
    const withCr = [...items, req({ id: "cr", status: "changes_requested", title: "Reopened" })];
    const open = filterSortRequests(withCr, { ...base, status: "open" }).map((r) => r.id);
    expect(open).toContain("cr");
    expect(filterSortRequests(withCr, { ...base, status: "changes_requested" }).map((r) => r.id)).toEqual([
      "cr",
    ]);
  });

  it("open hides on-hold items, but the On Hold filter surfaces them", () => {
    const withHold = [...items, req({ id: "h", status: "on_hold", title: "Someday" })];
    // Parked items drop out of the default Open view…
    expect(filterSortRequests(withHold, { ...base, status: "open" }).map((r) => r.id)).not.toContain(
      "h",
    );
    // …but are reachable by filtering to On Hold.
    expect(filterSortRequests(withHold, { ...base, status: "on_hold" }).map((r) => r.id)).toEqual([
      "h",
    ]);
  });

  it("a specific status matches exactly", () => {
    expect(filterSortRequests(items, { ...base, status: "done" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("mineOnly keeps only the caller's requests", () => {
    const ids = filterSortRequests(items, { ...base, mineOnly: true, userId: "u2" }).map(
      (r) => r.id,
    );
    expect(ids).toEqual(["d"]);
  });

  it("search is case-insensitive across title and requester", () => {
    expect(filterSortRequests(items, { ...base, search: "CRASH" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("search matches the description too", () => {
    const withDesc = [req({ id: "e", title: "Misc", description: "please add gamepad support" })];
    expect(filterSortRequests(withDesc, { ...base, search: "gamepad" }).map((r) => r.id)).toEqual([
      "e",
    ]);
  });
});

describe("filterSortRequests — sorting", () => {
  const items = [
    req({ id: "lo", voteCount: 1, commentCount: 9, createdAt: 100 }),
    req({ id: "hi", voteCount: 5, commentCount: 0, createdAt: 200 }),
    req({ id: "mid", voteCount: 3, commentCount: 2, createdAt: 300 }),
  ];

  it("votes: most votes first", () => {
    expect(filterSortRequests(items, { ...base, sort: "votes" }).map((r) => r.id)).toEqual([
      "hi",
      "mid",
      "lo",
    ]);
  });

  it("newest: most recent first", () => {
    expect(filterSortRequests(items, { ...base, sort: "newest" }).map((r) => r.id)).toEqual([
      "mid",
      "hi",
      "lo",
    ]);
  });

  it("comments: most comments first", () => {
    expect(filterSortRequests(items, { ...base, sort: "comments" }).map((r) => r.id)).toEqual([
      "lo",
      "mid",
      "hi",
    ]);
  });

  it("priority: highest priority first, newest breaking ties", () => {
    const byPriority = [
      req({ id: "p-lo", priority: "low", createdAt: 100 }),
      req({ id: "p-hi", priority: "high", createdAt: 200 }),
      req({ id: "p-mid-old", priority: "medium", createdAt: 50 }),
      req({ id: "p-mid-new", priority: "medium", createdAt: 300 }),
    ];
    expect(filterSortRequests(byPriority, { ...base, sort: "priority" }).map((r) => r.id)).toEqual([
      "p-hi",
      "p-mid-new",
      "p-mid-old",
      "p-lo",
    ]);
  });

  it("effort: lowest effort first (quick wins), newest breaking ties", () => {
    const byEffort = [
      req({ id: "e-hi", effort: "high", createdAt: 100 }),
      req({ id: "e-lo", effort: "low", createdAt: 200 }),
      req({ id: "e-mid-old", effort: "medium", createdAt: 50 }),
      req({ id: "e-mid-new", effort: "medium", createdAt: 300 }),
    ];
    expect(filterSortRequests(byEffort, { ...base, sort: "effort" }).map((r) => r.id)).toEqual([
      "e-lo",
      "e-mid-new",
      "e-mid-old",
      "e-hi",
    ]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the default query", () => {
    expect(hasActiveFilters({ ...base, status: "open" })).toBe(false);
  });

  it("is true when search or any filter is set", () => {
    expect(hasActiveFilters({ ...base, status: "open", search: "x" })).toBe(true);
    expect(hasActiveFilters({ ...base, status: "done" })).toBe(true);
    expect(hasActiveFilters({ ...base, status: "open", type: "bug" })).toBe(true);
    expect(hasActiveFilters({ ...base, status: "open", mineOnly: true })).toBe(true);
  });
});
