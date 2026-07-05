import { useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { formatLength } from "../../lib/playtime";
import {
  summarizePlatformPlaytime,
  buildPlaytimeRows,
  type PlaytimeBreakdown,
} from "../../lib/platformPlaytime";
import { ownedVersions } from "../../lib/copies";
import { PlayedByVersionFields, resolvedRowHours } from "../PlayedByVersionFields";

/** Your logged play time per version (platform + format), immediate-write: a
 *  row persists the moment its field loses focus (an attributed
 *  set_platform_playtime correction), then the breakdown re-fetches so the
 *  rows always reflect what's stored. No Save button anywhere.
 *
 *  Each instance tracks strictly its own sessions — a bundle copy of the same
 *  game keeps its hours on its own record (instances are never folded). */
export function PlaytimeSection({ game }: { game: Game }) {
  const { fetchPlaySessions, setPlatformPlaytime, trackEditions } = useStore();

  const [breakdown, setBreakdown] = useState<PlaytimeBreakdown | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void fetchPlaySessions(game.id).then((sessions) => {
      if (!active) return;
      setBreakdown(summarizePlatformPlaytime(sessions));
    });
    return () => {
      active = false;
    };
  }, [game.id, fetchPlaySessions]);

  const rows = useMemo(
    () =>
      breakdown
        ? buildPlaytimeRows(ownedVersions(game.copies), breakdown, { byPlatform: !trackEditions })
        : null,
    [game.copies, breakdown, trackEditions],
  );

  // Keep the editable values in sync as the rows change; existing drafts win so
  // a re-fetch never stomps something mid-type in another field.
  useEffect(() => {
    if (!rows) return;
    setDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const r of rows) next[r.key] = prev[r.key] ?? formatLength(r.hours);
      return next;
    });
  }, [rows]);

  // Writes are serialized through one promise chain: a quick Tab-through of
  // several rows queues their corrections in order instead of interleaving RPCs.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (task: () => Promise<void>) => {
    chainRef.current = chainRef.current.then(task, task);
  };

  const refresh = async () => {
    const sessions = await fetchPlaySessions(game.id);
    setBreakdown(summarizePlatformPlaytime(sessions));
  };

  // Persist one row when its field loses focus: clear any folded-in buckets it
  // absorbs (legacy format-less time, off-copy remnants), then set the
  // canonical bucket. An unchanged or unparseable draft is a silent no-op.
  const commitRow = (key: string) => {
    if (!rows) return;
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const next = resolvedRowHours(row, drafts[key]);
    if (Math.abs(next - row.hours) <= 1e-9) return;
    enqueue(async () => {
      for (const a of row.absorbs) {
        await setPlatformPlaytime(game.id, a.platform, a.format, 0);
      }
      await setPlatformPlaytime(game.id, row.platform, row.format, next);
      // Reset this row's draft so the re-fetched hours show canonically (other
      // rows keep whatever is mid-type in them).
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[key];
        return copy;
      });
      await refresh();
    });
  };

  if (!rows) {
    return <div className="text-sm text-subtle">Loading play time…</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <PlayedByVersionFields
        rows={rows}
        drafts={drafts}
        onChange={(key, value) => setDrafts((d) => ({ ...d, [key]: value }))}
        onCommit={commitRow}
        trackEditions={trackEditions}
      />
      <p className="text-[10px] text-subtle">
        Changes are saved the moment you leave a field.
      </p>
    </div>
  );
}
