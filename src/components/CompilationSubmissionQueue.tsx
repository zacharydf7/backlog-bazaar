import { useState } from "react";
import { Check, X, Sparkles, Pencil, Clock, ShieldCheck, Plus, Minus } from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { CoinIcon } from "./CoinIcon";
import {
  diffTemplate,
  templateLabel,
  type CompilationTemplateSubmission,
  type TemplateGame,
} from "../lib/compilationTemplates";
import { formatPlaytime } from "../lib/playtime";
import { SubmissionTypeChip, DeletedChip, SubmissionDeleteControl } from "./SubmissionQueue";
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

const STATUS_CHIP: Record<SubmissionStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-line text-subtle" },
  approved: { label: "Approved", cls: "bg-success/15 text-success" },
  rejected: { label: "Not approved", cls: "bg-danger/15 text-danger" },
};

/** A row of small game cover thumbnails — lets a moderator tell otherwise-identical
 *  compilations apart (e.g. one submitted with art, one without). */
export function TemplateGameThumbs({ games }: { games: TemplateGame[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {games.map((g, i) => (
        <div
          key={i}
          title={gameLine(g.name, g.hours)}
          className="h-12 w-9 shrink-0 overflow-hidden rounded border border-line bg-panel"
        >
          {g.image ? (
            <img src={g.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm opacity-50">🎮</div>
          )}
        </div>
      ))}
    </div>
  );
}

/** One community compilation submission in the admin queue. Approving publishes the
 *  shared template; an approved one can be deleted (e.g. to clear a duplicate). */
export function CompilationSubmissionCard({
  submission,
  onResolved,
}: {
  submission: CompilationTemplateSubmission;
  onResolved: () => Promise<void>;
}) {
  const {
    approveCompilationSubmission,
    rejectCompilationSubmission,
    deleteCompilationSubmission,
    submissionReward,
  } = useStore();
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  const isDeleted = submission.deletedAt != null;
  const isPending = submission.status === "pending" && !isDeleted;
  const isNew = submission.kind === "new";
  const chip = STATUS_CHIP[submission.status];

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
  async function del() {
    const ok = await deleteCompilationSubmission(submission.id);
    if (ok) await onResolved();
  }

  return (
    <div className="rounded-xl border border-line bg-panel/40 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <SubmissionTypeChip kind="compilation" />
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
            (isNew ? "bg-success/15 text-success" : "bg-brand/15 text-accent")
          }
        >
          {isNew ? <Sparkles size={10} /> : <Pencil size={10} />} {isNew ? "New" : "Edit"}
        </span>
        <span className="min-w-0 truncate font-medium text-ink">{submission.title || "(untitled)"}</span>
        {!isPending && !isDeleted && (
          <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " + chip.cls}>
            {chip.label}
          </span>
        )}
        {isDeleted && <DeletedChip />}
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-subtle">
          <Avatar url={null} name={submission.submitterName} size={18} /> {submission.submitterName}
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {fmtDate(submission.createdAt)}
          </span>
        </span>
      </div>

      {templateLabel(submission) && (
        <div className="mb-1 text-[11px] text-accent">{templateLabel(submission)}</div>
      )}
      <div className="text-xs">
        <span className="text-subtle">
          {submission.games.length} game{submission.games.length === 1 ? "" : "s"}:
        </span>{" "}
        <span className="text-muted">{submission.games.map((g) => gameLine(g.name, g.hours)).join(" · ")}</span>
      </div>
      <TemplateGameThumbs games={submission.games} />

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
          {/* Deleting also removes the shared template it would/did publish. */}
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
            {/* Delete the submission + its published shared template (clears a
                duplicate from the autocomplete). History survives. */}
            {!isDeleted && (
              <span className="ml-auto">
                <SubmissionDeleteControl onDelete={del} />
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
