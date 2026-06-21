import { useCallback, useEffect, useRef, useState } from "react";
import {
  Lightbulb,
  Bug,
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
  MessageCircle,
  Reply,
  Pencil,
  Send,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { timeAgo } from "../lib/time";
import type { FeatureComment, FeatureKind, FeatureRequest, FeatureStatus } from "../types";

const STATUS_META: Record<FeatureStatus, { label: string; icon: LucideIcon; badge: string }> = {
  submitted: { label: "Submitted", icon: Inbox, badge: "bg-panel text-muted" },
  planned: { label: "Planned", icon: CalendarClock, badge: "bg-accent/15 text-accent" },
  in_progress: { label: "In Progress", icon: Hammer, badge: "bg-brand/20 text-accent" },
  done: { label: "Done", icon: CheckCircle2, badge: "bg-success/15 text-success" },
  declined: { label: "Declined", icon: XCircle, badge: "bg-line text-subtle" },
};

const KIND_META: Record<FeatureKind, { label: string; icon: LucideIcon; badge: string }> = {
  feature: { label: "Feature", icon: Lightbulb, badge: "bg-accent/15 text-accent" },
  bug: { label: "Bug", icon: Bug, badge: "bg-danger/15 text-danger" },
};

// Column order on the admin board.
const BOARD_ORDER: FeatureStatus[] = ["submitted", "planned", "in_progress", "done", "declined"];

type Filter = "all" | FeatureKind;

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

function KindTag({ kind }: { kind: FeatureKind }) {
  const meta = KIND_META[kind];
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

export function FeatureBoard({
  onClose,
  initialRequestId,
}: {
  onClose: () => void;
  initialRequestId?: string;
}) {
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
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId ?? null);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [kind, setKind] = useState<FeatureKind>("feature");
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
    const ok = await submitFeatureRequest(t, desc, kind);
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
  // Detail derives from the live list so votes/edits/comment-counts stay in sync.
  const selected = requests?.find((r) => r.id === selectedId) ?? null;
  // Narrow by type (All / Features / Bugs) first…
  const filtered = requests?.filter((r) => filter === "all" || r.kind === filter) ?? null;
  // …then the votable list also hides finished/declined items — those live only on
  // the admin board. (The board still shows every column.)
  const votable = filtered?.filter((r) => r.status !== "done" && r.status !== "declined") ?? null;

  return (
    <>
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
            <Lightbulb size={18} className="text-accent" /> Requests &amp; bugs
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
            <div className="mb-2 flex w-fit rounded-lg border border-line bg-panel p-0.5">
              <ViewTab active={kind === "feature"} onClick={() => setKind("feature")} icon={Lightbulb}>
                Feature
              </ViewTab>
              <ViewTab active={kind === "bug"} onClick={() => setKind("bug")} icon={Bug}>
                Bug
              </ViewTab>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "bug"
                  ? "Describe the bug…"
                  : isAdmin
                    ? "Add a roadmap item…"
                    : "Suggest a feature…"
              }
              maxLength={120}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={
                kind === "bug" ? "Steps to reproduce, what you expected (optional)" : "Add detail (optional)"
              }
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
                {submitting ? "Submitting…" : kind === "bug" ? "Report" : isAdmin ? "Add" : "Submit"}
              </button>
            </div>
          </div>

          {/* Type filter */}
          {requests && requests.length > 0 && (
            <div className="mb-3 flex w-fit rounded-lg border border-line bg-panel p-0.5">
              <ViewTab active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </ViewTab>
              <ViewTab active={filter === "feature"} onClick={() => setFilter("feature")} icon={Lightbulb}>
                Features
              </ViewTab>
              <ViewTab active={filter === "bug"} onClick={() => setFilter("bug")} icon={Bug}>
                Bugs
              </ViewTab>
            </div>
          )}

          {loadError && <p className="text-sm text-danger">Couldn&apos;t load requests.</p>}
          {!requests && !loadError && <p className="text-sm text-muted">Loading…</p>}

          {requests &&
            (wide ? (
              !filtered || filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  {filter === "all"
                    ? "No requests yet — be the first to suggest something."
                    : `No ${filter === "bug" ? "bugs" : "features"} here yet.`}
                </p>
              ) : (
                <div className="min-h-0 flex-1">
                  <Board
                    requests={filtered}
                    isAdmin={isAdmin}
                    userId={userId}
                    onVote={onVote}
                    onMove={onMove}
                    onDelete={onDelete}
                    onOpen={(r) => setSelectedId(r.id)}
                  />
                </div>
              )
            ) : votable && votable.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                {filter === "all"
                  ? "No open requests right now — suggest something above."
                  : `No open ${filter === "bug" ? "bugs" : "features"} right now.`}
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
                    onOpen={() => setSelectedId(r.id)}
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

    {selected && (
      <RequestDetail
        request={selected}
        isAdmin={isAdmin}
        userId={userId}
        onClose={() => {
          setSelectedId(null);
          refresh();
        }}
        onVote={() => onVote(selected)}
        onPatch={(fn) => patch(selected.id, fn)}
        onDelete={() => {
          onDelete(selected);
          setSelectedId(null);
        }}
      />
    )}
    </>
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
  icon?: LucideIcon;
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
      {Icon && <Icon size={13} />} {children}
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

function CommentCount({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-subtle transition hover:text-accent"
      title={count === 1 ? "1 comment" : `${count} comments`}
    >
      <MessageCircle size={13} /> {count}
    </button>
  );
}

function RequestRow({
  r,
  isAdmin,
  canDelete,
  onVote,
  onMove,
  onDelete,
  onOpen,
}: {
  r: FeatureRequest;
  isAdmin: boolean;
  canDelete: boolean;
  onVote: () => void;
  onMove: (s: FeatureStatus) => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3">
      <VoteButton r={r} onVote={onVote} />
      <div className="min-w-0 flex-1">
        <button
          onClick={onOpen}
          className="text-left text-sm font-medium text-ink transition hover:text-accent"
        >
          {r.title}
        </button>
        {r.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{r.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <KindTag kind={r.kind} />
          <StatusBadge status={r.status} />
          <span className="text-[11px] text-subtle">{requester(r)}</span>
          <CommentCount count={r.commentCount} onClick={onOpen} />
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
  onOpen,
}: {
  requests: FeatureRequest[];
  isAdmin: boolean;
  userId: string | null;
  onVote: (r: FeatureRequest) => void;
  onMove: (r: FeatureRequest, s: FeatureStatus) => void;
  onDelete: (r: FeatureRequest) => void;
  onOpen: (r: FeatureRequest) => void;
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
                    <div className="min-w-0 flex-1">
                      <KindTag kind={r.kind} />
                      <button
                        onClick={() => onOpen(r)}
                        className="mt-1 block text-left text-sm font-medium text-ink transition hover:text-accent"
                      >
                        {r.title}
                      </button>
                    </div>
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
                    <div className="flex items-center gap-1">
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
                      <CommentCount count={r.commentCount} onClick={() => onOpen(r)} />
                    </div>
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

// A focused panel for one request: full description with inline edit (owner/admin),
// vote, and the comment thread (top-level comments + one level of replies).
function RequestDetail({
  request,
  isAdmin,
  userId,
  onClose,
  onVote,
  onPatch,
  onDelete,
}: {
  request: FeatureRequest;
  isAdmin: boolean;
  userId: string | null;
  onClose: () => void;
  onVote: () => void;
  onPatch: (fn: (r: FeatureRequest) => FeatureRequest) => void;
  onDelete: () => void;
}) {
  const { editFeatureRequest, fetchRequestComments, addComment, editComment, deleteComment } =
    useStore();

  const [comments, setComments] = useState<FeatureComment[] | null>(null);
  const [commentsError, setCommentsError] = useState(false);

  const [editingReq, setEditingReq] = useState(false);
  const [eTitle, setETitle] = useState(request.title);
  const [eDesc, setEDesc] = useState(request.description ?? "");

  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  useScrollLock(true);

  const canEditReq = isAdmin || userId === request.userId;
  const canManage = (c: FeatureComment) => isAdmin || userId === c.userId;

  const loadComments = useCallback(() => {
    setCommentsError(false);
    fetchRequestComments(request.id)
      .then(setComments)
      .catch(() => setCommentsError(true));
  }, [fetchRequestComments, request.id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const topLevel = comments?.filter((c) => !c.parentId) ?? [];
  const repliesByParent = (comments ?? []).reduce<Record<string, FeatureComment[]>>((acc, c) => {
    if (c.parentId) (acc[c.parentId] ??= []).push(c);
    return acc;
  }, {});

  async function saveReq() {
    const t = eTitle.trim();
    if (!t) return;
    const ok = await editFeatureRequest(request.id, t, eDesc);
    if (ok) {
      onPatch((r) => ({ ...r, title: t, description: eDesc.trim() || null }));
      setEditingReq(false);
    }
  }

  async function postComment() {
    const body = newComment.trim();
    if (!body) return;
    const ok = await addComment(request.id, body);
    if (ok) {
      setNewComment("");
      onPatch((r) => ({ ...r, commentCount: r.commentCount + 1 }));
      loadComments();
    }
  }

  async function postReply(parentId: string) {
    const body = replyText.trim();
    if (!body) return;
    const ok = await addComment(request.id, body, parentId);
    if (ok) {
      setReplyText("");
      setReplyTo(null);
      onPatch((r) => ({ ...r, commentCount: r.commentCount + 1 }));
      loadComments();
    }
  }

  async function saveCommentEdit(id: string) {
    const body = editCommentText.trim();
    if (!body) return;
    const ok = await editComment(id, body);
    if (ok) {
      setEditingCommentId(null);
      loadComments();
    }
  }

  async function removeComment(c: FeatureComment) {
    const removed = 1 + (repliesByParent[c.id]?.length ?? 0); // cascade deletes replies
    const ok = await deleteComment(c.id);
    if (ok) {
      onPatch((r) => ({ ...r, commentCount: Math.max(0, r.commentCount - removed) }));
      loadComments();
    }
  }

  // Rendered via a direct call (not <CommentBody/>) so the edit textarea keeps
  // focus across re-renders instead of remounting on each keystroke.
  function renderComment(c: FeatureComment, isReply = false) {
    const editing = editingCommentId === c.id;
    return (
      <div key={c.id} className="rounded-xl border border-line bg-panel p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink">{c.authorName ?? "Someone"}</span>
          <span className="text-[11px] text-subtle">{timeAgo(c.createdAt)}</span>
        </div>
        {editing ? (
          <div className="mt-1.5">
            <textarea
              value={editCommentText}
              onChange={(e) => setEditCommentText(e.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button
                onClick={() => setEditingCommentId(null)}
                className="rounded-md px-2 py-1 text-xs text-muted transition hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={() => saveCommentEdit(c.id)}
                disabled={!editCommentText.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
              >
                <Check size={12} /> Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{c.body}</p>
            <div className="mt-1 flex items-center gap-3">
              {!isReply && (
                <button
                  onClick={() => {
                    setReplyTo(replyTo === c.id ? null : c.id);
                    setReplyText("");
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-subtle transition hover:text-accent"
                >
                  <Reply size={12} /> Reply
                </button>
              )}
              {canManage(c) && (
                <>
                  <button
                    onClick={() => {
                      setEditingCommentId(c.id);
                      setEditCommentText(c.body);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-subtle transition hover:text-accent"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    onClick={() => removeComment(c)}
                    className="inline-flex items-center gap-1 text-[11px] text-subtle transition hover:text-danger"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex flex-wrap items-center gap-2">
            <KindTag kind={request.kind} />
            <StatusBadge status={request.status} />
          </div>
          <button onClick={onClose} className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Title + description, with inline edit for owner/admin */}
          {editingReq ? (
            <div className="rounded-xl border border-line bg-panel/50 p-3">
              <input
                value={eTitle}
                onChange={(e) => setETitle(e.target.value)}
                maxLength={120}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <textarea
                value={eDesc}
                onChange={(e) => setEDesc(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Add detail (optional)"
                className="mt-2 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingReq(false);
                    setETitle(request.title);
                    setEDesc(request.description ?? "");
                  }}
                  className="rounded-md px-3 py-1.5 text-xs text-muted transition hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={saveReq}
                  disabled={!eTitle.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                >
                  <Check size={13} /> Save
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg leading-tight text-ink">{request.title}</h3>
                <div className="flex shrink-0 items-center gap-1">
                  <VoteButton r={request} onVote={onVote} />
                </div>
              </div>
              {request.description && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">
                  {request.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-subtle">
                <span>{requester(request)}</span>
                {canEditReq && (
                  <button
                    onClick={() => {
                      setEditingReq(true);
                      setETitle(request.title);
                      setEDesc(request.description ?? "");
                    }}
                    className="inline-flex items-center gap-1 transition hover:text-accent"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                )}
                {(isAdmin || userId === request.userId) && (
                  <button
                    onClick={onDelete}
                    className="inline-flex items-center gap-1 transition hover:text-danger"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Comment thread */}
          <div className="mt-4 border-t border-line pt-3">
            <h4 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <MessageCircle size={13} className="text-accent" /> Comments
              <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] text-subtle">
                {request.commentCount}
              </span>
            </h4>

            {commentsError && <p className="text-sm text-danger">Couldn&apos;t load comments.</p>}
            {!comments && !commentsError && <p className="text-sm text-muted">Loading…</p>}
            {comments && topLevel.length === 0 && (
              <p className="py-3 text-center text-sm text-muted">
                No comments yet — start the discussion.
              </p>
            )}

            <div className="flex flex-col gap-3">
              {topLevel.map((c) => (
                <div key={c.id} className="flex flex-col gap-2">
                  {renderComment(c)}
                  {(repliesByParent[c.id]?.length || replyTo === c.id) && (
                    <div className="ml-4 flex flex-col gap-2 border-l border-line pl-3">
                      {repliesByParent[c.id]?.map((rep) => renderComment(rep, true))}
                      {replyTo === c.id && (
                        <div>
                          <textarea
                            autoFocus
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            rows={2}
                            maxLength={1000}
                            placeholder="Write a reply…"
                            className="w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
                          />
                          <div className="mt-1 flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setReplyTo(null);
                                setReplyText("");
                              }}
                              className="rounded-md px-2 py-1 text-xs text-muted transition hover:text-ink"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => postReply(c.id)}
                              disabled={!replyText.trim()}
                              className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                            >
                              <Send size={12} /> Reply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* New top-level comment */}
        <div className="border-t border-line p-3">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Add a comment…"
            className="w-full resize-none rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={postComment}
              disabled={!newComment.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 disabled:opacity-50"
            >
              <Send size={14} /> Comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
