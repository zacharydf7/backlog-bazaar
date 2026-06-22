import { useEffect, useState } from "react";
import { ListChecks, Sparkles, Pencil, Clock, Check, X, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import { diffCatalog, emptyCatalogFields } from "../lib/submissions";
import type { MySubmission, SubmissionStatus } from "../types";

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

/** The current user's own catalog contributions and where each stands in review. */
export function MySubmissions() {
  const { fetchMySubmissions } = useStore();
  const [items, setItems] = useState<MySubmission[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchMySubmissions()
      .then((r) => active && setItems(r))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [fetchMySubmissions]);

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

        {items?.map((s) => {
          const meta = STATUS_META[s.status];
          const StatusIcon = meta.icon;
          const KindIcon = s.kind === "new" ? Sparkles : Pencil;
          const isNew = s.kind === "new";
          const changes = diffCatalog(s.before ?? emptyCatalogFields(), s.proposed);
          return (
            <div key={s.id} className="rounded-xl border border-line bg-panel/40 p-3">
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
                    meta.chip
                  }
                >
                  <StatusIcon size={10} /> {meta.label}
                </span>
              </div>

              <StatusTrack status={s.status} />

              {changes.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2 text-xs">
                  {changes.map((c) => (
                    <li key={c.key} className="text-muted break-words">
                      <span className="text-ink">{c.label}:</span>{" "}
                      {!isNew && <span className="text-subtle line-through">{c.before}</span>}
                      {!isNew && " → "}
                      <span className="text-accent">{c.after}</span>
                    </li>
                  ))}
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
