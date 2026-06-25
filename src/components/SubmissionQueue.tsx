import { useEffect, useMemo, useState } from "react";
import { Inbox, Check, X, Sparkles, Pencil, Clock, ArrowDownUp, ShieldCheck, Package, Gamepad2, Trash2, Undo2 } from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { CoinIcon } from "./CoinIcon";
import { diffCatalog, emptyCatalogFields, canRevertSubmission } from "../lib/submissions";
import type { GameSubmission, SubmissionStatus } from "../types";
import type { CompilationTemplateSubmission } from "../lib/compilationTemplates";
import { CompilationSubmissionCard } from "./CompilationSubmissionQueue";

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

type StatusFilter = SubmissionStatus | "deleted" | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "deleted", label: "Deleted" },
  { id: "all", label: "All" },
];

/** A small danger chip marking a soft-deleted submission. */
export function DeletedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-danger">
      <Trash2 size={10} /> Deleted
    </span>
  );
}

/** A two-step delete control (admin), shared by the game + compilation cards. */
export function SubmissionDeleteControl({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  async function run() {
    setWorking(true);
    await onDelete();
    setWorking(false);
    setConfirm(false);
  }
  return confirm ? (
    <span className="inline-flex items-center gap-2 text-[11px]">
      <span className="text-muted">Delete this submission?</span>
      <button
        onClick={run}
        disabled={working}
        className="rounded-md bg-danger/15 px-2 py-1 font-semibold text-danger transition hover:bg-danger/25 disabled:opacity-50"
      >
        Delete
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="rounded-md bg-panel px-2 py-1 text-ink transition hover:brightness-95"
      >
        Cancel
      </button>
    </span>
  ) : (
    <button
      onClick={() => setConfirm(true)}
      className="inline-flex items-center gap-1 text-[11px] text-muted transition hover:text-danger"
    >
      <Trash2 size={12} /> Delete
    </button>
  );
}

/** A small chip marking an approved edit whose catalog change was rolled back. */
export function RevertedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-line px-2 py-0.5 text-[10px] font-semibold text-subtle">
      <Undo2 size={10} /> Reverted
    </span>
  );
}

/** A two-step "Undo edit" control (admin) for an approved catalog edit: restores
 *  the pre-approval values for the fields it committed. Distinct from Delete,
 *  which only removes the submission from the review log. */
export function SubmissionRevertControl({ onRevert }: { onRevert: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  async function run() {
    setWorking(true);
    await onRevert();
    setWorking(false);
    setConfirm(false);
  }
  return confirm ? (
    <span className="inline-flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-muted">Restore the previous catalog values? The submitter keeps their reward.</span>
      <button
        onClick={run}
        disabled={working}
        className="rounded-md bg-brand/15 px-2 py-1 font-semibold text-accent transition hover:bg-brand/25 disabled:opacity-50"
      >
        Undo edit
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="rounded-md bg-panel px-2 py-1 text-ink transition hover:brightness-95"
      >
        Cancel
      </button>
    </span>
  ) : (
    <button
      onClick={() => setConfirm(true)}
      className="inline-flex items-center gap-1 text-[11px] text-muted transition hover:text-accent"
    >
      <Undo2 size={12} /> Undo edit
    </button>
  );
}

/** A small "Game" / "Compilation" type chip so the mixed queue reads clearly. */
export function SubmissionTypeChip({ kind }: { kind: "game" | "compilation" }) {
  const isComp = kind === "compilation";
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
        (isComp ? "bg-accent/10 text-accent" : "bg-panel text-muted")
      }
    >
      {isComp ? <Package size={9} /> : <Gamepad2 size={9} />} {isComp ? "Compilation" : "Game"}
    </span>
  );
}

// One row in the unified moderation queue — a game catalog submission or a
// compilation template submission, normalized so both sort/filter together.
type Item =
  | { kind: "game"; id: string; status: SubmissionStatus; createdAt: number; deletedAt: number | null; data: GameSubmission }
  | { kind: "compilation"; id: string; status: SubmissionStatus; createdAt: number; deletedAt: number | null; data: CompilationTemplateSubmission };

