// Profile Hub "Recent Activity": a cross-game roll-up of a player's game
// milestones (added / started / beat / completed / retired / unretired), newest
// first. Pure vocabulary, row coercion, ordering, and presentation mapping so
// the feed logic is unit-tested offline; ProfileHub renders it.
//
// Rows come from the `list_profile_activity` RPC for online profiles (own AND
// visited). When that's unavailable — offline mode, or before the fetch lands —
// the OWN/visited library still yields a lightweight fallback (Added + Finished
// only, the two things the client can date locally), so the section is never
// blank. The richer kinds (Started, Retired, …) only exist server-side.

import type { Game } from "../types";
import type { FinishTag } from "./finishTags";
import { type MilestoneKind, KIND_RANK, coerceMilestoneKind } from "./milestones";

/** One row in the Recent Activity feed. Mirrors a game_milestone, plus the
 *  finish tag so Beat vs Completed can be styled distinctly. */
export interface ProfileActivity {
  id: string; // milestone id (or `${gameId}:${kind}` for the local fallback)
  kind: MilestoneKind;
  occurredOn: string; // "YYYY-MM-DD"
  createdAt: number; // epoch ms — sort tiebreak only
  gameId: string;
  gameTitle: string;
  gameImage: string | null;
  finishTag: FinishTag | null;
}

/** How many rows the feed shows before "Show all". */
export const RECENT_ACTIVITY_SHOWN = 6;

function coerceFinishTag(v: unknown): FinishTag | null {
  return v === "beaten" || v === "completed" || v === "endless" ? v : null;
}

/** Map a raw `list_profile_activity` row to a typed activity, or null when
 *  malformed — a bad row must never crash the feed. */
export function coerceActivityRow(r: Record<string, unknown>): ProfileActivity | null {
  const kind = coerceMilestoneKind(r.kind);
  const id = typeof r.milestone_id === "string" ? r.milestone_id : null;
  const gameId = typeof r.game_id === "string" ? r.game_id : null;
  const occurredOn = typeof r.occurred_on === "string" ? r.occurred_on.slice(0, 10) : null;
  const gameTitle = typeof r.game_title === "string" ? r.game_title : null;
  if (!kind || !id || !gameId || !occurredOn || gameTitle == null) return null;
  return {
    id,
    kind,
    occurredOn,
    createdAt: typeof r.created_at === "string" ? Date.parse(r.created_at) : 0,
    gameId,
    gameTitle,
    gameImage: typeof r.game_image === "string" ? r.game_image : null,
    finishTag: coerceFinishTag(r.finish_tag),
  };
}

/** Coerce a batch of RPC rows, dropping malformed ones, already sorted. */
export function coerceActivity(rows: Record<string, unknown>[]): ProfileActivity[] {
  return sortActivity(
    rows.map(coerceActivityRow).filter((a): a is ProfileActivity => a != null),
  );
}

/** Newest first: date desc, then the actual recorded time within that day (the
 *  event that happened later on top), so the feed reflects the real order things
 *  occurred as you add and move games — not a fixed journey order (issue
 *  05247094). The journey rank only breaks ties between events stamped the same
 *  instant. Non-mutating. */
export function sortActivity(list: ProfileActivity[]): ProfileActivity[] {
  return [...list].sort(
    (a, b) =>
      b.occurredOn.localeCompare(a.occurredOn) ||
      b.createdAt - a.createdAt ||
      KIND_RANK[b.kind] - KIND_RANK[a.kind],
  );
}

/** Local YYYY-MM-DD for an epoch — the fallback's date, matching how the
 *  milestone capture records a day. */
function epochToISO(ms: number): string {
  const d = new Date(ms);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

function localRow(g: Game, kind: MilestoneKind, at: number): ProfileActivity {
  return {
    id: `${g.id}:${kind}`,
    kind,
    occurredOn: epochToISO(at),
    createdAt: at,
    gameId: g.id,
    gameTitle: g.title,
    gameImage: g.image ?? null,
    finishTag: g.finishTag ?? null,
  };
}

/** A best-effort feed derived from the local library, for when the RPC isn't
 *  available (offline, or the first paint before it resolves). Only two things
 *  are datable from a games row — when it was added and when it was finished —
 *  so those are all this surfaces; the online feed adds Started/unretire
 *  cycles/etc. An endless conclusion is a retirement, not a clear, so it's
 *  left out (matching the milestone vocabulary, which has no "beat" for
 *  endless); a salvaged drop maps to its own Retired step. */
export function localActivityFallback(games: Game[]): ProfileActivity[] {
  const out: ProfileActivity[] = [];
  for (const g of games) {
    if (g.addedAt != null) out.push(localRow(g, "added", g.addedAt));
    if (g.status === "finished" && g.finishedAt != null && g.finishTag !== "endless") {
      out.push(
        localRow(
          g,
          g.finishTag === "completed" ? "completed" : g.finishTag === "retired" ? "retired" : "beat",
          g.finishedAt,
        ),
      );
    }
  }
  return sortActivity(out);
}

/** The card tone for a kind: Completed earns the premium gold, a Beat clear the
 *  quiet silver, and every other step a plain panel. Keeps the celebratory look
 *  the feed had when it only showed clears. */
export function activityTone(kind: MilestoneKind): "gold" | "silver" | "quiet" {
  if (kind === "completed") return "gold";
  if (kind === "beat") return "silver";
  return "quiet";
}
