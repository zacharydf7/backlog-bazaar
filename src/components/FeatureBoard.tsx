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
  MessageCircleQuestion,
  CheckCircle2,
  XCircle,
  List,
  Columns3,
  MessageCircle,
  Reply,
  Pencil,
  Send,
  Check,
  SmilePlus,
  Search,
  Plus,
  User,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { timeAgo } from "../lib/time";
import {
  filterSortRequests,
  hasActiveFilters,
  type RequestQuery,
  type RequestSort,
  type StatusFilter,
} from "../lib/requestFilter";
import type { FeatureComment, FeatureKind, FeatureRequest, FeatureStatus } from "../types";

// The reaction palette, in display order. Mirrored by the DB check constraint on
// comment_reactions.emoji — keep the two in sync.
const REACTIONS = ["👍", "❤️", "🎉", "😄"];

// Generous text limits so a single request/comment rarely needs splitting.
const TITLE_MAX = 200;
const BODY_MAX = 5000;

const STATUS_META: Record<FeatureStatus, { label: string; icon: LucideIcon; badge: string }> = {
  submitted: { label: "Submitted", icon: Inbox, badge: "bg-panel text-muted" },
  planned: { label: "Planned", icon: CalendarClock, badge: "bg-accent/15 text-accent" },
  in_progress: { label: "In Progress", icon: Hammer, badge: "bg-brand/20 text-accent" },
  awaiting_feedback: {
    label: "Awaiting Feedback",
    icon: MessageCircleQuestion,
    badge: "bg-accent/15 text-accent",
  },
  done: { label: "Done", icon: CheckCircle2, badge: "bg-success/15 text-success" },
  declined: { label: "Declined", icon: XCircle, badge: "bg-line text-subtle" },
};

const KIND_META: Record<FeatureKind, { label: string; icon: LucideIcon; badge: string }> = {
  feature: { label: "Feature", icon: Lightbulb, badge: "bg-accent/15 text-accent" },
  bug: { label: "Bug", icon: Bug, badge: "bg-danger/15 text-danger" },
};

// Column order on the admin board.
const BOARD_ORDER: FeatureStatus[] = [
  "submitted",
  "planned",
  "in_progress",
  "awaiting_feedback",
  "done",
  "declined",
];

type Filter = "all" | FeatureKind;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "all", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_feedback", label: "Awaiting Feedback" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

const SORTS: { value: RequestSort; label: string }[] = [
  { value: "votes", label: "Most votes" },
  { value: "newest", label: "Newest" },
  { value: "comments", label: "Most comments" },
];

const selectClass =
  "rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-ink outline-none transition focus:border-brand";

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

