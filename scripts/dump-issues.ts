/**
 * Export the issues board (feature requests + bug reports) to local files so an
 * agent — or you — can read the current backlog without opening the app.
 *
 *   npm run issues            # writes ISSUES.local.md + issues.local.json
 *
 * Run with vite-node (via the npm script) so it can import the tested pure logic
 * in src/lib/issuesDigest.ts.
 *
 * AUTH: signs in as your admin account (see scripts/adminClient.ts). Any
 * authenticated user can read the whole board, so this needs no elevated key.
 *
 * Outputs are written to gitignored paths (*.local.*) because they contain
 * user-authored content.
 */
import { writeFileSync } from "node:fs";
import { adminClient } from "./adminClient";
import {
  formatIssuesDigest,
  isWorkable,
  rankIssues,
  type IssueRecord,
} from "../src/lib/issuesDigest";

async function main() {
  const supabase = await adminClient();
  const { data: rows, error } = await supabase
    .from("feature_requests")
    .select(
      "id,kind,title,description,status,priority,effort,tags,is_admin_item,created_at,updated_at,edited_at",
    );
  if (error) throw error;

  // Tally votes and comments client-side (one lightweight row per vote/comment).
  const [{ data: votes, error: vErr }, { data: comments, error: cErr }] =
    await Promise.all([
      supabase.from("feature_votes").select("request_id"),
      supabase.from("feature_comments").select("request_id"),
    ]);
  if (vErr) throw vErr;
  if (cErr) throw cErr;

  const countBy = (arr: { request_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of arr ?? []) m.set(r.request_id, (m.get(r.request_id) ?? 0) + 1);
    return m;
  };
  const voteCounts = countBy(votes);
  const commentCounts = countBy(comments);

  const issues: IssueRecord[] = (rows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    effort: r.effort,
    tags: r.tags ?? [],
    is_admin_item: r.is_admin_item,
    created_at: r.created_at,
    updated_at: r.updated_at,
    edited_at: r.edited_at,
    voteCount: voteCounts.get(r.id) ?? 0,
    commentCount: commentCounts.get(r.id) ?? 0,
  }));

  const ranked = rankIssues(issues);
  writeFileSync("issues.local.json", JSON.stringify(ranked, null, 2) + "\n");
  writeFileSync("ISSUES.local.md", formatIssuesDigest(issues));

  const workable = issues.filter((i) => isWorkable(i.status));
  console.log(
    `Wrote ISSUES.local.md and issues.local.json — ${issues.length} issues (${workable.length} in work queue).`,
  );
}

main().catch((err) => {
  console.error("Failed to export issues:", err.message ?? err);
  process.exit(1);
});
