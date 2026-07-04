import { describe, it, expect } from "vitest";
import {
  AGENT_SETTABLE,
  checkTransition,
  isIssueStatus,
} from "./issueWorkflow";

describe("isIssueStatus", () => {
  it("accepts real statuses and rejects junk", () => {
    expect(isIssueStatus("in_progress")).toBe(true);
    expect(isIssueStatus("done")).toBe(true);
    expect(isIssueStatus("nonsense")).toBe(false);
    expect(isIssueStatus("")).toBe(false);
  });
});

describe("checkTransition", () => {
  it("walks the happy path submitted → planned → in_progress → awaiting_feedback", () => {
    expect(checkTransition("submitted", "planned")).toMatchObject({ ok: true, noop: false });
    expect(checkTransition("planned", "in_progress")).toMatchObject({ ok: true, noop: false });
    expect(checkTransition("in_progress", "awaiting_feedback")).toMatchObject({
      ok: true,
      noop: false,
    });
  });

  it("allows re-work back in from changes_requested", () => {
    expect(checkTransition("changes_requested", "planned").ok).toBe(true);
    expect(checkTransition("changes_requested", "in_progress").ok).toBe(true);
  });

  it("treats from === to as an allowed no-op", () => {
    expect(checkTransition("in_progress", "in_progress")).toMatchObject({
      ok: true,
      noop: true,
    });
  });

  it("refuses to set done, declined, or submitted", () => {
    for (const to of ["done", "declined", "submitted"] as const) {
      const res = checkTransition("in_progress", to);
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/not a status this tool may set/);
    }
    // Guard against the settable list silently growing to include a terminal state.
    expect(AGENT_SETTABLE).not.toContain("done");
    expect(AGENT_SETTABLE).not.toContain("declined");
  });

  it("refuses illegal jumps like submitted → awaiting_feedback", () => {
    const res = checkTransition("submitted", "awaiting_feedback");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/only reachable from/);
  });

  it("refuses to march an already-signed-off item forward", () => {
    // awaiting_feedback is terminal for this tool; there's no legal target from it.
    expect(checkTransition("awaiting_feedback", "in_progress").ok).toBe(false);
    expect(checkTransition("awaiting_feedback", "planned").ok).toBe(false);
  });
});
