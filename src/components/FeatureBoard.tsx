import { useEffect, useRef, useState } from "react";
import {
  Lightbulb,
  X,
  ChevronUp,
  Trash2,
  MoreVertical,
  Inbox,
  CalendarClock,
  Hammer,
  CheckCircle2,
  XCircle,
  List,
  Columns3,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import type { FeatureRequest, FeatureStatus } from "../types";

const STATUS_META: Record<FeatureStatus, { label: string; icon: LucideIcon; badge: string }> = {
  submitted: { label: "Submitted", icon: Inbox, badge: "bg-panel text-muted" },
  planned: { label: "Planned", icon: CalendarClock, badge: "bg-accent/15 text-accent" },
  in_progress: { label: "In Progress", icon: Hammer, badge: "bg-brand/20 text-accent" },
  done: { label: "Done", icon: CheckCircle2, badge: "bg-success/15 text-success" },
  declined: { label: "Declined", icon: XCircle, badge: "bg-line text-subtle" },
};

// Column order on the admin board.
const BOARD_ORDER: FeatureStatus[] = ["submitted", "planned", "in_progress", "done", "declined"];

function StatusBadge({ status }: { status: FeatureStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        meta.badge
      }
    >
      <Icon size={11} /> {meta.label}
    </span>
  );
}

function requester(r: FeatureRequest): string {
  if (r.isAdminItem) return "Roadmap";
  return r.requesterName ? `by ${r.requesterName}` : "by someone";
}

export function FeatureBoard({ onClose }: { onClose: () => void }) {
  const {
    isAdmin,
    fetchFeatureRequests,
    submitFeatureRequest,
    voteFeatureRequest,
    setRequestStatus,
    deleteFeatureRequest,
    userId,
  } = useStore();

  const [requests, setRequests] = useState<FeatureRequest[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useScrollLock(true);

  const refresh = () => {
    fetchFeatureRequests()
      .then(setRequests)
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    let active = true;
    fetchFeatureRequests()
      .then((r) => active && setRequests(r))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [fetchFeatureRequests]);

  function patch(id: string, fn: (r: FeatureRequest) => FeatureRequest) {
    setRequests((rs) => rs?.map((r) => (r.id === id ? fn(r) : r)) ?? null);
  }

  async function onSubmit() {
    const t = title.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    const ok = await submitFeatureRequest(t, desc);
    setSubmitting(false);
    if (ok) {
      setTitle("");
      setDesc("");
      refresh();
    }
  }

  function onVote(r: FeatureRequest) {
    const on = !r.votedByMe;
    patch(r.id, (x) => ({ ...x, votedByMe: on, voteCount: x.voteCount + (on ? 1 : -1) }));
    voteFeatureRequest(r.id, on).then((ok) => {
      if (!ok) refresh();
    });
  }

  function onMove(r: FeatureRequest, status: FeatureStatus) {
    patch(r.id, (x) => ({ ...x, status }));
    setRequestStatus(r.id, status).then((ok) => {
      if (!ok) refresh();
    });
  }

  function onDelete(r: FeatureRequest) {
    setRequests((rs) => rs?.filter((x) => x.id !== r.id) ?? null);
    deleteFeatureRequest(r.id).then((ok) => {
      if (!ok) refresh();
    });
  }

  const wide = isAdmin && view === "board";
  // The votable list hides finished/declined requests — those live only on the
  // admin board. (The board still shows every column.)
  const votable = requests?.filter((r) => r.status !== "done" && r.status !== "declined") ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className={
          "w-full rounded-2xl border border-line bg-surface shadow-2xl " +
          (wide ? "flex h-[92vh] max-w-[1600px] flex-col" : "max-w-lg")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Lightbulb size={18} className="text-accent" /> Feature requests
          </h2>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="flex rounded-lg border border-line bg-panel p-0.5">
                <ViewTab active={view === "list"} onClick={() => setView("list")} icon={List}>
                  List
                </ViewTab>
                <ViewTab active={view === "board"} onClick={() => setView("board")} icon={Columns3}>
                  Board
                </ViewTab>
              </div>
            )}
            <button onClick={onClose} className="text-muted transition hover:text-ink">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={wide ? "flex min-h-0 flex-1 flex-col p-4" : "p-4"}>
          {/* Submit form */}
          <div className="mb-4 rounded-xl border border-line bg-panel/50 p-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isAdmin ? "Add a roadmap item…" : "Suggest a feature…"}
              maxLength={120}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Add detail (optional)"
              rows={2}
              maxLength={1000}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={onSubmit}
                disabled={!title.trim() || submitting}
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : isAdmin ? "Add" : "Submit"}
              </button>
            </div>
          </div>

          {loadError && <p className="text-sm text-danger">Couldn&apos;t load requests.</p>}
          {!requests && !loadError && <p className="text-sm text-muted">Loading…</p>}

          {requests &&
            (wide ? (
              requests.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  No requests yet — be the first to suggest something.
                </p>
              ) : (
                <div className="min-h-0 flex-1">
                  <Board
                    requests={requests}
                    isAdmin={isAdmin}
                    userId={userId}
                    onVote={onVote}
                    onMove={onMove}
                    onDelete={onDelete}
                  />
                </div>
              )
            ) : votable && votable.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No open requests right now — suggest something above.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {votable?.map((r) => (
                  <RequestRow
                    key={r.id}
                    r={r}
                    isAdmin={isAdmin}
                    canDelete={isAdmin || r.userId === userId}
                    onVote={() => onVote(r)}
                    onMove={(s) => onMove(r, s)}
                    onDelete={() => onDelete(r)}
                  />
                ))}
              </div>
            ))}

          <p className="mt-3 shrink-0 text-center text-[11px] text-subtle">
            Upvote what you want next. We work through these from most-wanted down.
          </p>
        </div>
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition " +
        (active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")
      }
    >
      <Icon size={13} /> {children}
    </button>
  );
}

