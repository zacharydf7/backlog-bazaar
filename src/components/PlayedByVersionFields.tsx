import { Clock, Gamepad2 } from "lucide-react";
import { formatPlaytime } from "../lib/playtime";
import { parsePlaytime } from "../lib/playtime";
import { UNSPECIFIED_ROW_KEY, type PlaytimeRow } from "../lib/platformPlaytime";

// The per-version "Played by platform/version" fields, shared by the Edit modal's
// PlaytimeEditor (which owns fetching + saving) and the Add Game form (which
// collects starting hours for the copies being added). Purely presentational:
// one row per version with a draft value, collapsing to a single plain "Played"
// field when there's only one bucket.

/** Resolve a row's edited hours: blank means zero (clear the bucket); an
 *  unparseable value leaves the bucket unchanged. */
export function resolvedRowHours(row: PlaytimeRow, draft: string | undefined): number {
  const text = (draft ?? "").trim();
  if (text === "") return 0;
  return parsePlaytime(text) ?? row.hours;
}

export function PlayedByVersionFields({
  rows,
  drafts,
  onChange,
  trackEditions,
}: {
  rows: PlaytimeRow[];
  drafts: Record<string, string>;
  onChange: (key: string, value: string) => void;
  trackEditions: boolean;
}) {
  // One bucket → a plain "Played" field (the version is unambiguous). Two or
  // more → the per-version splitter with a reassignable Unspecified row.
  if (rows.length === 1) {
    const key = rows[0].key;
    return (
      <label className="text-sm text-muted">
        Played
        <input
          type="text"
          value={drafts[key] ?? ""}
          onChange={(e) => onChange(key, e.target.value)}
          placeholder="e.g. 1h 30m"
          className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
      </label>
    );
  }

  const total = rows.reduce((sum, r) => sum + resolvedRowHours(r, drafts[r.key]), 0);
  return (
    <div className="rounded-xl border border-line bg-panel/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
          <Clock size={13} className="text-accent" /> Played by{" "}
          {trackEditions ? "version" : "platform"}
        </span>
        <span className="text-[11px] text-subtle">
          Total <span className="tabular-nums text-muted">{formatPlaytime(total)}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <label key={r.key} className="flex items-center gap-2">
            <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm text-ink">
              {r.platform != null ? (
                <Gamepad2 size={13} className="shrink-0 text-accent/70" />
              ) : (
                <Clock size={13} className="shrink-0 text-subtle" />
              )}
              <span className="truncate" title={r.label}>
                {r.label}
              </span>
            </span>
            <input
              type="text"
              value={drafts[r.key] ?? ""}
              onChange={(e) => onChange(r.key, e.target.value)}
              placeholder="0h"
              aria-label={`Hours played${r.platform ? ` on ${r.label}` : ""}`}
              className="w-28 shrink-0 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </label>
        ))}
      </div>
      {rows.some((r) => r.key === UNSPECIFIED_ROW_KEY) && (
        <p className="mt-2 text-[11px] text-subtle">
          Time is tracked per {trackEditions ? "version" : "platform"}. “Unspecified” collects
          hours not tied to a {trackEditions ? "copy" : "platform"} you own — time logged without
          one, or on a copy you've changed or removed — so you can move it onto the{" "}
          {trackEditions ? "version" : "platform"} you actually played.
        </p>
      )}
    </div>
  );
}
