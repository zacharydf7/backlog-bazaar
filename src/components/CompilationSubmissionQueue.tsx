import { useEffect, useMemo, useState } from "react";
import { Package, Check, X, Sparkles, Pencil, Clock, ArrowDownUp, ShieldCheck, Plus, Minus } from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { CoinIcon } from "./CoinIcon";
import { diffTemplate, type CompilationTemplateSubmission } from "../lib/compilationTemplates";
import { formatPlaytime } from "../lib/playtime";
import type { SubmissionStatus } from "../types";

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function gameLine(name: string, hours?: number): string {
  return hours ? `${name} · ${formatPlaytime(hours)}` : name;
}

type StatusFilter = SubmissionStatus | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

/** The admin moderation queue for community compilation templates. Mirrors the
 *  catalog SubmissionQueue: pending items to review plus the decided history.
 *  Approving writes the shared template and rewards the submitter. */
export function CompilationSubmissionQueue() {
  const { fetchCompilationSubmissions, refreshSubmissionCount, submissionReward } = useStore();
  const [items, setItems] = useState<CompilationTemplateSubmission[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [newestFirst, setNewestFirst] = useState(true);

  async function load() {
    setItems(null);
    setLoadError(false);
    try {
      setItems(await fetchCompilationSubmissions());
      void refreshSubmissionCount();
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, all: items?.length ?? 0 };
    for (const s of items ?? []) c[s.status] += 1;
    return c;
  }, [items]);

  const visible = useMemo(() => {
    let list = items ?? [];
    if (filter !== "all") list = list.filter((s) => s.status === filter);
    return [...list].sort((a, b) => (newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  }, [items, filter, newestFirst]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Package size={18} className="text-accent" /> Compilation Submissions
        </h2>
        {counts.pending > 0 && (
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-accent">
            {counts.pending} pending
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-subtle">
          Approving publishes the compilation as a shared template everyone can use, and awards the
          submitter {submissionReward} coins. Costs and platforms are never shared.
        </p>

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

        {loadError && <p className="text-sm text-danger">Couldn&apos;t load submissions.</p>}
        {!items && !loadError && <p className="text-sm text-muted">Loading…</p>}
        {items && visible.length === 0 && (
          <p className="text-sm text-muted">
            {filter === "pending" ? "Nothing waiting for review. 🎉" : "No submissions here."}
          </p>
        )}

        {visible.map((s) => (
          <CompilationSubmissionCard key={s.id} submission={s} onResolved={load} />
        ))}
      </div>
    </div>
  );
}

const STATUS_CHIP: Record<SubmissionStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-line text-subtle" },
  approved: { label: "Approved", cls: "bg-success/15 text-success" },
  rejected: { label: "Not approved", cls: "bg-danger/15 text-danger" },
};

function CompilationSubmissionCard({
  submission,
  onResolved,
}: {
  submission: CompilationTemplateSubmission;
  onResolved: () => Promise<void>;
}) {
  const { approveCompilationSubmission, rejectCompilationSubmission, submissionReward } = useStore();
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  const isPending = submission.status === "pending";
  const isNew = submission.kind === "new";
  const chip = STATUS_CHIP[submission.status];

  // For an edit, diff the live template (or the submit-time snapshot) against the
  // proposal so the admin sees exactly what would change.
  const baseline = submission.current ?? submission.before;
  const diff =
    !isNew && baseline
      ? diffTemplate(baseline, { title: submission.title, games: submission.games })
      : null;

  async function approve() {
    setWorking(true);
    const ok = await approveCompilationSubmission(submission.id, note);
    setWorking(false);
    if (ok) await onResolved();
  }
  async function reject() {
    setWorking(true);
    const ok = await rejectCompilationSubmission(submission.id, note);
    setWorking(false);
    if (ok) await onResolved();
  }

  return (
    <div className="rounded-xl border border-line bg-panel/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
            (isNew ? "bg-success/15 text-success" : "bg-brand/15 text-accent")
          }
        >
          {isNew ? <Sparkles size={10} /> : <Pencil size={10} />} {isNew ? "New compilation" : "Edit"}
        </span>
        <span className="min-w-0 truncate font-medium text-ink">{submission.title || "(untitled)"}</span>
        {!isPending && (
          <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " + chip.cls}>
            {chip.label}
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-subtle">
          <Avatar url={null} name={submission.submitterName} size={18} /> {submission.submitterName}
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {fmtDate(submission.createdAt)}
          </span>
        </span>
      </div>

      {/* Proposed games (always) + an edit diff when there's a baseline. */}
      <div className="text-xs">
        <span className="text-subtle">
          {submission.games.length} game{submission.games.length === 1 ? "" : "s"}:
        </span>{" "}
        <span className="text-muted">{submission.games.map((g) => gameLine(g.name, g.hours)).join(" · ")}</span>
      </div>

      {diff && (diff.titleChanged || diff.added.length || diff.removed.length || diff.changed.length) ? (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs">
          {diff.titleChanged && (
            <li className="text-muted">
              <span className="text-ink">Title:</span>{" "}
              <span className="text-subtle line-through">{diff.titleChanged.before}</span> →{" "}
              <span className="text-accent">{diff.titleChanged.after}</span>
            </li>
          )}
          {diff.added.map((g) => (
            <li key={"a" + g.name} className="inline-flex items-center gap-1 text-success">
              <Plus size={11} /> {gameLine(g.name, g.hours)}
            </li>
          ))}
          {diff.removed.map((g) => (
            <li key={"r" + g.name} className="inline-flex items-center gap-1 text-danger">
              <Minus size={11} /> {gameLine(g.name, g.hours)}
            </li>
          ))}
          {diff.changed.map((c) => (
            <li key={"c" + c.name} className="text-muted">
              <span className="text-ink">{c.name}</span>: length{" "}
              {c.beforeHours ? formatPlaytime(c.beforeHours) : "—"} →{" "}
              <span className="text-accent">{c.afterHours ? formatPlaytime(c.afterHours) : "—"}</span>
            </li>
          ))}
        </ul>
      ) : !isNew && baseline ? (
        <p className="mt-1 text-[11px] text-subtle">No changes from the current template.</p>
      ) : null}

      {isPending ? (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note to the submitter"
            className="mt-3 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={approve}
              disabled={working}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
            >
              <Check size={15} /> Approve · {submissionReward} coins
            </button>
            <button
              onClick={reject}
              disabled={working}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              <X size={15} /> Reject
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 border-t border-line pt-2 text-[11px] text-subtle">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={12} className="text-accent" />
              {submission.reviewerName ? `Reviewed by ${submission.reviewerName}` : "Reviewed"}
              {submission.reviewedAt ? ` · ${fmtDate(submission.reviewedAt)}` : ""}
            </span>
            {submission.status === "approved" && submission.reward != null && (
              <span className="inline-flex items-center gap-1 text-success">
                Paid +<CoinIcon size={11} /> {submission.reward}
              </span>
            )}
          </div>
          {submission.reviewNote && (
            <p className="mt-1.5 rounded-lg bg-panel px-2 py-1.5 text-muted">
              <span className="text-ink">Note:</span> {submission.reviewNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
