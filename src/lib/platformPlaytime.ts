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
