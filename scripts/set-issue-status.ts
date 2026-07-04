/**
 * Move one issue to a new status as Claude works through the board.
 *
 *   npm run issue:status -- <issue-id> <status> [--dry-run]
 *
 * <status> is one of: planned | in_progress | awaiting_feedback
 *   planned           — picked up, planning the implementation
 *   in_progress       — applying changes
 *   awaiting_feedback — pushed to the LIVE environment, awaiting requester sign-off
 *
 * The move is a plain authenticated UPDATE (see scripts/adminClient.ts). Existing
 * DB triggers then (a) log a 'status' event to feature_request_events with you as
 * the actor, and (b) notify the requester "Moved to …". Because that notification
 * is real and user-facing, --dry-run validates + reports without writing.
 *
 * Transition rules are enforced by src/lib/issueWorkflow.ts (tested offline). This
 * tool never sets done/declined/submitted.
 */
import { adminClient } from "./adminClient";
import {
  checkTransition,
  isIssueStatus,
} from "../src/lib/issueWorkflow";

function usage(msg: string): never {
  console.error(
    `${msg}\n\nUsage: npm run issue:status -- <issue-id> <status> [--dry-run]\n` +
      `  status: planned | in_progress | awaiting_feedback`,
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((a) => !a.startsWith("--"));
  const [id, target] = positional;

  if (!id || !target) usage("Expected an issue id and a target status.");
  if (!isIssueStatus(target)) usage(`"${target}" is not a valid status.`);

  const supabase = await adminClient();

  const { data: row, error } = await supabase
    .from("feature_requests")
    .select("id,title,status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) usage(`No issue found with id ${id}.`);

  const from = row.status;
  const check = checkTransition(from, target);
  if (!check.ok) usage(check.reason ?? "Illegal transition.");

  if (check.noop) {
    console.log(`No change — "${row.title}" is already ${from}.`);
    return;
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would move "${row.title}"\n  ${from} → ${target}\n` +
        `  (would log an audit event and notify the requester). No write made.`,
    );
    return;
  }

  const { error: upErr } = await supabase
    .from("feature_requests")
    .update({ status: target, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) throw upErr;

  console.log(
    `Moved "${row.title}"\n  ${from} → ${target}\n` +
      `Audit event logged; requester notified.`,
  );
}

main().catch((err) => {
  console.error("Failed to set issue status:", err.message ?? err);
  process.exit(1);
});