export function FeatureBoard({ initialRequestId }: { initialRequestId?: string }) {
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
  const [selectedId, setSelectedId] = useState<string | null>(initialRequestId ?? null);

  // Toolbar
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all"); // type
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [sort, setSort] = useState<RequestSort>("votes");
  const [mineOnly, setMineOnly] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  // Compose
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
      setShowCompose(false);
      refresh();
    }
  }

  // Close the composer and discard the in-progress draft.
  function cancelCompose() {
    setShowCompose(false);
    setTitle("");
    setDesc("");
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

  const controlQuery: RequestQuery = { search, type: filter, status: statusFilter, mineOnly, sort, userId };
  // The kanban shows status as columns, so the Board ignores the status select.
  const visible = requests
    ? filterSortRequests(requests, wide ? { ...controlQuery, status: "all" } : controlQuery)
    : null;
  const filtersActive = hasActiveFilters(controlQuery);
  const composerOpen = showCompose || requests?.length === 0;

  function clearFilters() {
    setSearch("");
    setFilter("all");
    setStatusFilter("open");
    setMineOnly(false);
  }

  return (
    <>
      <div
        className={
          "mx-auto flex h-[calc(100dvh-9rem)] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface " +
          (wide ? "max-w-none" : "max-w-5xl")
        }
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
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-4">
          {/* Toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search requests…"
                className="w-full rounded-lg border border-line bg-panel py-2 pl-8 pr-3 text-sm text-ink outline-none transition focus:border-brand"
              />
            </div>
            <div className="flex rounded-lg border border-line bg-panel p-0.5">
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
            {!wide && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filter by status"
                className={selectClass}
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as RequestSort)}
              aria-label="Sort"
              className={selectClass}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setMineOnly((m) => !m)}
              className={
                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-sm transition " +
                (mineOnly
                  ? "border-brand/50 bg-brand/15 text-accent"
                  : "border-line bg-panel text-muted hover:text-ink")
              }
            >
              <User size={14} /> Mine
            </button>
            <button
              onClick={() => setShowCompose((s) => !s)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
            >
              <Plus size={15} /> New
            </button>
          </div>

          {/* Compose (collapsible; auto-open when the board is empty) */}
          {composerOpen && (
            <div className="mb-3 rounded-xl border border-line bg-panel/50 p-3">
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
                maxLength={TITLE_MAX}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={
                  kind === "bug"
                    ? "Steps to reproduce, what you expected (optional)"
                    : "Add detail (optional)"
                }
                rows={5}
                maxLength={BODY_MAX}
                className="mt-2 max-h-[60vh] min-h-24 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <div className="mt-2 flex justify-end gap-2">
                {/* Only offer Cancel when the user opened the composer — when it's
                    force-open because the board is empty, there's nothing to close. */}
                {showCompose && (
                  <button
                    type="button"
                    onClick={cancelCompose}
                    disabled={submitting}
                    className="rounded-lg px-4 py-1.5 text-sm font-medium text-muted transition hover:text-ink disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={onSubmit}
                  disabled={!title.trim() || submitting}
                  className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : kind === "bug" ? "Report" : isAdmin ? "Add" : "Submit"}
                </button>
              </div>
            </div>
          )}

          {loadError && <p className="text-sm text-danger">Couldn&apos;t load requests.</p>}
          {!requests && !loadError && <p className="text-sm text-muted">Loading…</p>}

          {requests && visible && (
            visible.length === 0 ? (
              <div className="min-h-0 flex-1 overflow-y-auto py-10 text-center">
                <p className="text-sm text-muted">
                  {requests.length === 0
                    ? "No requests yet — add the first one above."
                    : filtersActive
                      ? "No requests match your search or filters."
                      : "Nothing here yet."}
                </p>
                {filtersActive && (
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-xs text-accent transition hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : wide ? (
              <div className="min-h-0 flex-1">
                <Board
                  requests={visible}
                  isAdmin={isAdmin}
                  userId={userId}
                  onVote={onVote}
                  onMove={onMove}
                  onDelete={onDelete}
                  onOpen={(r) => setSelectedId(r.id)}
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex flex-col gap-2">
                  {visible.map((r) => (
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
              </div>
            )
          )}

          <p className="mt-3 shrink-0 text-center text-[11px] text-subtle">
            {visible ? `${visible.length} shown` : "Upvote what you want next — we work top-down."}
          </p>
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
      <div onClick={onOpen} className="group min-w-0 flex-1 cursor-pointer">
        <div className="text-sm font-medium text-ink transition group-hover:text-accent">
          {r.title}
        </div>
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
            className="flex min-w-[260px] flex-1 flex-col rounded-2xl bg-panel/40 p-2"
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
                    <div
                      onClick={() => onOpen(r)}
                      className="group min-w-0 flex-1 cursor-pointer"
                    >
                      <KindTag kind={r.kind} />
                      <div className="mt-1 text-sm font-medium text-ink transition group-hover:text-accent">
                        {r.title}
                      </div>
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
                    <p
                      onClick={() => onOpen(r)}
                      className="mt-1 line-clamp-3 cursor-pointer text-xs text-muted"
                    >
                      {r.description}
                    </p>
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
  const {
    editFeatureRequest,
    respondFeatureRequest,
    fetchRequestComments,
    addComment,
    editComment,
    deleteComment,
    toggleReaction,
    openUserBazaar,
  } = useStore();

  // Open a poster's Bazaar (closes this detail; App switches to their boards).
  // No-op for yourself.
  const visit = (uid: string | null) => {
    if (!uid || uid === userId) return;
    onClose();
    void openUserBazaar(uid);
  };

  const [comments, setComments] = useState<FeatureComment[] | null>(null);
  const [commentsError, setCommentsError] = useState(false);
  const [reactingId, setReactingId] = useState<string | null>(null);

  const [editingReq, setEditingReq] = useState(false);
  const [eTitle, setETitle] = useState(request.title);
  const [eDesc, setEDesc] = useState(request.description ?? "");
  const [eKind, setEKind] = useState<FeatureKind>(request.kind);

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
    const ok = await editFeatureRequest(request.id, t, eDesc, eKind);
    if (ok) {
      onPatch((r) => ({ ...r, title: t, description: eDesc.trim() || null, kind: eKind }));
      setEditingReq(false);
    }
  }

  // Owner sign-off when an item is awaiting their feedback.
  const isOwner = userId === request.userId;
  const canRespond = isOwner && request.status === "awaiting_feedback";

  async function respond(approve: boolean) {
    const next = await respondFeatureRequest(request.id, approve);
    if (next) onPatch((r) => ({ ...r, status: next }));
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

  function patchComment(id: string, fn: (c: FeatureComment) => FeatureComment) {
    setComments((cs) => cs?.map((c) => (c.id === id ? fn(c) : c)) ?? null);
  }

  function onReact(c: FeatureComment, emoji: string) {
    const reacted = c.myReactions.includes(emoji);
    setReactingId(null);
    patchComment(c.id, (x) => {
      const reactions = { ...x.reactions };
      const next = (reactions[emoji] ?? 0) + (reacted ? -1 : 1);
      if (next > 0) reactions[emoji] = next;
      else delete reactions[emoji];
      return {
        ...x,
        reactions,
        myReactions: reacted
          ? x.myReactions.filter((e) => e !== emoji)
          : [...x.myReactions, emoji],
      };
    });
    toggleReaction(c.id, emoji, !reacted).then((ok) => {
      if (!ok) loadComments();
    });
  }

  // Rendered via a direct call (not <CommentBody/>) so the edit textarea keeps
  // focus across re-renders instead of remounting on each keystroke.
  function renderComment(c: FeatureComment, isReply = false) {
    const editing = editingCommentId === c.id;
    return (
      <div key={c.id} className="rounded-xl border border-line bg-panel p-2.5">
        <div className="flex items-center justify-between gap-2">
          {c.userId && c.userId !== userId ? (
            <button
              onClick={() => visit(c.userId)}
              title={`Visit ${c.authorName ?? "this player"}'s Bazaar`}
              className="text-xs font-semibold text-ink transition hover:text-accent hover:underline"
            >
              {c.authorName ?? "Someone"}
            </button>
          ) : (
            <span className="text-xs font-semibold text-ink">{c.authorName ?? "Someone"}</span>
          )}
          <span className="text-[11px] text-subtle">
            {timeAgo(c.createdAt)}
            {c.updatedAt - c.createdAt > 1000 && (
              <span title={`Edited ${timeAgo(c.updatedAt)}`}> · edited</span>
            )}
          </span>
        </div>
        {editing ? (
          <div className="mt-1.5">
            <textarea
              value={editCommentText}
              onChange={(e) => setEditCommentText(e.target.value)}
              rows={5}
              maxLength={BODY_MAX}
              className="max-h-[60vh] min-h-24 w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
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

            {/* Reactions */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {REACTIONS.filter((e) => (c.reactions[e] ?? 0) > 0).map((e) => {
                const mine = c.myReactions.includes(e);
                return (
                  <button
                    key={e}
                    onClick={() => onReact(c, e)}
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition " +
                      (mine
                        ? "border-brand/50 bg-brand/15 text-accent"
                        : "border-line text-muted hover:border-brand/50")
                    }
                  >
                    <span>{e}</span> {c.reactions[e]}
                  </button>
                );
              })}
              <div className="relative">
                <button
                  onClick={() => setReactingId(reactingId === c.id ? null : c.id)}
                  title="Add reaction"
                  aria-label="Add reaction"
                  className="grid h-6 w-6 place-items-center rounded-full border border-line text-subtle transition hover:border-brand/50 hover:text-accent"
                >
                  <SmilePlus size={13} />
                </button>
                {reactingId === c.id && (
                  <div className="absolute left-0 top-full z-10 mt-1 flex gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-2xl">
                    {REACTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => onReact(c, e)}
                        className={
                          "rounded-lg px-1.5 py-1 text-base transition hover:bg-panel " +
                          (c.myReactions.includes(e) ? "bg-brand/15" : "")
                        }
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

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
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-2xl"
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
          {/* Owner sign-off prompt when the item is awaiting their feedback */}
          {canRespond && (
            <div className="mb-4 rounded-xl border border-brand/40 bg-brand/10 p-3">
              <p className="text-sm font-medium text-ink">Ready for your review</p>
              <p className="mt-0.5 text-xs text-muted">
                This was built and is waiting on you. Approve it, or send it back if it needs more
                work.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  onClick={() => respond(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-105"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  onClick={() => respond(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-brand/50"
                >
                  <Reply size={14} /> Request changes
                </button>
              </div>
            </div>
          )}

          {/* Title + description, with inline edit for owner/admin */}
          {editingReq ? (
            <div className="rounded-xl border border-line bg-panel/50 p-3">
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEKind("feature")}
                  className={
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition " +
                    (eKind === "feature"
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-line bg-surface text-muted hover:border-brand/50")
                  }
                >
                  <Lightbulb size={14} className="text-accent" /> Feature
                </button>
                <button
                  type="button"
                  onClick={() => setEKind("bug")}
                  className={
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition " +
                    (eKind === "bug"
                      ? "border-brand bg-brand/10 text-ink"
                      : "border-line bg-surface text-muted hover:border-brand/50")
                  }
                >
                  <Bug size={14} className="text-danger" /> Bug
                </button>
              </div>
              <input
                value={eTitle}
                onChange={(e) => setETitle(e.target.value)}
                maxLength={TITLE_MAX}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <textarea
                value={eDesc}
                onChange={(e) => setEDesc(e.target.value)}
                rows={8}
                maxLength={BODY_MAX}
                placeholder="Add detail (optional)"
                className="mt-2 max-h-[65vh] min-h-32 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingReq(false);
                    setETitle(request.title);
                    setEDesc(request.description ?? "");
                    setEKind(request.kind);
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
                {!request.isAdminItem && request.userId !== userId ? (
                  <button
                    onClick={() => visit(request.userId)}
                    title={`Visit ${request.requesterName ?? "this player"}'s Bazaar`}
                    className="transition hover:text-accent hover:underline"
                  >
                    {requester(request)}
                  </button>
                ) : (
                  <span>{requester(request)}</span>
                )}
                {request.editedAt != null && (
                  <span title={new Date(request.editedAt).toLocaleString()}>
                    edited {timeAgo(request.editedAt)}
                  </span>
                )}
                {canEditReq && (
                  <button
                    onClick={() => {
                      setEditingReq(true);
                      setETitle(request.title);
                      setEDesc(request.description ?? "");
                      setEKind(request.kind);
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
                            rows={4}
                            maxLength={BODY_MAX}
                            placeholder="Write a reply…"
                            className="max-h-[50vh] min-h-20 w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
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
            rows={4}
            maxLength={BODY_MAX}
            placeholder="Add a comment…"
            className="max-h-[50vh] min-h-20 w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand"
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