function VoteButton({ r, onVote }: { r: FeatureRequest; onVote: () => void }) {
  return (
    <button
      onClick={onVote}
      title={r.votedByMe ? "Remove your vote" : "Upvote"}
      className={
        "flex flex-col items-center justify-center rounded-lg border px-2.5 py-1 transition " +
        (r.votedByMe
          ? "border-brand/50 bg-brand/15 text-accent"
          : "border-line text-muted hover:border-brand/50 hover:text-accent")
      }
    >
      <ChevronUp size={16} />
      <span className="text-xs font-semibold">{r.voteCount}</span>
    </button>
  );
}

// A status-change ⋮ menu, reused on list rows and board cards. Touch-friendly:
// the button stays visible; opacity only hides-until-hover on real pointers.
function CardMenu({
  status,
  canDelete,
  isAdmin,
  onMove,
  onDelete,
}: {
  status: FeatureStatus;
  canDelete: boolean;
  isAdmin: boolean;
  onMove: (s: FeatureStatus) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // The menu is `position: fixed` so it escapes the board's horizontal-scroll
  // container (which clips overflow) and is never cut off, wherever the card sits.
  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    function place() {
      const b = btn?.getBoundingClientRect();
      if (!b) return;
      const width = 176; // w-44
      const left = Math.max(8, Math.min(b.right - width, window.innerWidth - width - 8));
      const openUp = b.bottom > window.innerHeight - 240;
      setPos(
        openUp
          ? { left, bottom: window.innerHeight - b.top + 4 }
          : { left, top: b.bottom + 4 },
      );
    }
    place();
    const close = () => setOpen(false);
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btn?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  if (!isAdmin && !canDelete) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        title="More options"
        aria-label="More options"
        className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-panel hover:text-ink"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom }}
          className="z-[60] w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 text-left shadow-2xl"
        >
          {isAdmin &&
            BOARD_ORDER.filter((s) => s !== status).map((s) => {
              const meta = STATUS_META[s];
              const Icon = meta.icon;
              return (
                <button
                  key={s}
                  onClick={() => {
                    onMove(s);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                >
                  <Icon size={15} className="text-accent" /> Move to {meta.label}
                </button>
              );
            })}
          {canDelete && (
            <button
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-panel hover:text-danger"
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      )}
    </>
  );
}

function RequestRow({
  r,
  isAdmin,
  canDelete,
  onVote,
  onMove,
  onDelete,
}: {
  r: FeatureRequest;
  isAdmin: boolean;
  canDelete: boolean;
  onVote: () => void;
  onMove: (s: FeatureStatus) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3">
      <VoteButton r={r} onVote={onVote} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{r.title}</div>
        {r.description && (
          <p className="mt-0.5 text-xs text-muted">{r.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} />
          <span className="text-[11px] text-subtle">{requester(r)}</span>
        </div>
      </div>
      <CardMenu
        status={r.status}
        canDelete={canDelete}
        isAdmin={isAdmin}
        onMove={onMove}
        onDelete={onDelete}
      />
    </div>
  );
}

function Board({
  requests,
  isAdmin,
  userId,
  onVote,
  onMove,
  onDelete,
}: {
  requests: FeatureRequest[];
  isAdmin: boolean;
  userId: string | null;
  onVote: (r: FeatureRequest) => void;
  onMove: (r: FeatureRequest, s: FeatureStatus) => void;
  onDelete: (r: FeatureRequest) => void;
}) {
  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {BOARD_ORDER.map((status) => {
        const items = requests.filter((r) => r.status === status);
        const meta = STATUS_META[status];
        const Icon = meta.icon;
        return (
          <div
            key={status}
            className="flex w-72 flex-shrink-0 flex-col rounded-2xl bg-panel/40 p-2"
          >
            <div className="mb-2 inline-flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              <Icon size={13} className="text-accent" /> {meta.label}
              <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] text-subtle">
                {items.length}
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-line bg-surface p-2.5"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 flex-1 text-sm font-medium text-ink">{r.title}</div>
                    <CardMenu
                      status={r.status}
                      canDelete={isAdmin || r.userId === userId}
                      isAdmin={isAdmin}
                      onMove={(s) => onMove(r, s)}
                      onDelete={() => onDelete(r)}
                    />
                  </div>
                  {r.description && (
                    <p className="mt-1 line-clamp-3 text-xs text-muted">{r.description}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      onClick={() => onVote(r)}
                      title={r.votedByMe ? "Remove your vote" : "Upvote"}
                      className={
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition " +
                        (r.votedByMe
                          ? "border-brand/50 bg-brand/15 text-accent"
                          : "border-line text-muted hover:border-brand/50 hover:text-accent")
                      }
                    >
                      <ChevronUp size={13} /> {r.voteCount}
                    </button>
                    <span className="truncate text-[11px] text-subtle">{requester(r)}</span>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="rounded-xl border border-dashed border-line py-4 text-center text-[11px] text-subtle">
                  Empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
