// Per-version (per-platform) playtime, derived from a game's playtime_events.
// Each logged session carries the platform it was played on (when known), so we
// can break a game's total hours down by platform AND remember which version was
// played most recently — used to pre-select the right version in the log-time
// picker. Kept free of React/Supabase so it's directly unit-tested.

import { snapToMinute } from "./playtime";

/** One logged play session: how many hours, where, and when. `platform` is null
 *  when the session couldn't be attributed (multi-platform game, no choice made,
 *  or time recorded before per-version tracking existed). */
export interface PlaySession {
  platform: string | null;
  hours: number;
  createdAt: number;
}

/** A single platform's share of a game's logged time. */
export interface PlatformPlaytime {
  platform: string;
  hours: number;
}

export interface PlaytimeBreakdown {
  /** Per-platform totals, largest first (ties broken alphabetically). */
  byPlatform: PlatformPlaytime[];
  /** Hours that couldn't be attributed to a specific platform. */
  unattributed: number;
  /** The platform of the most recent attributed session — the version to
   *  pre-select when logging more time. Null when nothing is attributed. */
  lastPlatform: string | null;
}

/** Summarize a game's sessions into a per-platform breakdown plus the
 *  most-recently-played platform. Negative deltas (a downward playtime
 *  correction) net out within their platform, matching the game's total. */
export function summarizePlatformPlaytime(sessions: PlaySession[]): PlaytimeBreakdown {
  const totals = new Map<string, number>();
  let unattributed = 0;
  let lastPlatform: string | null = null;
  let lastAt = -Infinity;

  for (const s of sessions) {
    const platform = s.platform?.trim() || "";
    if (platform === "") {
      unattributed += s.hours;
      continue;
    }
    totals.set(platform, (totals.get(platform) ?? 0) + s.hours);
    if (s.createdAt > lastAt) {
      lastAt = s.createdAt;
      lastPlatform = platform;
    }
  }

  const byPlatform = [...totals.entries()]
    .map(([platform, hours]) => ({ platform, hours: snapToMinute(hours) }))
    // Drop platforms whose corrections cancelled to ~zero so they don't clutter.
    .filter((p) => p.hours > 0)
    .sort((a, b) => b.hours - a.hours || a.platform.localeCompare(b.platform));

  return { byPlatform, unattributed: snapToMinute(Math.max(0, unattributed)), lastPlatform };
}

/** Whether there's a meaningful breakdown to show — i.e. more than one platform
 *  has logged time, or some time is attributed while some isn't. A single
 *  platform with everything on it needs no breakdown (it equals the total). */
export function hasPlatformBreakdown(b: PlaytimeBreakdown): boolean {
  return b.byPlatform.length >= 2 || (b.byPlatform.length >= 1 && b.unattributed > 0);
}

/** One editable line in the per-version playtime editor. `platform` is the bucket
 *  it writes to (a platform label, or null for the Unspecified bucket). */
export interface PlaytimeRow {
  key: string; // stable React key + bucket identity
  platform: string | null;
  label: string;
  hours: number; // hours currently logged to this bucket
}

/** The unspecified bucket's stable key. */
export const UNSPECIFIED_ROW_KEY = "__unspecified__";

/** Build the rows for the per-version playtime editor: one per platform you own
 *  this game on (or have logged time on), pre-filled with that platform's logged
 *  hours, biggest first. A reassignable "Unspecified" row is appended when some
 *  time isn't attributed. A game with no platforms and no time collapses to a
 *  single generic "Played" row (writing the unspecified bucket). */
export function buildPlaytimeRows(
  ownedPlatforms: string[],
  breakdown: PlaytimeBreakdown,
): PlaytimeRow[] {
  const hoursByPlatform = new Map(breakdown.byPlatform.map((p) => [p.platform, p.hours]));
  const seen = new Set<string>();
  const platforms: string[] = [];
  for (const p of [...ownedPlatforms, ...breakdown.byPlatform.map((b) => b.platform)]) {
    const t = p.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      platforms.push(t);
    }
  }

  const rows: PlaytimeRow[] = platforms
    .map((p) => ({ key: p, platform: p, label: p, hours: hoursByPlatform.get(p) ?? 0 }))
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));

  if (breakdown.unattributed > 0) {
    rows.push({
      key: UNSPECIFIED_ROW_KEY,
      platform: null,
      label: "Unspecified",
      hours: breakdown.unattributed,
    });
  }

  if (rows.length === 0) {
    rows.push({ key: "__played__", platform: null, label: "Played", hours: 0 });
  }

  return rows;
}
