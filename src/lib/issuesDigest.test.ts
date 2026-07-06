import { describe, it, expect } from "vitest";
import {
  formatIssuesDigest,
  isWorkable,
  rankIssues,
  type IssueRecord,
} from "./issuesDigest";

function issue(overrides: Partial<IssueRecord>): IssueRecord {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    kind: "feature",
    title: "Untitled",
    description: null,
    status: "submitted",
    priority: "medium",
    effort: "medium",
    tags: [],
    is_admin_item: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    edited_at: null,
    voteCount: 0,
    commentCount: 0,
    ...overrides,
  };
}

describe("isWorkable", () => {
  it("is the pull queue: submitted, planned, in_progress only", () => {
    expect(isWorkable("submitted")).toBe(true);
    expect(isWorkable("planned")).toBe(true);
    expect(isWorkable("in_progress")).toBe(true);
    // Parked on the requester — excluded from the work queue.
    expect(isWorkable("awaiting_feedback")).toBe(false);
    expect(isWorkable("changes_requested")).toBe(false);
    // Closed.
    expect(isWorkable("done")).toBe(false);
    expect(isWorkable("declined")).toBe(false);
    // Parked for later — deliberately deferred, never pulled.
    expect(isWorkable("on_hold")).toBe(false);
  });
});

describe("rankIssues", () => {
  it("orders by priority, then votes, then age (oldest first)", () => {
    const low = issue({ id: "a", priority: "low", title: "low" });
    const highFewVotes = issue({
      id: "b",
      priority: "high",
      voteCount: 1,
      title: "high-1",
    });
    const highManyVotes = issue({
      id: "c",
      priority: "high",
      voteCount: 9,
      title: "high-9",
    });
    const ranked = rankIssues([low, highFewVotes, highManyVotes]);
    expect(ranked.map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("breaks vote ties by created_at ascending", () => {
    const older = issue({ id: "old", created_at: "2026-01-01T00:00:00.000Z" });
    const newer = issue({ id: "new", created_at: "2026-02-01T00:00:00.000Z" });
    const ranked = rankIssues([newer, older]);
    expect(ranked.map((i) => i.id)).toEqual(["old", "new"]);
  });

  it("does not mutate its input", () => {
    const input = [issue({ id: "a", priority: "low" }), issue({ id: "b", priority: "high" })];
    const before = input.map((i) => i.id);
    rankIssues(input);
    expect(input.map((i) => i.id)).toEqual(before);
  });
});

describe("formatIssuesDigest", () => {
  const now = new Date("2026-07-04T12:00:00.000Z");

  it("summarizes counts across the three buckets and warns content is user-authored", () => {
    const md = formatIssuesDigest(
      [
        issue({ status: "submitted" }),
        issue({ status: "awaiting_feedback" }),
        issue({ status: "done" }),
      ],
      { now },
    );
    expect(md).toContain("1 to work · 1 awaiting feedback · 1 closed");
    expect(md).toContain("2026-07-04T12:00:00.000Z");
    expect(md).toMatch(/user-authored/i);
  });

  it("excludes awaiting_feedback and changes_requested from the work queue", () => {
    const md = formatIssuesDigest(
      [
        issue({ status: "awaiting_feedback", title: "Signed off soon" }),
        issue({ status: "changes_requested", title: "Sent back" }),
      ],
      { now },
    );
    // Neither appears as a rendered queue item...
    expect(md).toContain("_No issues in the work queue._");
    expect(md).not.toContain("#### [feature] Signed off soon");
    // ...but both are counted in the awaiting-requester summary.
    expect(md).toContain("## Awaiting requester (2)");
    expect(md).toContain("1 awaiting feedback · 1 changes requested");
  });

  it("groups queue issues under their status heading and shows kind + title", () => {
    const md = formatIssuesDigest(
      [
        issue({ id: "bug1", kind: "bug", status: "in_progress", title: "Crash on save" }),
        issue({ id: "feat1", kind: "feature", status: "planned", title: "Dark mode" }),
      ],
      { now },
    );
    expect(md).toContain("## In progress (1)");
    expect(md).toContain("[bug] Crash on save");
    expect(md).toContain("## Planned (1)");
    expect(md).toContain("[feature] Dark mode");
  });

  it("renders priority, votes, and the full id for actionability", () => {
    const md = formatIssuesDigest(
      [issue({ id: "abcd1234-0000-0000-0000-000000000000", priority: "high", voteCount: 7 })],
      { now },
    );
    expect(md).toContain("priority: high");
    expect(md).toContain("▲7");
    expect(md).toContain("id: `abcd1234-0000-0000-0000-000000000000`");
    expect(md).toContain("`abcd1234`");
  });

  it("summarizes closed items as a count by default, lists them when asked", () => {
    const closed = [
      issue({ id: "d", status: "done", title: "Shipped thing" }),
      issue({ id: "x", status: "declined", title: "Rejected thing" }),
    ];
    const summary = formatIssuesDigest(closed, { now });
    expect(summary).toContain("## Closed (2)");
    expect(summary).toContain("1 done · 1 declined");
    expect(summary).not.toContain("Shipped thing");

    const full = formatIssuesDigest(closed, { now, includeClosed: true });
    expect(full).toContain("Shipped thing");
    expect(full).toContain("Rejected thing");
  });

  it("handles an empty board", () => {
    const md = formatIssuesDigest([], { now });
    expect(md).toContain("0 to work · 0 awaiting feedback · 0 closed");
    expect(md).toContain("_No issues in the work queue._");
  });

  it("parks on-hold items in their own section, out of the work queue", () => {
    const md = formatIssuesDigest(
      [
        issue({ status: "on_hold", title: "Maybe someday" }),
        issue({ status: "submitted", title: "Do this now" }),
      ],
      { now },
    );
    // On-hold is not queue work…
    expect(md).toContain("1 to work · 0 awaiting feedback · 0 closed");
    expect(md).not.toContain("#### [feature] Maybe someday");
    // …it gets its own summarized section.
    expect(md).toContain("## On hold (1) — parked for later, not queued");
    // Listed by title only when the full render is asked for.
    const full = formatIssuesDigest([issue({ status: "on_hold", title: "Maybe someday" })], {
      now,
      includeClosed: true,
    });
    expect(full).toContain("Maybe someday");
  });
});
