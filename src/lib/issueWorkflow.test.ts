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
    expect(isIssueStatus("on_hold")).toBe(true);
    expect(isIssueStatus("nonsense")).toBe(false);
    expect(isIssueStatus("")).toBe(false);
  });
});

describe("checkTransition", () => {
  it("walks the happy path submitted → planned → in_progress → awaiting_feedback", () => {
    expect(checkTransition("submitted", "planned", "feature")).toMatchObject({ ok: true, noop: false });
    expect(checkTransition("planned", "in_progress", "feature")).toMatchObject({ ok: true, noop: false });
    expect(checkTransition("in_progress", "awaiting_feedback", "feature")).toMatchObject({
      ok: true,
      noop: false,
    });
  });

  it("allows re-work back in from changes_requested", () => {
    expect(checkTransition("changes_requested", "planned", "feature").ok).toBe(true);
    expect(checkTransition("changes_requested", "in_progress", "feature").ok).toBe(true);
  });

  it("keeps a question out of the build pipeline until it becomes a feature", () => {
    const check = checkTransition("submitted", "planned", "question");
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/change it to a feature/);
    expect(checkTransition("submitted", "planned", "feature").ok).toBe(true);
  });

  it("treats from === to as an allowed no-op", () => {
    expect(checkTransition("in_progress", "in_progress", "feature")).toMatchObject({
      ok: true,
      noop: true,
    });
  });

  it("refuses to set done, declined, or submitted", () => {
    for (const to of ["done", "declined", "submitted"] as const) {
      const res = checkTransition("in_progress", to, "feature");
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/not a status this tool may set/);
    }
    // Guard against the settable list silently growing to include a terminal state.
    expect(AGENT_SETTABLE).not.toContain("done");
    expect(AGENT_SETTABLE).not.toContain("declined");
  });

  it("refuses to put an item on hold — that's a human triage call", () => {
    const res = checkTransition("in_progress", "on_hold", "feature");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not a status this tool may set/);
    expect(AGENT_SETTABLE).not.toContain("on_hold");
  });

  it("refuses illegal jumps like submitted → awaiting_feedback", () => {
    const res = checkTransition("submitted", "awaiting_feedback", "feature");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/only reachable from/);
  });

  it("refuses to march an already-signed-off item forward", () => {
    // awaiting_feedback is terminal for this tool; there's no legal target from it.
    expect(checkTransition("awaiting_feedback", "in_progress", "feature").ok).toBe(false);
    expect(checkTransition("awaiting_feedback", "planned", "feature").ok).toBe(false);
  });
});
