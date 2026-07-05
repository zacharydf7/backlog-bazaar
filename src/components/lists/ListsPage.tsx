import { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  FolderPen,
  FolderPlus,
  Layers,
  ListOrdered,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useStore } from "../../store";
import { useScrollLock } from "../../lib/useScrollLock";
import { useHistoryDismiss } from "../../lib/useHistoryDismiss";
import { listHash } from "../../lib/route";
import {
  folderCounts,
  listsInFolder,
  VISIBILITY_META,
  type GameListFolder,
  type GameListSummary,
  type ListVisibility,
} from "../../lib/gameLists";
import { ConfirmDialog } from "../ConfirmDialog";
import { VisibilityBadge } from "./VisibilityBadge";

/** Drag payload key for moving a list card onto a folder row. */
const LIST_DRAG = "text/bb-list-id";

/** Create-a-list modal: title, optional description, visibility. New lists
 *  land in the folder that was active when the button was pressed. */
function NewListModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, description: string, visibility: ListVisibility) => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onClose);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<ListVisibility>("private");

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <ListOrdered size={18} className="text-accent" /> New list
        </h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-subtle">Title</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Top 10 JRPGs"
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-subtle">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What ties this list together?"
            className="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-subtle">Who can see it</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(VISIBILITY_META) as ListVisibility[]).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                aria-pressed={visibility === v}
                className={
                  "rounded-full border px-3 py-1 text-sm transition " +
                  (visibility === v
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line text-muted hover:text-ink")
                }
              >
                {VISIBILITY_META[v].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-subtle">{VISIBILITY_META[visibility].blurb}</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(title, description.trim(), visibility)}
            disabled={!title.trim()}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create list
          </button>
        </div>
      </div>
    </div>
  );
}

/** Name a folder (create or rename — same tiny dialog). */
function FolderNameModal({
  initial,
  title,
  onClose,
  onSave,
}: {
  initial: string;
  title: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onClose);
  const [name, setName] = useState(initial);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
          <Folder size={18} className="text-accent" /> {title}
        </h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name)}
          placeholder="Top 10s"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(name)}
            disabled={!name.trim()}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** One folder-directory row: name + live count badge, drop target for list
 *  cards, with rename/delete affordances on the active folder. */
