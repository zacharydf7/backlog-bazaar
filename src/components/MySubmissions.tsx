import { useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, Sparkles, Pencil, Clock, Check, X, ArrowDownUp, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { diffCatalog, emptyCatalogFields } from "../lib/submissions";
import type { MySubmission, SubmissionStatus } from "../types";

type StatusFilter = SubmissionStatus | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "In review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Not approved" },
];

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; icon: LucideIcon; chip: string }
> = {
  pending: { label: "In review", icon: Clock, chip: "bg-line text-subtle" },
  approved: { label: "Approved", icon: Check, chip: "bg-success/15 text-success" },
  rejected: { label: "Not approved", icon: X, chip: "bg-danger/15 text-danger" },
};

/** A tiny three-step tracker: Submitted → In review → Decision. */
function StatusTrack({ status }: { status: SubmissionStatus }) {
  const decided = status !== "pending";
  const approved = status === "approved";
  const steps = [
    { label: "Submitted", done: true },
    { label: "In review", done: decided, active: !decided },
    {
      label: approved ? "Approved" : status === "rejected" ? "Declined" : "Decision",
      done: decided,
    },
  ];
  return (
    <div className="mt-2 flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-center gap-1">
          <span
            className={
              "h-1.5 flex-1 rounded-full " +
              (s.done
                ? status === "rejected" && i === 2
                  ? "bg-danger"
                  : "bg-success"
                : "active" in s && s.active
                  ? "bg-accent"
                  : "bg-line")
            }
          />
        </div>
      ))}
    </div>
  );
}

/** The current user's own catalog contributions and where each stands in review.
 *  `initialId` (from a notification deep-link) scrolls to and highlights an item. */
export function MySubmissions({ initialId }: { initialId?: string } = {}) {
  const { fetchMySubmissions } = useStore();
  const [items, setItems] = useState<MySubmission[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchMySubmissions()
      .then((r) => active && setItems(r))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [fetchMySubmissions]);

  // A notification deep-link should always reveal its item, so reset the filter.
  useEffect(() => {
    if (initialId) setFilter("all");
  }, [initialId]);

  // Scroll the deep-linked item into view once the list has loaded.
  useEffect(() => {
    if (items && initialId && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [items, initialId, filter]);

  const counts = useMemo(() => {
    const c = { all: items?.length ?? 0, pending: 0, approved: 0, rejected: 0 };
    for (const s of items ?? []) c[s.status] += 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    let list = items ?? [];
    if (filter !== "all") list = list.filter((s) => s.status === filter);
    return [...list].sort((a, b) => (newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  }, [items, filter, newestFirst]);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <ListChecks size={18} className="text-accent" /> My contributions
        </h2>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-subtle">
          Edits and new games you&apos;ve suggested for the shared catalog. A moderator reviews each
          one; approved changes go live for everyone and earn you coins.
        </p>

        {loadError && <p className="text-sm text-danger">Couldn&apos;t load your contributions.</p>}
        {!items && !loadError && <p className="text-sm text-muted">Loading…</p>}
        {items && items.length === 0 && (
          <p className="text-sm text-muted">
            You haven&apos;t suggested anything yet. Use “Suggest edit” on a game, or suggest a
            missing one when you add a game.
          </p>
        )}

        {items && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition " +
                      (active ? "bg-panel text-ink" : "text-muted hover:text-ink")
                    }
                  >
                    {f.label}
                    <span className={"text-xs " + (active ? "text-accent" : "text-subtle")}>
                      {counts[f.id]}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setNewestFirst((v) => !v)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:text-ink"
              title="Toggle sort order"
            >
              <ArrowDownUp size={13} /> {newestFirst ? "Newest first" : "Oldest first"}
            </button>
          </div>
        )}

        {items && items.length > 0 && visible.length === 0 && (
          <p className="text-sm text-muted">No contributions match this filter.</p>
        )}

        {visible.map((s) => {
          const meta = STATUS_META[s.status];
          const KindIcon = s.kind === "new" ? Sparkles : Pencil;
          const isNew = s.kind === "new";
          const changes = diffCatalog(s.before ?? emptyCatalogFields(), s.proposed);
          const highlighted = s.id === initialId;

          // Which suggested fields actually went live (null until approved).
          const approvedSet = s.approvedFields ? new Set(s.approvedFields) : null;
          const approvedCount = approvedSet
            ? changes.filter((c) => approvedSet.has(c.key)).length
            : 0;
          const isPartly =
            s.status === "approved" && approvedSet != null && changes.length > 0 && approvedCount < changes.length;
          const ChipIcon = isPartly ? Check : meta.icon;
          const chipCls = isPartly ? "bg-brand/15 text-accent" : meta.chip;
          const chipLabel = isPartly ? "Partly approved" : meta.label;
          return (
            <div
              key={s.id}
              ref={highlighted ? targetRef : undefined}
              className={
                "rounded-xl border bg-panel/40 p-3 transition " +
                (highlighted ? "border-brand ring-2 ring-brand/40" : "border-line")
              }
            >
              <div className="flex items-center gap-3">
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
                  {s.image ? (
                    <img src={s.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-base opacity-50">🎮</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <KindIcon size={12} className="shrink-0 text-accent" />
                    <span className="min-w-0 truncate font-medium text-ink">{s.title || "(untitled)"}</span>
                  </div>
                  <div className="text-[11px] text-subtle">
                    {s.kind === "new" ? "New game" : "Edit"} · submitted {fmtDate(s.createdAt)}
                  </div>
                </div>
                <span
                  className={
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                    chipCls
                  }
                >
                  <ChipIcon size={10} /> {chipLabel}
                </span>
              </div>

              <StatusTrack status={s.status} />

              {s.status === "approved" && s.reward != null && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-success">
                  Earned +<CoinIcon size={12} /> {s.reward} coins
                </p>
              )}

              {changes.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-xs">
                  {changes.map((c) => {
                    // Once decided, mark each field: applied (went live) vs declined.
                    const applied = s.status === "approved" && (approvedSet?.has(c.key) ?? true);
                    const declined = s.status !== "pending" && !applied;
                    return (
                      <li key={c.key} className="text-muted break-words">
                        <span className="text-ink">{c.label}:</span>{" "}
                        {!isNew && <span className="text-subtle line-through">{c.before}</span>}
                        {!isNew && " → "}
                        <span
                          className={
                            applied ? "text-success" : declined ? "text-subtle line-through" : "text-accent"
                          }
                        >
                          {c.after}
                        </span>
                        {applied && <Check size={11} className="ml-1 inline text-success" />}
                        {declined && (
                          <span className="ml-1 text-[10px] text-subtle">(not approved)</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {s.reviewNote && (
                <p className="mt-2 rounded-lg bg-panel px-2 py-1.5 text-[11px] text-muted">
                  <span className="text-ink">Moderator note:</span> {s.reviewNote}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