/** The admin moderation queue — game catalog edits/new games AND community
 *  compilations in one newest-first, status-filterable list. Each row is tagged
 *  with its type; approving commits the change and rewards the submitter. */
export function SubmissionQueue() {
  const {
    fetchGameSubmissions,
    fetchCompilationSubmissions,
    refreshSubmissionCount,
    submissionReward,
  } = useStore();
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [newestFirst, setNewestFirst] = useState(true);

  async function load() {
    setItems(null);
    setLoadError(false);
    try {
      const [gameSubs, compSubs] = await Promise.all([
        fetchGameSubmissions(),
        fetchCompilationSubmissions(),
      ]);
      setItems([
        ...gameSubs.map((g) => ({
          kind: "game" as const,
          id: g.id,
          status: g.status,
          createdAt: g.createdAt,
          deletedAt: g.deletedAt,
          data: g,
        })),
        ...compSubs.map((c) => ({
          kind: "compilation" as const,
          id: c.id,
          status: c.status,
          createdAt: c.createdAt,
          deletedAt: c.deletedAt,
          data: c,
        })),
      ]);
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
    const c = { pending: 0, approved: 0, rejected: 0, deleted: 0, all: items?.length ?? 0 };
    for (const s of items ?? []) {
      if (s.deletedAt) c.deleted += 1;
      else c[s.status] += 1;
    }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    let list = items ?? [];
    if (filter === "deleted") list = list.filter((s) => s.deletedAt != null);
    else if (filter !== "all") list = list.filter((s) => s.deletedAt == null && s.status === filter);
    return [...list].sort((a, b) => (newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  }, [items, filter, newestFirst]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Inbox size={18} className="text-accent" /> Submissions
        </h2>
        {counts.pending > 0 && (
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-accent">
            {counts.pending} pending
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-subtle">
          Game catalog edits and community compilations, newest first. Approving commits the change
          and awards the submitter up to {submissionReward} coins.
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
                  <span className={"text-xs " + (active ? "text-accent" : "text-subtle")}>{counts[f.id]}</span>
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

        {visible.map((it) =>
          it.kind === "game" ? (
            <SubmissionCard key={it.id} submission={it.data} onResolved={load} />
          ) : (
            <CompilationSubmissionCard key={it.id} submission={it.data} onResolved={load} />
          ),
        )}
      </div>
    </div>
  );
}

const STATUS_CHIP: Record<SubmissionStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-line text-subtle" },
  approved: { label: "Approved", cls: "bg-success/15 text-success" },
  rejected: { label: "Not approved", cls: "bg-danger/15 text-danger" },
};

/** One game catalog submission, with per-field partial approval. */
export function SubmissionCard({
  submission,
  onResolved,
}: {
  submission: GameSubmission;
  onResolved: () => Promise<void>;
}) {
  const { approveSubmission, rejectSubmission, deleteSubmission, revertSubmission, submissionReward } = useStore();
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  const isDeleted = submission.deletedAt != null;
  const isPending = submission.status === "pending" && !isDeleted;
  const isNew = submission.kind === "new";
  const isReverted = submission.revertedAt != null;
  const canRevert = canRevertSubmission(submission);

  async function del() {
    const ok = await deleteSubmission(submission.id);
    if (ok) await onResolved();
  }

  async function rev() {
    const ok = await revertSubmission(submission.id);
    if (ok) await onResolved();
  }

  const baseline = submission.before ?? submission.current ?? emptyCatalogFields();
  const changes = diffCatalog(baseline, submission.proposed);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(changes.map((c) => c.key)));
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allSelected = changes.length === 0 || selected.size === changes.length;
  const noneSelected = changes.length > 0 && selected.size === 0;
  const isPartial = !allSelected && selected.size > 0;
  const reward = isPartial ? Math.max(1, Math.floor(submissionReward / 2)) : submissionReward;

  const approvedSet = submission.approvedFields ? new Set(submission.approvedFields) : null;
  const approvedCount = approvedSet ? changes.filter((c) => approvedSet.has(c.key)).length : 0;
  const isPartly =
    submission.status === "approved" && approvedSet != null && changes.length > 0 && approvedCount < changes.length;
  const chip = STATUS_CHIP[submission.status];
  const chipLabel = isPartly ? "Partly approved" : chip.label;

  async function approve() {
    setWorking(true);
    const fields = allSelected ? null : Array.from(selected);
    const ok = await approveSubmission(submission.id, note, fields);
    setWorking(false);
    if (ok) await onResolved();
  }

  async function reject() {
    setWorking(true);
    const ok = await rejectSubmission(submission.id, note);
    setWorking(false);
    if (ok) await onResolved();
  }

  return (
    <div className="rounded-xl border border-line bg-panel/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SubmissionTypeChip kind="game" />
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
            (isNew ? "bg-success/15 text-success" : "bg-brand/15 text-accent")
          }
        >
          {isNew ? <Sparkles size={10} /> : <Pencil size={10} />} {isNew ? "New game" : "Edit"}
        </span>
        <span className="min-w-0 truncate font-medium text-ink">{submission.proposed.title || "(untitled)"}</span>
        {!isPending && !isDeleted && (
          <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " + chip.cls}>
            {chipLabel}
          </span>
        )}
        {isDeleted && <DeletedChip />}
        {isReverted && !isDeleted && <RevertedChip />}
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
          ) : isPending ? (
            <>
              <ul className="flex flex-col gap-1 text-xs">
                {changes.map((c) => (
                  <li key={c.key}>
                    <label className="flex cursor-pointer items-start gap-2 text-muted">
                      <input
                        type="checkbox"
                        checked={selected.has(c.key)}
                        onChange={() => toggle(c.key)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
                      />
                      <span className="min-w-0">
                        <span className="text-ink">{c.label}:</span>{" "}
                        {!isNew && <span className="text-subtle line-through">{c.before}</span>}
                        {!isNew && " → "}
                        <span className="text-accent break-words">{c.after}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {changes.length > 1 && (
                <p className="mt-1.5 text-[11px] text-subtle">
                  Uncheck a field to approve only some changes — a partial approval pays a smaller
                  reward.
                </p>
              )}
            </>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {changes.map((c) => {
                const applied = submission.status === "approved" && (approvedSet?.has(c.key) ?? true);
                const declined = !applied;
                return (
                  <li key={c.key} className="text-muted break-words">
                    <span className="text-ink">{c.label}:</span>{" "}
                    {!isNew && <span className="text-subtle line-through">{c.before}</span>}
                    {!isNew && " → "}
                    <span className={applied ? "text-success" : "text-subtle line-through"}>{c.after}</span>
                    {applied && <Check size={11} className="ml-1 inline text-success" />}
                    {declined && <span className="ml-1 text-[10px] text-subtle">(not approved)</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

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
              disabled={working || noneSelected}
              title={noneSelected ? "Select at least one field" : undefined}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
            >
              <Check size={15} /> {isPartial ? "Approve selected" : "Approve"} · {reward} coins
            </button>
            <button
              onClick={reject}
              disabled={working}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              <X size={15} /> Reject
            </button>
          </div>
          <div className="mt-2">
            <SubmissionDeleteControl onDelete={del} />
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
            {!isDeleted && (
              <span className="ml-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                {canRevert && <SubmissionRevertControl onRevert={rev} />}
                <SubmissionDeleteControl onDelete={del} />
              </span>
            )}
          </div>
          {isReverted && (
            <p className="mt-1.5 inline-flex flex-wrap items-center gap-1 text-[11px] text-subtle">
              <Undo2 size={11} className="text-subtle" />
              {submission.revertedByName ? `Reverted by ${submission.revertedByName}` : "Reverted"}
              {submission.revertedAt ? ` · ${fmtDate(submission.revertedAt)}` : ""}
              {submission.revertedFields?.length
                ? ` · restored ${submission.revertedFields.length} field${submission.revertedFields.length === 1 ? "" : "s"}`
                : ""}
            </p>
          )}
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
