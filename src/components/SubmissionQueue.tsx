import { useEffect, useState } from "react";
import { Inbox, Check, X, Sparkles, Pencil, Clock } from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { diffCatalog, emptyCatalogFields } from "../lib/submissions";
import type { GameSubmission } from "../types";

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

/** The admin moderation queue for community catalog contributions. Each card
 *  highlights exactly what the submitter changed against the live record. */
export function SubmissionQueue() {
  const { fetchGameSubmissions, submissionReward } = useStore();
  const [items, setItems] = useState<GameSubmission[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    setItems(null);
    setLoadError(false);
    try {
      setItems(await fetchGameSubmissions());
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Inbox size={18} className="text-accent" /> Submissions
        </h2>
        {items && items.length > 0 && (
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-accent">
            {items.length} pending
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-subtle">
          Approving commits the change to the master record, updates every player&apos;s copy, and
          awards the submitter {submissionReward} coins.
        </p>

        {loadError && <p className="text-sm text-danger">Couldn&apos;t load submissions.</p>}
        {!items && !loadError && <p className="text-sm text-muted">Loading…</p>}
        {items && items.length === 0 && (
          <p className="text-sm text-muted">Nothing waiting for review. 🎉</p>
        )}

        {items?.map((s) => (
          <SubmissionCard key={s.id} submission={s} onResolved={load} />
        ))}
      </div>
    </div>
  );
}

function SubmissionCard({
  submission,
  onResolved,
}: {
  submission: GameSubmission;
  onResolved: () => Promise<void>;
}) {
  const { approveSubmission, rejectSubmission } = useStore();
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  const baseline = submission.current ?? submission.before ?? emptyCatalogFields();
  const changes = diffCatalog(baseline, submission.proposed);
  const isNew = submission.kind === "new";

  async function act(approve: boolean) {
    setWorking(true);
    const ok = approve
      ? await approveSubmission(submission.id, note)
      : await rejectSubmission(submission.id, note);
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
          {isNew ? <Sparkles size={10} /> : <Pencil size={10} />} {isNew ? "New game" : "Edit"}
        </span>
        <span className="min-w-0 truncate font-medium text-ink">
          {submission.proposed.title || "(untitled)"}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-subtle">
          <Avatar url={null} name={submission.submitterName} size={18} /> {submission.submitterName}
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {fmtDate(submission.createdAt)}
          </span>
        </span>
      </div>

      <div className="flex gap-3">
        <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-panel">
          {submission.proposed.image ? (
            <img src={submission.proposed.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xl opacity-50">🎮</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {changes.length === 0 ? (
            <p className="text-xs text-subtle">No field differences from the current record.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {changes.map((c) => (
                <li key={c.key} className="text-muted">
                  <span className="text-ink">{c.label}:</span>{" "}
                  {!isNew && <span className="text-subtle line-through">{c.before}</span>}
                  {!isNew && " → "}
                  <span className="text-accent break-words">{c.after}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note to the submitter"
        className="mt-3 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
      />

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => act(true)}
          disabled={working}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
        >
          <Check size={15} /> Approve
        </button>
        <button
          onClick={() => act(false)}
          disabled={working}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50"
        >
          <X size={15} /> Reject
        </button>
      </div>
    </div>
  );
}
