// The status lifecycle Claude drives while working an issue off the board.
// Pure + offline-testable; the write script (scripts/set-issue-status.ts) is a
// thin shell that fetches the current status, calls checkTransition, and updates.
//
// Lifecycle (see the issue-workflow memory):
//   submitted → planned → in_progress → awaiting_feedback
// with a re-work loop back in from `changes_requested`. `done`/`declined` are NOT
// set here — done/changes_requested are the requester's call via
// respond_feature_request, and declined is a human moderation decision.

import type { IssueStatus } from "./issuesDigest";

export const ALL_STATUSES: IssueStatus[] = [
  "submitted",
  "planned",
  "in_progress",
  "changes_requested",
  "awaiting_feedback",
  "on_hold",
  "done",
  "declined",
];

// Statuses this tool is permitted to set. Deliberately excludes done/declined/
// submitted/on_hold so an automated move can't close, reject, reopen, or shelve
// an issue — parking something for "maybe one day" is a human triage call.
export const AGENT_SETTABLE: IssueStatus[] = [
  "planned",
  "in_progress",
  "awaiting_feedback",
];

// Legal source statuses for each settable target, enforcing forward progress
// through the lifecycle (plus the changes_requested re-work loop).
const ALLOWED_FROM: Record<string, IssueStatus[]> = {
  planned: ["submitted", "changes_requested"],
  in_progress: ["planned", "submitted", "changes_requested"],
  awaiting_feedback: ["in_progress"],
};

export function isIssueStatus(value: string): value is IssueStatus {
  return (ALL_STATUSES as string[]).includes(value);
}

export interface TransitionCheck {
  /** True if the move is allowed (includes an idempotent no-op where from === to). */
  ok: boolean;
  /** True when from === to — caller should skip the write (no event, no notify). */
  noop: boolean;
  /** Human-readable reason when ok is false. */
  reason?: string;
}

/**
 * Decide whether Claude may move an issue from `from` to `to`. Pure — no I/O.
 */
export function checkTransition(
  from: IssueStatus,
  to: IssueStatus,
): TransitionCheck {
  if (!AGENT_SETTABLE.includes(to)) {
    return {
      ok: false,
      noop: false,
      reason:
        `"${to}" is not a status this tool may set ` +
        `(allowed: ${AGENT_SETTABLE.join(", ")}).`,
    };
  }
  if (from === to) {
    return { ok: true, noop: true };
  }
  const sources = ALLOWED_FROM[to] ?? [];
  if (!sources.includes(from)) {
    return {
      ok: false,
      noop: false,
      reason:
        `Can't move "${from}" → "${to}". ` +
        `"${to}" is only reachable from: ${sources.join(", ")}.`,
    };
  }
  return { ok: true, noop: false };
}
