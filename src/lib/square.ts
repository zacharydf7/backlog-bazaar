// Pure helpers for the Market Square's Open Stalls directory — the community
// page that replaced the coin-ranked leaderboard. The directory reuses the
// leaderboard() RPC rows (LeaderboardRow in src/lib/supabase.ts); the split,
// ordering, and subtitle rules live here so the component stays thin and the
// behaviour is unit-tested offline.

import { isOnline, lastSeenLabel } from "./presence";

/** The row fields the directory helpers read — a structural subset of
 *  LeaderboardRow so tests can build tiny literals. */
export interface StallRow {
  displayName: string;
  gamesFinished: number;
  hoursFinished: number;
  lastSeenAt: number | null;
  activity: string | null;
}

/** How the "All stalls" list can be ordered. */
export type StallSort = "active" | "clears" | "name";

/** The sort control's options, in display order. */
export const STALL_SORTS: { key: StallSort; label: string }[] = [
  { key: "active", label: "Recently active" },
  { key: "clears", label: "Most clears" },
  { key: "name", label: "A–Z" },
];

function byName(a: StallRow, b: StallRow): number {
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
}

/** Partition the directory into the pinned "Open now" group (players whose
 *  heartbeat is inside the online window) and everyone else. The open group is
 *  ordered A–Z rather than by last-seen: heartbeats land every ~45s, so a
 *  recency order would reshuffle the rows under the reader on every poll. The
 *  rest keep their input order — the caller applies the user's chosen sort. */
export function splitOpenStalls<T extends StallRow>(
  rows: T[],
  now: number = Date.now(),
): { open: T[]; rest: T[] } {
  const open: T[] = [];
  const rest: T[] = [];
  for (const r of rows) (isOnline(r.lastSeenAt, now) ? open : rest).push(r);
  open.sort(byName);
  return { open, rest };
}

/** A copy of `rows` in the chosen order. Ties (and missing heartbeats) fall
 *  back to name order so the list is stable and deterministic. */
export function sortStalls<T extends StallRow>(rows: T[], sort: StallSort): T[] {
  const out = [...rows];
  switch (sort) {
    case "active":
      out.sort((a, b) => (b.lastSeenAt ?? -Infinity) - (a.lastSeenAt ?? -Infinity) || byName(a, b));
      break;
    case "clears":
      out.sort(
        (a, b) =>
          b.gamesFinished - a.gamesFinished || b.hoursFinished - a.hoursFinished || byName(a, b),
      );
      break;
    case "name":
      out.sort(byName);
      break;
  }
  return out;
}

/** What a stall row's subtitle shows, in priority order: the live activity line
 *  while online, else how recently they were around, else their all-time stats
 *  (players who have never pinged a heartbeat). `kind` drives styling — the
 *  live activity renders in the success colour. */
export function stallSubtitle(
  row: StallRow,
  now: number = Date.now(),
): { kind: "activity" | "seen" | "stats"; text: string } {
  if (isOnline(row.lastSeenAt, now) && row.activity) {
    return { kind: "activity", text: row.activity };
  }
  const seen = lastSeenLabel(row.lastSeenAt, now);
  if (seen) return { kind: "seen", text: seen };
  return {
    kind: "stats",
    text: `${row.gamesFinished} finished · ${row.hoursFinished}h played`,
  };
}
