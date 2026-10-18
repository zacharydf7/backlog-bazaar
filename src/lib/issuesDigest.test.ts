import { describe, it, expect } from "vitest";
import {
  formatIssuesDigest,
  isWorkable,
  awaitsReply,
  latestCommenters,
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
  it("is the pull queue: submitted, planned, in_progress, changes_requested", () => {
    expect(isWorkable({ kind: "feature", status: "submitted" })).toBe(true);
    expect(isWorkable({ kind: "feature", status: "planned" })).toBe(true);
    expect(isWorkable({ kind: "feature", status: "in_progress" })).toBe(true);
    // Sent back by the requester — the ball is back with us, so it IS queued.
    expect(isWorkable({ kind: "feature", status: "changes_requested" })).toBe(true);
    // Dev-complete, parked on the requester for sign-off — excluded.
    expect(isWorkable({ kind: "feature", status: "awaiting_feedback" })).toBe(false);
    // Closed.
    expect(isWorkable({ kind: "feature", status: "done" })).toBe(false);
    expect(isWorkable({ kind: "feature", status: "declined" })).toBe(false);
    // Parked for later — deliberately deferred, never pulled.
    expect(isWorkable({ kind: "feature", status: "on_hold" })).toBe(false);
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
    expect(md).toContain("1 to work · 0 questions (0 awaiting a reply) · 1 awaiting feedback · 1 closed");
    expect(md).toContain("2026-07-04T12:00:00.000Z");
    expect(md).toMatch(/user-authored/i);
  });

  it("queues changes_requested but parks awaiting_feedback on the requester", () => {
    const md = formatIssuesDigest(
      [
        issue({ status: "awaiting_feedback", title: "Signed off soon" }),
        issue({ status: "changes_requested", title: "Sent back" }),
      ],
      { now },
    );
    // Sent-back work IS a rendered queue item under its own heading...
    expect(md).toContain("## Changes requested (1)");
    expect(md).toContain("#### [feature] Sent back");
    expect(md).not.toContain("_No issues in the work queue._");
    // ...while the dev-complete item waits, out of the queue.
    expect(md).toContain("## Awaiting feedback (1) — excluded from queue");
    expect(md).not.toContain("#### [feature] Signed off soon");
  });

  it("never counts a question as queue work, and one set to Awaiting feedback once", () => {
    expect(isWorkable({ kind: "question", status: "submitted" })).toBe(false);
    const md = formatIssuesDigest([issue({ kind: "question", status: "awaiting_feedback", title: "Odd" })], { now });
    expect(md).toContain("0 questions (0 awaiting a reply) · 1 awaiting feedback");
  });

  it("lists questions on their own, outside the queue, those awaiting a reply first", () => {
    const md = formatIssuesDigest(
      [
        issue({ id: "q-answered", kind: "question", title: "Lanes for one-off sessions?", awaitingReply: false }),
        issue({ id: "q-waiting", kind: "question", title: "Ideas for boss events?", awaitingReply: true }),
        issue({ id: "q-closed", kind: "question", status: "done", title: "Settled" }),
      ],
      { now },
    );
    expect(md).toContain("_No issues in the work queue._");
    expect(md).toContain("2 questions (1 awaiting a reply)");
    expect(md).toContain("## Questions (2) — discussion, not queue work");
    expect(md.indexOf("[question] Ideas for boss events?")).toBeLessThan(
      md.indexOf("[question] Lanes for one-off sessions?"),
    );
    expect(md).toContain("**Awaiting your reply**\n#### [question] Ideas for boss events?");
    expect(md).not.toContain("#### [question] Settled");
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
    expect(md).toContain("0 to work · 0 questions (0 awaiting a reply) · 0 awaiting feedback · 0 closed");
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
    expect(md).toContain("1 to work · 0 questions (0 awaiting a reply) · 0 awaiting feedback · 0 closed");
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

describe("awaitsReply", () => {
  const ME = "admin";
  it("waits on us for a player's question nobody has answered", () => {
    expect(awaitsReply("player", undefined, ME)).toBe(true);
  });
  it("waits on the players for a question we posted", () => {
    expect(awaitsReply(ME, undefined, ME)).toBe(false);
  });
  it("follows whoever commented last", () => {
    expect(awaitsReply("player", "player", ME)).toBe(true);
    expect(awaitsReply("player", ME, ME)).toBe(false);
  });
});

describe("latestCommenters", () => {
  it("picks each issue's newest comment author", () => {
    const latest = latestCommenters([
      { request_id: "q", user_id: "player", created_at: "2026-10-18T10:00:00Z" },
      { request_id: "q", user_id: "admin", created_at: "2026-10-18T12:00:00Z" },
      { request_id: "q", user_id: "player", created_at: "2026-10-18T11:00:00Z" },
      { request_id: "r", user_id: "player", created_at: "2026-10-18T09:00:00Z" },
    ]);
    expect(latest.get("q")).toBe("admin");
    expect(latest.get("r")).toBe("player");
  });
});