function FolderRow({
  icon: Icon,
  label,
  count,
  active,
  onSelect,
  onDropList,
  onRename,
  onDelete,
}: {
  icon: typeof Folder;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  onDropList?: (listId: string) => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={
        onDropList
          ? (e) => {
              e.preventDefault();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={onDropList ? () => setDragOver(false) : undefined}
      onDrop={
        onDropList
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              const id = e.dataTransfer.getData(LIST_DRAG);
              if (id) onDropList(id);
            }
          : undefined
      }
      className={
        "group flex items-center gap-1 rounded-lg transition " +
        (dragOver ? "ring-2 ring-brand/60 " : "") +
        (active ? "bg-panel text-ink" : "text-muted hover:bg-panel/60 hover:text-ink")
      }
    >
      <button
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm"
      >
        <Icon size={15} className={active ? "text-accent" : undefined} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] font-semibold text-subtle">
          {count}
        </span>
      </button>
      {active && onRename && (
        <button
          onClick={onRename}
          title={`Rename ${label}`}
          className="rounded p-1 text-subtle transition hover:text-ink"
        >
          <FolderPen size={13} />
        </button>
      )}
      {active && onDelete && (
        <button
          onClick={onDelete}
          title={`Delete ${label}`}
          className="mr-1 rounded p-1 text-subtle transition hover:text-danger"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

/** A list card on the workspace grid: cover collage, title, count, visibility.
 *  Draggable onto a folder row; the ⋮ menu covers the touch path (move/delete). */
function ListCard({
  list,
  folders,
  folderName,
  onOpen,
  onMoveToFolder,
  onDelete,
}: {
  list: GameListSummary;
  folders: GameListFolder[];
  /** Shown as a chip in the All Lists view when the list is filed somewhere. */
  folderName: string | null;
  onOpen: () => void;
  onMoveToFolder: (folderId: string | null) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData(LIST_DRAG, list.id)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-edge"
      onClick={onOpen}
    >
      {/* Cover collage: up to 4 item covers; a quiet placeholder otherwise. */}
      <div className="grid aspect-[2/1] grid-cols-4 gap-px bg-panel">
        {list.preview.length === 0 ? (
          <div className="col-span-4 flex items-center justify-center text-subtle">
            <ListOrdered size={28} />
          </div>
        ) : (
          Array.from({ length: 4 }, (_, i) =>
            list.preview[i] ? (
              <img
                key={i}
                src={list.preview[i]}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div key={i} className="h-full w-full bg-panel" />
            ),
          )
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-1.5">
          <h3 className="min-w-0 flex-1 truncate font-display text-[15px] text-ink">
            {list.title}
          </h3>
          <div ref={menuRef} className="relative -mr-1 -mt-0.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-label={`Options for ${list.title}`}
              aria-expanded={menuOpen}
              className="rounded-lg p-1 text-subtle transition hover:bg-panel hover:text-ink"
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  Move to folder
                </p>
                {[{ id: null as string | null, name: "No folder" }, ...folders].map((f) => (
                  <button
                    key={f.id ?? "none"}
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveToFolder(f.id);
                    }}
                    disabled={list.folderId === f.id}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted transition hover:bg-panel hover:text-ink disabled:opacity-40"
                  >
                    <Folder size={13} /> <span className="min-w-0 truncate">{f.name}</span>
                  </button>
                ))}
                <div className="my-1 border-t border-line" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-danger transition hover:bg-danger/10"
                >
                  <Trash2 size={13} /> Delete list
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
          <span>
            {list.itemCount} {list.itemCount === 1 ? "game" : "games"}
          </span>
          <VisibilityBadge visibility={list.visibility} />
          {folderName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 font-medium text-muted">
              <Folder size={10} /> {folderName}
            </span>
          )}
        </div>
        {list.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted">{list.description}</p>
        )}
      </div>
    </div>
  );
}

/** The My Lists workspace: a folder directory (All Lists + custom folders with
 *  live count badges — the requester's mockup) beside the list-card grid.
 *  Drag a card onto a folder to file it; everything also works by touch via
 *  each card's ⋮ menu. Opening a card routes to its page (#l/<id>). */
export function ListsPage() {
  const cloud = useStore((s) => s.cloud);
  const myLists = useStore((s) => s.myLists);
  const folders = useStore((s) => s.myListFolders);
  const fetchMyLists = useStore((s) => s.fetchMyLists);
  const createList = useStore((s) => s.createList);
  const updateList = useStore((s) => s.updateList);
  const deleteList = useStore((s) => s.deleteList);
  const createListFolder = useStore((s) => s.createListFolder);
  const renameListFolder = useStore((s) => s.renameListFolder);
  const deleteListFolder = useStore((s) => s.deleteListFolder);

  // null = the persistent "All Lists" master view.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [folderModal, setFolderModal] = useState<{ id: string | null; name: string } | null>(null);
  const [deletingList, setDeletingList] = useState<GameListSummary | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<GameListFolder | null>(null);

  useEffect(() => {
    if (cloud) void fetchMyLists();
  }, [cloud, fetchMyLists]);

  // A deleted folder can't stay selected.
  useEffect(() => {
    if (activeFolder && !folders.some((f) => f.id === activeFolder)) setActiveFolder(null);
  }, [activeFolder, folders]);

  const lists = useMemo(() => myLists ?? [], [myLists]);
  const counts = useMemo(() => folderCounts(lists), [lists]);
  const shown = listsInFolder(lists, activeFolder);
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? null;

  if (!cloud) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
        Custom lists live on your account — sign in to start curating.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-tight text-ink">My Lists</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFolderModal({ id: null, name: "" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            <FolderPlus size={15} /> New folder
          </button>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105"
          >
            <Plus size={15} /> New list
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── Folder directory ─────────────────────────────────────────────── */}
        <aside className="shrink-0 rounded-2xl border border-line bg-surface p-2 lg:w-60">
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
            Folders
          </p>
          <div className="flex flex-col gap-0.5">
            <FolderRow
              icon={Layers}
              label="All Lists"
              count={lists.length}
              active={activeFolder === null}
              onSelect={() => setActiveFolder(null)}
              onDropList={(id) => void updateList(id, { folderId: null })}
            />
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                icon={Folder}
                label={f.name}
                count={counts.get(f.id) ?? 0}
                active={activeFolder === f.id}
                onSelect={() => setActiveFolder(f.id)}
                onDropList={(id) => void updateList(id, { folderId: f.id })}
                onRename={() => setFolderModal({ id: f.id, name: f.name })}
                onDelete={() => setDeletingFolder(f)}
              />
            ))}
          </div>
          {folders.length === 0 && (
            <p className="px-2.5 pb-1.5 pt-1 text-xs text-subtle">
              Folders keep a growing collection tidy — drag lists into them.
            </p>
          )}
        </aside>

        {/* ── List grid ────────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {myLists === null ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
              {activeFolder === null ? (
                <>
                  Nothing curated yet. Make your first list — a top 10, a franchise ranking, a
                  recommendation shelf — and put your taste on display.
                </>
              ) : (
                <>This folder is empty — drag lists in, or file them from a card&rsquo;s ⋮ menu.</>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((l) => (
                <ListCard
                  key={l.id}
                  list={l}
                  folders={folders}
                  folderName={activeFolder === null ? folderName(l.folderId) : null}
                  onOpen={() => {
                    window.location.hash = listHash(l.id);
                  }}
                  onMoveToFolder={(folderId) => void updateList(l.id, { folderId })}
                  onDelete={() => setDeletingList(l)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && (
        <NewListModal
          onClose={() => setCreating(false)}
          onCreate={(title, description, visibility) => {
            setCreating(false);
            void createList({ title, description, visibility, folderId: activeFolder }).then(
              (id) => {
                if (id) window.location.hash = listHash(id);
              },
            );
          }}
        />
      )}

      {folderModal && (
        <FolderNameModal
          title={folderModal.id ? "Rename folder" : "New folder"}
          initial={folderModal.name}
          onClose={() => setFolderModal(null)}
          onSave={(name) => {
            const { id } = folderModal;
            setFolderModal(null);
            if (id) void renameListFolder(id, name);
            else
              void createListFolder(name).then((newId) => {
                if (newId) setActiveFolder(newId);
              });
          }}
        />
      )}

      {deletingList && (
        <ConfirmDialog
          title="Delete this list?"
          body={
            <>
              <strong className="text-ink">{deletingList.title}</strong> and its{" "}
              {deletingList.itemCount} {deletingList.itemCount === 1 ? "entry" : "entries"} will be
              removed. Your games themselves are untouched.
            </>
          }
          confirmLabel="Delete list"
          tone="danger"
          onCancel={() => setDeletingList(null)}
          onConfirm={() => {
            const id = deletingList.id;
            setDeletingList(null);
            void deleteList(id);
          }}
        />
      )}

      {deletingFolder && (
        <ConfirmDialog
          title="Delete this folder?"
          body={
            <>
              <strong className="text-ink">{deletingFolder.name}</strong> will be removed. The
              lists inside it are kept — they just return to All Lists.
            </>
          }
          confirmLabel="Delete folder"
          tone="danger"
          onCancel={() => setDeletingFolder(null)}
          onConfirm={() => {
            const id = deletingFolder.id;
            setDeletingFolder(null);
            void deleteListFolder(id);
          }}
        />
      )}
    </div>
  );
}
