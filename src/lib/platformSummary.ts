// Profile Hub "Platforms" module data: every platform in the owned library,
// each with a segmented status breakdown (how much of that platform's shelf is
// still in the Bazaar vs. playing vs. cleared, and how it was cleared). Pure
// (no React/Supabase) so the rollup is unit-tested directly; the component in
// ProfileHub.tsx just renders these rows as bars.

import type { Game } from "../types";
import { gameOwnedPlatforms } from "./bazaarView";
import { isOwned, NO_PLATFORM_LABEL } from "./ledger";

/** One platform's shelf, segmented by where its games stand. The five buckets
 *  always sum to `total`, so a bar renders gap-free. Finished games split by
 *  finish tag; a legacy untagged clear counts as Beaten (the same "standard
 *  clear" default the milestone capture uses). */
export interface PlatformStatusRow {
  platform: string;
  total: number;
  backlog: number;
  playing: number;
  beaten: number;
  completed: number;
  endless: number;
  /** Everything on this platform is finished — the shelf is 100% cleared. */
  allFinished: boolean;
}

/** Roll the library up into per-platform status rows. Owned games only
 *  (Wishlist is an unowned wish, not a shelf); a game owned on several
 *  platforms counts on each of them, mirroring the Master Ledger's platform
 *  grouping; games with no platform recorded gather under the
 *  "Unspecified platform" bucket so nothing silently disappears. Rows come
 *  back alphabetised with the no-platform bucket last. */
export function platformSummary(games: Game[]): PlatformStatusRow[] {
  const rows = new Map<string, PlatformStatusRow>();
  const bump = (platform: string, g: Game) => {
    let row = rows.get(platform);
    if (!row) {
      row = {
        platform,
        total: 0,
        backlog: 0,
        playing: 0,
        beaten: 0,
        completed: 0,
        endless: 0,
        allFinished: false,
      };
      rows.set(platform, row);
    }
    row.total++;
    if (g.status === "backlog") row.backlog++;
    else if (g.status === "playing") row.playing++;
    else if (g.status === "finished") {
      if (g.finishTag === "completed") row.completed++;
      else if (g.finishTag === "endless") row.endless++;
      else row.beaten++; // "beaten" or a legacy untagged clear
    }
  };

  for (const g of games) {
    if (!isOwned(g)) continue;
    const platforms = gameOwnedPlatforms(g);
    if (platforms.length === 0) {
      bump(NO_PLATFORM_LABEL, g);
      continue;
    }
    for (const p of platforms) bump(p, g);
  }

  const out = [...rows.values()];
  for (const row of out) {
    row.allFinished = row.total > 0 && row.backlog === 0 && row.playing === 0;
  }
  out.sort((a, b) => {
    if (a.platform === NO_PLATFORM_LABEL) return 1;
    if (b.platform === NO_PLATFORM_LABEL) return -1;
    return a.platform.localeCompare(b.platform);
  });
  return out;
}

/** The bar's segments in display order, with their theme-token color classes
 *  (mirroring the milestone-dot palette: journey start → journey end). */
export const PLATFORM_SEGMENTS: {
  key: "backlog" | "playing" | "beaten" | "completed" | "endless";
  label: string;
  barClass: string;
}[] = [
  { key: "backlog", label: "In the Bazaar", barClass: "bg-subtle/60" },
  { key: "playing", label: "Playing", barClass: "bg-accent" },
  { key: "beaten", label: "Beaten", barClass: "bg-success" },
  { key: "completed", label: "Completed", barClass: "bg-brand" },
  { key: "endless", label: "Endless", barClass: "bg-muted" },
];
