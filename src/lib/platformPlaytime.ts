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

/** Build the rows for the per-version playtime editor: one per version you
 *  currently own this game on, pre-filled with that version's logged hours,
 *  biggest first. Any logged time that doesn't match a copy you own right now —
 *  time recorded without a version, or time on a copy you've since changed or
 *  removed — pools into a single reassignable "Unspecified" row (which absorbs
 *  those buckets, so editing it moves the hours). A game with no copies and no
 *  time collapses to a single generic "Played" row.
 *
 *  Legacy time logged on a platform with no recorded format is folded onto that
 *  platform's copy when you own it in exactly one format — so old "PlayStation 4"
 *  time shows as "PlayStation 4 (Digital)" instead of a confusing separate row.
 *  It pools into "Unspecified" when the platform is owned in two formats. */
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

  // The versions you currently own, in first-seen order, each accumulating its
  // matching logged hours.
  const ownedKeys: string[] = [];
  const owned = new Map<
    string,
    { platform: string; format: CopyFormat | null; hours: number; absorbs: VersionId[] }
  >();
  for (const o of ownedVersions) {
    const key = versionKey(o.platform, o.format ?? null);
    if (!owned.has(key)) {
      owned.set(key, { platform: o.platform, format: o.format ?? null, hours: 0, absorbs: [] });
      ownedKeys.push(key);
    }
  }

  // Everything not matching a copy you own pools into the reassignable bucket and
  // is absorbed (so editing the row clears those underlying buckets).
  let otherHours = breakdown.unattributed;
  const otherAbsorbs: VersionId[] = [];

  for (const bv of breakdown.byVersion) {
    const raw: VersionId = { platform: bv.platform, format: bv.format };
    let target = owned.get(versionKey(bv.platform, bv.format));
    let folded = false;
    if (!target && bv.format == null) {
      const f = foldFormat(bv.platform);
      if (f) {
        target = owned.get(versionKey(bv.platform, f));
        folded = target != null;
      }
    }
    if (target) {
      target.hours += bv.hours;
      // A folded bucket lives on a different (format-less) key, so the owned row
      // must clear it when its hours are edited.
      if (folded) target.absorbs.push(raw);
    } else {
      otherHours += bv.hours;
      otherAbsorbs.push(raw);
    }
  }

  const rows: PlaytimeRow[] = ownedKeys
    .map((key) => {
      const e = owned.get(key)!;
      return {
        key,
        platform: e.platform,
        format: e.format,
        label: versionLabel(e.platform, e.format),
        hours: e.hours,
        absorbs: e.absorbs,
      };
    })
    .sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));

  if (otherHours > 0) {
    rows.push({
      key: UNSPECIFIED_ROW_KEY,
      platform: null,
      format: null,
      label: "Unspecified",
      hours: snapToMinute(otherHours),
      absorbs: otherAbsorbs,
    });
  }

  if (rows.length === 0) {
    rows.push({ key: "__played__", platform: null, format: null, label: "Played", hours: 0, absorbs: [] });
  }

  return rows;
}
