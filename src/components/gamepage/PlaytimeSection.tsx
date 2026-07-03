import { useEffect, useMemo, useRef, useState } from "react";
import { Package } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { foldedCompilationCopies } from "../../lib/ownershipMerge";
import { formatLength, formatPlaytime } from "../../lib/playtime";
import {
  summarizePlatformPlaytime,
  buildPlaytimeRows,
  type PlaytimeBreakdown,
  type PlaytimeRow,
} from "../../lib/platformPlaytime";
import { ownedVersions } from "../../lib/copies";
import { PlayedByVersionFields, resolvedRowHours } from "../PlayedByVersionFields";

/** Your logged play time per version (platform + format), immediate-write: a
 *  row persists the moment its field loses focus (an attributed
 *  set_platform_playtime correction), then the breakdown re-fetches so the
 *  rows always reflect what's stored. No Save button anywhere.
 *
 *  Bundle copies of this same game (folded compilation copies of a standalone
 *  master) contribute their sessions to the combined view. Moving those hours
 *  onto this master is deliberately an explicit button — a page view must
 *  never rewrite data by itself — and runs exactly once: every row is written
 *  to the master, then each copy's contributed buckets are zeroed on its own
 *  record. Append-only corrections throughout, so totals are preserved. */
export function PlaytimeSection({ game }: { game: Game }) {
  const { fetchPlaySessions, setPlatformPlaytime, trackEditions } = useStore();
  const allGames = useStore((s) => s.games);
  const foldedCopies = useMemo(() => foldedCompilationCopies(allGames, game), [allGames, game]);

  // The platforms rows are offered for: your copies plus the folded bundle
  // copies' platforms, so time can live on a platform owned only via a bundle.
  const copies = useMemo(
    () => [...(game.copies ?? []), ...foldedCopies.flatMap((c) => c.copies ?? [])],
    [game.copies, foldedCopies],
  );

  const [breakdown, setBreakdown] = useState<PlaytimeBreakdown | null>(null);
  // Per-record breakdowns of the folded copies, so consolidation can zero
  // exactly the buckets they contributed.
  const [mergeBreakdowns, setMergeBreakdowns] = useState<
    { id: string; breakdown: PlaytimeBreakdown }[]
  >([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // A stable key for the merge sources so the fetch doesn't re-run every render.
  const mergeIds = foldedCopies.map((m) => m.id).join(",");

  const loadBreakdowns = useMemo(
    () => async () => {
      const ids = mergeIds ? mergeIds.split(",") : [];
      const results = await Promise.all([
        fetchPlaySessions(game.id),
        ...ids.map((id) => fetchPlaySessions(id)),
      ]);
      return {
        combined: summarizePlatformPlaytime(results.flat()),
        perRecord: ids.map((id, i) => ({
          id,
          breakdown: summarizePlatformPlaytime(results[i + 1]),
        })),
      };
    },
    [game.id, fetchPlaySessions, mergeIds],
  );

  useEffect(() => {
    let active = true;
    void loadBreakdowns().then(({ combined, perRecord }) => {
      if (!active) return;
      setBreakdown(combined);
      setMergeBreakdowns(perRecord);
    });
    return () => {
      active = false;
    };
  }, [loadBreakdowns]);

  const rows = useMemo(
    () =>
      breakdown
        ? buildPlaytimeRows(ownedVersions(copies), breakdown, { byPlatform: !trackEditions })
        : null,
    [copies, breakdown, trackEditions],
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
    const { combined, perRecord } = await loadBreakdowns();
    setBreakdown(combined);
    setMergeBreakdowns(perRecord);
  };

  // Persist one row when its field loses focus: clear any folded-in buckets it
  // absorbs (legacy format-less time, off-copy remnants), then set the
  // canonical bucket. An unchanged or unparseable draft is a silent no-op.
  //
  // While bundle copies still hold time, a lone-row write would double-count
  // (each row's total already includes their hours, and the copies would keep
  // theirs too) — so any edit runs the full consolidation instead, exactly
  // like the old modal's Save. The combined display doesn't change; only
  // where the hours are stored does.
  const commitRow = (key: string) => {
    if (!rows) return;
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const next = resolvedRowHours(row, drafts[key]);
    if (Math.abs(next - row.hours) <= 1e-9) return;
    if (foldedHours > 0) {
      consolidate();
      return;
    }
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

  // Hours logged on bundle copies that could move onto this master record.
  const foldedHours = mergeBreakdowns.reduce(
    (sum, m) =>
      sum + m.breakdown.byVersion.reduce((s, v) => s + v.hours, 0) + m.breakdown.unattributed,
    0,
  );

  const consolidate = () => {
    if (!rows) return;
    const sources = mergeBreakdowns;
    enqueue(async () => {
      // Claim every row's combined total on the master (the folded hours are
      // already included in each row), then zero the copies' own buckets.
      for (const r of rows) {
        const next = resolvedRowHours(r, drafts[r.key]);
        for (const a of r.absorbs) {
          await setPlatformPlaytime(game.id, a.platform, a.format, 0);
        }
        await setPlatformPlaytime(game.id, r.platform, r.format, next);
      }
      for (const m of sources) {
        for (const v of m.breakdown.byVersion) {
          await setPlatformPlaytime(m.id, v.platform, v.format, 0);
        }
        if (m.breakdown.unattributed > 0) {
          await setPlatformPlaytime(m.id, null, null, 0);
        }
      }
      setDrafts({});
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
      {foldedHours > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/50 px-3 py-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Package size={13} className="shrink-0 text-accent" />
            {formatPlaytime(foldedHours)} of this time is logged on bundle copies.
          </span>
          <button
            type="button"
            onClick={consolidate}
            className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-brand/50 hover:text-accent"
          >
            Move it onto this game
          </button>
        </div>
      )}
      <p className="text-[10px] text-subtle">
        Changes are saved the moment you leave a field.
      </p>
    </div>
  );
}
