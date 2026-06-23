// Per-version playtime, derived from a game's playtime_events. Each logged
// session carries the version it was played on — a platform plus its format
// (physical/digital) — so a physical and a digital copy of the same platform are
// tracked separately. This module breaks a game's hours down by version AND finds
// the version played most recently (to pre-select it in the log-time picker).
// Kept free of React/Supabase so it's directly unit-tested.

import type { CopyFormat } from "../types";
import { snapToMinute } from "./playtime";
import { versionKey, versionLabel, type OwnedVersion } from "./copies";

/** One logged play session: how many hours, on which version, and when. `platform`
 *  is null when the session couldn't be attributed (multi-version game, no choice
 *  made, or time recorded before per-version tracking existed); `format` is null
 *  when no format was recorded. */
export interface PlaySession {
  platform: string | null;
  format: CopyFormat | null;
  hours: number;
  createdAt: number;
}

/** One version's share of a game's logged time. */
export interface VersionPlaytime {
  platform: string;
  format: CopyFormat | null;
  hours: number;
}

/** A (platform, format) version identity. */
export interface VersionId {
  platform: string;
  format: CopyFormat | null;
}

export interface PlaytimeBreakdown {
  /** Per-version totals, largest first (ties broken by label). */
  byVersion: VersionPlaytime[];
  /** Hours that couldn't be attributed to a specific version. */
  unattributed: number;
  /** The version of the most recent attributed session — the one to pre-select
   *  when logging more time. Null when nothing is attributed. */
  lastVersion: VersionId | null;
}

/** Summarize a game's sessions into a per-version breakdown plus the
 *  most-recently-played version. Negative deltas (a downward correction) net out
 *  within their version, matching the game's total. */
export function summarizePlatformPlaytime(sessions: PlaySession[]): PlaytimeBreakdown {
  const totals = new Map<string, VersionPlaytime>();
  let unattributed = 0;
  let lastVersion: VersionId | null = null;
  let lastAt = -Infinity;

  for (const s of sessions) {
    const platform = s.platform?.trim() || "";
    if (platform === "") {
      unattributed += s.hours;
      continue;
    }
    const format = s.format ?? null;
    const key = versionKey(platform, format);
    const cur = totals.get(key);
    if (cur) cur.hours += s.hours;
    else totals.set(key, { platform, format, hours: s.hours });
    if (s.createdAt > lastAt) {
      lastAt = s.createdAt;
      lastVersion = { platform, format };
    }
  }

  const byVersion = [...totals.values()]
    .map((v) => ({ ...v, hours: snapToMinute(v.hours) }))
    // Drop versions whose corrections cancelled to ~zero so they don't clutter.
    .filter((v) => v.hours > 0)
    .sort(
      (a, b) =>
        b.hours - a.hours ||
        versionLabel(a.platform, a.format).localeCompare(versionLabel(b.platform, b.format)),
    );

  return { byVersion, unattributed: snapToMinute(Math.max(0, unattributed)), lastVersion };
}

/** Whether there's a meaningful breakdown to show — i.e. more than one version
 *  has logged time, or some time is attributed while some isn't. A single version
 *  with everything on it needs no breakdown (it equals the total). */
export function hasPlatformBreakdown(b: PlaytimeBreakdown): boolean {
  return b.byVersion.length >= 2 || (b.byVersion.length >= 1 && b.unattributed > 0);
}

/** One editable line in the per-version playtime editor. `platform`/`format` are
 *  the version it writes to (platform null = the Unspecified bucket). `absorbs`
 *  lists other raw buckets folded into this row — e.g. legacy format-less time on
 *  a platform you now own in exactly one format — that must be cleared when the
 *  row's hours are edited, so the folded total lands on the canonical version. */
export interface PlaytimeRow {
  key: string; // stable React key + bucket identity
  platform: string | null;
  format: CopyFormat | null;
  label: string;
  hours: number; // hours currently logged to this version (incl. absorbed buckets)
  absorbs: VersionId[];
}

/** The unspecified bucket's stable key. */
export const UNSPECIFIED_ROW_KEY = "__unspecified__";

/** Build the rows for the per-version playtime editor: one per version you own
 *  this game on (or have logged time on), pre-filled with that version's logged
 *  hours, biggest first. A reassignable "Unspecified" row is appended when some
 *  time isn't attributed. A game with no versions and no time collapses to a
 *  single generic "Played" row (writing the unspecified bucket).
 *
 *  Legacy time logged on a platform with no recorded format is folded onto that
 *  platform's copy when you own it in exactly one format — so old "PlayStation 4"
 *  time shows as "PlayStation 4 (Digital)" instead of a confusing separate row.
 *  It stays separate when the platform is owned in two formats (ambiguous). */
export function buildPlaytimeRows(
  ownedVersions: OwnedVersion[],
  breakdown: PlaytimeBreakdown,
): PlaytimeRow[] {
  // A platform owned as exactly one *formatted* version absorbs that platform's
  // format-less ("unknown format") logged time.
  const ownedByPlatform = new Map<string, OwnedVersion[]>();
  for (const o of ownedVersions) {
    const arr = ownedByPlatform.get(o.platform) ?? [];
    arr.push(o);
    ownedByPlatform.set(o.platform, arr);
  }
  const foldFormat = (platform: string): CopyFormat | null => {
    const arr = ownedByPlatform.get(platform);
    return arr && arr.length === 1 && arr[0].format ? arr[0].format : null;
  };

  // Canonicalize each logged-time bucket (folding format-less time where it's
  // unambiguous), summing hours and remembering what was absorbed.
  const canon = new Map<
    string,
    { platform: string; format: CopyFormat | null; hours: number; absorbs: VersionId[] }
  >();
  for (const bv of breakdown.byVersion) {
    let format = bv.format;
    let absorbed: VersionId | null = null;
    if (format == null) {
      const f = foldFormat(bv.platform);
      if (f) {
        absorbed = { platform: bv.platform, format: null };
        format = f;
      }
    }
    const key = versionKey(bv.platform, format);
    const cur = canon.get(key);
    if (cur) {
      cur.hours += bv.hours;
      if (absorbed) cur.absorbs.push(absorbed);
    } else {
      canon.set(key, {
        platform: bv.platform,
        format,
        hours: bv.hours,
        absorbs: absorbed ? [absorbed] : [],
      });
    }
  }

  // Version list: owned versions first, then any logged-on versions not owned.
  const seen = new Set<string>();
  const versions: VersionId[] = [];
  const pushVersion = (platform: string, format: CopyFormat | null) => {
    const p = platform.trim();
    if (!p) return;
    const key = versionKey(p, format);
    if (seen.has(key)) return;
    seen.add(key);
    versions.push({ platform: p, format });
  };
  for (const o of ownedVersions) pushVersion(o.platform, o.format ?? null);
  for (const c of canon.values()) pushVersion(c.platform, c.format);

  const rows: PlaytimeRow[] = versions
    .map((v) => {
      const key = versionKey(v.platform, v.format);
      const c = canon.get(key);
      return {
        key,
        platform: v.platform,
        format: v.format,
        label: versionLabel(v.platform, v.format),
        hours: c?.hours ?? 0,
        absorbs: c?.absorbs ?? [],
      };
    })
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));

  if (breakdown.unattributed > 0) {
    rows.push({
      key: UNSPECIFIED_ROW_KEY,
      platform: null,
      format: null,
      label: "Unspecified",
      hours: breakdown.unattributed,
      absorbs: [],
    });
  }

  if (rows.length === 0) {
    rows.push({ key: "__played__", platform: null, format: null, label: "Played", hours: 0, absorbs: [] });
  }

  return rows;
}
