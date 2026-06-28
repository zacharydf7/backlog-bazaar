import { useEffect, useMemo, useState } from "react";
import { Flag, Loader2, ImageOff, ShieldX, Check, Ban, AlertTriangle } from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { timeAgo } from "../lib/time";
import { reportReasonLabel } from "../lib/reports";
import { isLocalCover } from "../lib/covers";
import type { Report, ReportAction } from "../types";

type StatusFilter = "open" | "resolved" | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

/** The admin moderation queue for user/content reports. Newest first, filterable
 *  by status. Each report shows who reported whom and why, the flagged cover (for
 *  cover reports), and the enforcement actions: dismiss, strip the custom cover,
 *  or suspend the account. The reporter is shown to moderators but never exposed
 *  to the reported user. */
export function ReportsQueue() {
  const fetchReports = useStore((s) => s.fetchReports);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("open");

  async function load() {
    setReports(null);
    setLoadError(false);
    try {
      // Fetch all once; filter client-side so switching tabs is instant.
      const rows = await fetchReports("all");
      setReports(rows);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c = { open: 0, resolved: 0, all: reports?.length ?? 0 };
    for (const r of reports ?? []) {
      if (r.status === "open") c.open += 1;
      else c.resolved += 1;
    }
    return c;
  }, [reports]);

  const visible = useMemo(() => {
    const list = reports ?? [];
    if (filter === "open") return list.filter((r) => r.status === "open");
    if (filter === "resolved") return list.filter((r) => r.status !== "open");
    return list;
  }, [reports, filter]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <Flag size={18} className="text-accent" /> Reports
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition " +
                (filter === f.id
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-panel text-muted hover:text-ink")
              }
            >
              {f.label}
              <span className="ml-1 opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {reports === null ? (
        <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading reports…
        </div>
      ) : loadError ? (
        <div className="p-10 text-center text-sm text-danger">Couldn&apos;t load reports.</div>
      ) : visible.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">
          {filter === "open" ? "No open reports — all clear." : "Nothing here."}
        </div>
      ) : (
        <div className="divide-y divide-line">
          {visible.map((r) => (
            <ReportCard key={r.id} report={r} onResolved={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report, onResolved }: { report: Report; onResolved: () => void }) {
  const resolveReport = useStore((s) => s.resolveReport);
  const can = useStore((s) => s.can);
  const [pending, setPending] = useState<ReportAction | null>(null);
  const [confirm, setConfirm] = useState<Exclude<ReportAction, "dismiss"> | null>(null);
  const [note, setNote] = useState("");

  const isCover = report.kind === "cover";
  const coverStillUp = isCover && isLocalCover(report.liveImage);
  const canSuspend = can("users.block");
  const resolved = report.status !== "open";

  async function act(action: ReportAction) {
    setPending(action);
    const ok = await resolveReport(report, action, note.trim() || undefined);
    setPending(null);
    setConfirm(null);
    if (ok) onResolved();
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
            (isCover ? "bg-brand/15 text-accent" : "bg-line text-muted")
          }
        >
          {isCover ? <ImageOff size={11} /> : <Flag size={11} />}
          {isCover ? "Cover" : "User"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
          {reportReasonLabel(report.reason)}
        </span>
        {resolved && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-subtle">
            {report.resolution ?? report.status}
          </span>
        )}
        <span className="ml-auto text-[11px] text-subtle">{timeAgo(report.createdAt)}</span>
      </div>

      <div className="flex items-start gap-3">
        {isCover && (report.imageUrl || report.liveImage) && (
          <img
            src={report.imageUrl ?? report.liveImage ?? undefined}
            alt=""
            className="h-20 w-[3.75rem] shrink-0 rounded-lg border border-line object-cover"
          />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex items-center gap-2">
            <Avatar url={report.reportedAvatar} name={report.reportedName ?? "User"} size={28} />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">
                {report.reportedName ?? "Unknown user"}
                {report.reportedBlocked && (
                  <span className="ml-1.5 text-[11px] font-semibold text-danger">suspended</span>
                )}
              </div>
              {isCover && report.gameTitle && (
                <div className="truncate text-xs text-muted">{report.gameTitle}</div>
              )}
            </div>
          </div>
          {report.details && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-panel p-2 text-xs text-muted">
              {report.details}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-subtle">
            Reported by {report.reporterName ?? "a former member"}
            {report.reviewerName && report.status !== "open" && <> · resolved by {report.reviewerName}</>}
          </p>
        </div>
      </div>

      {!resolved &&
        (confirm ? (
          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <AlertTriangle size={13} className="text-danger" />
              {confirm === "strip"
                ? "Remove this custom cover and restore the default?"
                : `Suspend ${report.reportedName ?? "this account"}?`}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={
                confirm === "suspend"
                  ? "Reason shown to the user (optional)"
                  : "Note for the user (optional)"
              }
              className="mt-2 w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink outline-none placeholder:text-subtle focus:border-brand"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setConfirm(null);
                  setNote("");
                }}
                className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={() => void act(confirm)}
                disabled={pending != null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger/15 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/25 disabled:opacity-60"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {confirm === "strip" ? "Strip cover" : "Suspend"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void act("dismiss")}
              disabled={pending != null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface disabled:opacity-60"
            >
              {pending === "dismiss" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              Dismiss
            </button>
            {isCover && (
              <button
                onClick={() => setConfirm("strip")}
                disabled={pending != null || !coverStillUp}
                title={coverStillUp ? undefined : "This cover is no longer a custom upload."}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface disabled:opacity-50"
              >
                <ImageOff size={13} /> Strip cover
              </button>
            )}
            {canSuspend && !report.reportedBlocked && (
              <button
                onClick={() => setConfirm("suspend")}
                disabled={pending != null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/20 disabled:opacity-60"
              >
                <Ban size={13} /> Suspend
              </button>
            )}
            {!canSuspend && (
              <span className="inline-flex items-center gap-1 self-center text-[11px] text-subtle">
                <ShieldX size={12} /> Suspending needs the Block permission
              </span>
            )}
          </div>
        ))}
    </div>
  );
}
