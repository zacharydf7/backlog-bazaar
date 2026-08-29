import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowLeft,
  Check,
  GripVertical,
  History,
  Library,
  Link2,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useStore } from "../../store";
import { toast } from "../../lib/toast";
import { gameHash, listHash } from "../../lib/route";
import { searchGameSuggestions } from "../../lib/gameSearch";
import {
  isPendingRemoval,
  listActivityLabel,
  listGamePage,
  listHasGame,
  listItemPreviewGame,
  listRole,
  nextRank,
  ownedListGame,
  VISIBILITY_META,
  type GameListDetail,
  type GameListItem,
  type ListActivityEvent,
  type ListMember,
  type ListRole,
  type ListVisibility,
} from "../../lib/gameLists";
import type { CatalogOverride } from "../../lib/submissions";
import type { GameMeta } from "../../types";
import { Avatar } from "../Avatar";
import { ConfirmDialog } from "../ConfirmDialog";
import { GamePreviewModal } from "../gamepage/GamePreviewModal";
import { VisitWishlistButton } from "../gamepage/GamePage";
import { VisibilityBadge } from "./VisibilityBadge";

/** Inline title/description editor: renders as text until the owner taps the
 *  pencil, then becomes a field that saves on Enter/blur. */
function InlineEdit({
  value,
  placeholder,
  heading,
  onSave,
}: {
  value: string;
  placeholder: string;
  heading?: boolean;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== value && (heading ? next : true)) onSave(heading ? next || value : next);
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={
          "group flex min-w-0 max-w-full items-start gap-1.5 text-left " +
          (heading
            ? "font-display text-2xl tracking-tight text-ink"
            : "text-sm leading-relaxed text-muted")
        }
      >
        <span className="min-w-0 break-words">
          {value || <span className="text-subtle">{placeholder}</span>}
        </span>
        <Pencil
          size={heading ? 15 : 13}
          className="mt-1.5 shrink-0 text-subtle opacity-0 transition group-hover:opacity-100"
        />
      </button>
    );
  }
  return heading ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="w-full rounded-lg border border-line bg-panel px-3 py-1.5 font-display text-2xl tracking-tight text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
    />
  ) : (
    <textarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      rows={3}
      placeholder={placeholder}
      className="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
    />
  );
}

/** The owner's add-a-game box: the shared search pipeline (RAWG + community
 *  catalog) merged with matching games from their own library, so even a
 *  custom game the catalog doesn't know can make the list (snapshot-only). */
function AddGameSearch({
  items,
  onAdd,
}: {
  items: GameListItem[];
  onAdd: (meta: {
    rawgId?: number;
    igdbId?: number;
    catalogId?: string;
    title: string;
    image?: string;
  }) => void;
}) {
  const games = useStore((s) => s.games);
  const searchCatalogGames = useStore((s) => s.searchCatalogGames);
  const fetchCatalogOverrides = useStore((s) => s.fetchCatalogOverrides);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GameMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const reqId = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchGameSuggestions(query.trim(), {
          searchCatalogGames,
          fetchCatalogOverrides,
        });
        if (id !== reqId.current) return;
        setResults(found.results);
        setOpen(true);
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, searchCatalogGames, fetchCatalogOverrides]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Library entries matching the query that the global search can't know:
  // custom games (no rawg/catalog id). Identity-bearing games already surface
  // through the shared pipeline.
  const libraryHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return games
      .filter(
        (g) =>
          g.rawgId == null &&
          g.igdbId == null &&
          !g.catalogId &&
          g.status !== "wishlist" &&
          g.title.toLowerCase().includes(q),
      )
      .slice(0, 3);
  }, [games, query]);

  function pick(meta: {
    rawgId?: number;
    igdbId?: number;
    catalogId?: string;
    title: string;
    image?: string;
  }) {
    setQuery("");
    setResults([]);
    setOpen(false);
    onAdd(meta);
  }

  const row =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
        {loading ? (
          <Loader2 size={15} className="shrink-0 animate-spin text-subtle" />
        ) : (
          <Search size={15} className="shrink-0 text-subtle" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Add a game — search the whole catalog…"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
        />
      </div>
      {open && (results.length > 0 || libraryHits.length > 0) && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-2xl">
          {libraryHits.length > 0 && (
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              From your library
            </p>
          )}
          {libraryHits.map((g) => (
            <button
              key={g.id}
              onClick={() => pick({ title: g.title, image: g.image })}
              disabled={listHasGame(items, g)}
              className={row}
            >
              <Library size={14} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{g.title}</span>
              {listHasGame(items, g) && <Check size={14} className="shrink-0 text-success" />}
            </button>
          ))}
          {results.map((r) => {
            const inList = listHasGame(items, r);
            return (
              <button
                key={r.rawgId ?? r.igdbId ?? r.catalogId ?? r.title}
                onClick={() =>
                  // All three identity axes — dropping igdbId here left IGDB
                  // adds identity-less, and a later suggest-edit then minted a
                  // duplicate community catalog row (issue 1e48546b).
                  pick({
                    rawgId: r.rawgId,
                    igdbId: r.igdbId,
                    catalogId: r.catalogId,
                    title: r.title,
                    image: r.image,
                  })
                }
                disabled={inList}
                className={row}
              >
                {r.image ? (
                  <img src={r.image} alt="" className="h-10 w-8 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-10 w-8 shrink-0 items-center justify-center rounded bg-panel text-subtle">
                    <ListOrdered size={13} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{r.title}</span>
                  {r.released && (
                    <span className="block text-xs text-subtle">{r.released.slice(0, 4)}</span>
                  )}
                </span>
                {inList ? (
                  <Check size={14} className="shrink-0 text-success" />
                ) : (
                  <Plus size={14} className="shrink-0 text-subtle" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One entry row: rank, box art, title (+ in-library link), blurb. The owner
 *  gets a drag handle, an editable blurb, and a remove button.
 *
 *  Tapping anywhere on the row acts on that game: it opens the game's page when
 *  you hold it, and otherwise the look-only preview card — the same card a game
 *  on someone else's page gives you, since there is no page of your own for a
 *  game you don't have and a list is usually full of those. The controls inside
 *  the row (handle, remove, blurb) stop the click. Reordering is therefore
 *  handle-only (`dragListener` off, `dragControls` started from the grip) —
 *  otherwise the row would both drag and navigate under one thumb. */
function ItemRow({
  item,
  index,
  role,
  onDragStart,
  onBlurb,
  onRemove,
  onRequestRemoval,
  onResolveRemoval,
}: {
  item: GameListItem;
  index: number;
  /** owner: full control · contributor: add/annotate + removal requests ·
   *  viewer: read-only (issue b2059a55). */
  role: ListRole;
  onDragStart?: () => void;
  onBlurb: (blurb: string) => void;
  onRemove: () => void;
  onRequestRemoval: () => void;
  onResolveRemoval: (approve: boolean) => void;
}) {
  const own = role === "owner";
  const canAnnotate = role === "owner" || role === "contributor";
  const pending = isPendingRemoval(item);
  const games = useStore((s) => s.games);
  const fetchCatalogGame = useStore((s) => s.fetchCatalogGame);
  const controls = useDragControls();
  const [editingBlurb, setEditingBlurb] = useState(false);
  const [preview, setPreview] = useState(false);
  // The entry's approved catalog record, loaded when its preview first opens so
  // the card shows the shared length, art and screenshots — and so a suggested
  // edit diffs against what the catalog actually holds. null until it lands.
  const [catalog, setCatalog] = useState<CatalogOverride | null>(null);
  const [draft, setDraft] = useState(item.blurb);
  const owned = ownedListGame(games, item);
  // The badge says "in your library" (owned only); the tap opens whatever copy
  // you hold, wishlist wants included — they have a page you can edit too.
  const target = listGamePage(games, item);
  const previewGame = useMemo(() => listItemPreviewGame(item, catalog), [item, catalog]);

  // Every entry is actionable: yours opens its page, one you don't hold opens
  // the look-only card, from where it can be wishlisted or its catalog entry
  // corrected. Once it's yours the row becomes a page link on its own.
  const open = target
    ? () => {
        window.location.hash = gameHash(target.id);
      }
    : () => {
        setPreview(true);
        if (!catalog) {
          void fetchCatalogGame({
            rawgId: item.rawgId,
            igdbId: item.igdbId,
            catalogId: item.catalogId,
          }).then(setCatalog);
        }
      };

  const body = (
    <div
      role="button"
      tabIndex={0}
      title={target ? `Open ${item.title}` : `Preview ${item.title}`}
      onClick={open}
      // Only when the row itself has focus — Enter/Space inside the blurb
      // box or on the title link must not act.
      onKeyDown={(e: KeyboardEvent) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={
        "flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-3 transition hover:border-brand/50 " +
        // Pending removal (issue b2059a55): flagged and dimmed, never deleted,
        // until the owner rules on it.
        (pending ? "border-dashed border-line bg-surface opacity-60" : "border-line bg-surface")
      }
    >
      {own && (
        <span
          role="button"
          aria-label={`Drag to reorder ${item.title}`}
          title="Drag to reorder"
          onPointerDown={(e) => {
            onDragStart?.();
            controls.start(e);
          }}
          onClick={(e) => e.stopPropagation()}
          className="mt-4 shrink-0 cursor-grab touch-none text-subtle transition hover:text-ink"
        >
          <GripVertical size={16} />
        </span>
      )}
      <span className="mt-3 w-7 shrink-0 text-center font-display text-lg text-subtle">
        {index + 1}
      </span>
      {item.image ? (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          className="h-20 w-14 shrink-0 rounded-lg border border-line object-cover"
        />
      ) : (
        <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-subtle">
          <ListOrdered size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {target ? (
              // A real link so the entry can be opened in a new tab; the row
              // click handles the plain tap.
              <a
                href={gameHash(target.id)}
                onClick={(e) => e.stopPropagation()}
                className="break-words font-medium text-ink underline-offset-2 hover:underline"
              >
                {item.title}
              </a>
            ) : (
              <span className="break-words font-medium text-ink">{item.title}</span>
            )}
            {owned && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 align-middle text-[10px] font-medium text-muted">
                <Library size={10} /> In your library
              </span>
            )}
          </div>
          {own ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title={`Remove ${item.title}`}
              className="shrink-0 rounded-lg p-1 text-subtle transition hover:bg-panel hover:text-danger"
            >
              <X size={15} />
            </button>
          ) : (
            role === "contributor" &&
            !pending && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestRemoval();
                }}
                title={`Ask the owner to remove ${item.title}`}
                className="shrink-0 rounded-lg p-1 text-subtle transition hover:bg-panel hover:text-danger"
              >
                <X size={15} />
              </button>
            )
          )}
        </div>
        {canAnnotate ? (
          editingBlurb ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                setEditingBlurb(false);
                if (draft.trim() !== item.blurb) onBlurb(draft.trim());
              }}
              rows={2}
              placeholder="Why did this one make the cut?"
              className="mt-1.5 w-full resize-y rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDraft(item.blurb);
                setEditingBlurb(true);
              }}
              title="Edit this note"
              className="group mt-1 flex max-w-full items-start gap-1.5 text-left text-sm leading-relaxed text-muted"
            >
              <span className="min-w-0 break-words">
                {item.blurb || (
                  <span className="text-subtle">Why did this one make the cut?</span>
                )}
              </span>
              <Pencil
                size={12}
                className="mt-1 shrink-0 text-subtle opacity-0 transition group-hover:opacity-100"
              />
            </button>
          )
        ) : (
          item.blurb && (
            <p className="mt-1 break-words text-sm leading-relaxed text-muted">{item.blurb}</p>
          )
        )}
        {/* Attribution (issue b2059a55): which curator added this entry. The
            owner's own picks stay untagged — the list is theirs. */}
        {item.addedByName && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[10px] text-subtle">
            <Avatar url={item.addedByAvatar ?? null} name={item.addedByName} size={12} />
            added by {item.addedByName}
          </span>
        )}
        {pending && (
          <div
            className="mt-1.5 flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              Removal requested{item.removalRequestedByName ? ` by ${item.removalRequestedByName}` : ""}
            </span>
            {own && (
              <>
                <button
                  onClick={() => onResolveRemoval(true)}
                  className="rounded-lg bg-danger/15 px-2 py-1 text-xs font-semibold text-danger transition hover:bg-danger/25"
                >
                  Approve removal
                </button>
                <button
                  onClick={() => onResolveRemoval(false)}
                  className="rounded-lg bg-panel px-2 py-1 text-xs text-ink transition hover:brightness-95"
                >
                  Keep it
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {own ? (
        <Reorder.Item
          value={item.id}
          dragListener={false}
          dragControls={controls}
          className="list-none"
        >
          {body}
        </Reorder.Item>
      ) : (
        body
      )}
      {preview &&
        createPortal(
          <GamePreviewModal
            game={previewGame}
            hideSpend={false}
            screenshots={catalog?.screenshots ?? []}
            catalogOnly
            action={<VisitWishlistButton game={previewGame} />}
            onClose={() => setPreview(false)}
          />,
          document.body,
        )}
    </>
  );
}

/** A custom list's page — the share-link destination. The owner curates in
 *  place (rename, describe, set visibility, add/remove/reorder games, blurb
 *  each pick); everyone else gets the clean vertical read with box art. */
export function ListPage({ listId, onBack }: { listId: string; onBack: () => void }) {
  const cloud = useStore((s) => s.cloud);
  const userId = useStore((s) => s.userId);
  const fetchGameList = useStore((s) => s.fetchGameList);
  const updateList = useStore((s) => s.updateList);
  const deleteList = useStore((s) => s.deleteList);
  const addListItem = useStore((s) => s.addListItem);
  const updateListItemBlurb = useStore((s) => s.updateListItemBlurb);
  const removeListItem = useStore((s) => s.removeListItem);
  const reorderGameList = useStore((s) => s.reorderGameList);
  const fetchListMembers = useStore((s) => s.fetchListMembers);
  const respondListInvite = useStore((s) => s.respondListInvite);
  const removeListMember = useStore((s) => s.removeListMember);
  const requestListItemRemoval = useStore((s) => s.requestListItemRemoval);
  const resolveListItemRemoval = useStore((s) => s.resolveListItemRemoval);

  const [detail, setDetail] = useState<GameListDetail | null>(null);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The live drag order (item ids); committed to the server on drag end.
  const orderRef = useRef<string[]>([]);
  // Set when a drag starts from a grip, so a plain tap on a row (now the way to
  // open a game) doesn't fire a pointless reorder write.
  const draggingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    void fetchGameList(listId).then((d) => {
      if (!alive) return;
      setDetail(d);
      setLoading(false);
      // The roster rides along for every viewer: it drives the avatar stack,
      // the caller's role, and a pending invitee's accept banner.
      if (d) void fetchListMembers(listId).then((m) => alive && setMembers(m));
    });
    return () => {
      alive = false;
    };
  }, [listId, fetchGameList, fetchListMembers]);

  const role: ListRole = detail ? listRole(detail, userId, members) : "viewer";
  const own = role === "owner";
  const canCurate = role === "owner" || role === "contributor";
  const contributors = members.filter((m) => !m.isOwner && m.status === "accepted");
  const myInvite = members.find(
    (m) => !m.isOwner && m.userId === userId && m.status === "pending",
  );
  const items = useMemo(() => detail?.items ?? [], [detail]);
  orderRef.current = items.map((i) => i.id);

  async function refresh() {
    const d = await fetchGameList(listId);
    if (d) setDetail(d);
    setMembers(await fetchListMembers(listId));
  }

  function setOrder(ids: string[]) {
    setDetail((d) =>
      d
        ? {
            ...d,
            items: ids
              .map((id) => d.items.find((i) => i.id === id))
              .filter((i): i is GameListItem => i != null)
              .map((i, idx) => ({ ...i, rank: idx + 1 })),
          }
        : d,
    );
  }

  function shareLink() {
    const url =
      window.location.origin + window.location.pathname + window.location.search + listHash(listId);
    void navigator.clipboard
      .writeText(url)
      .then(() => toast("Link copied — anyone with it can view this list.", Link2))
      .catch(() => toast("Couldn't copy — the link is in your address bar."));
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <p className="text-sm text-muted">
          {cloud
            ? "This list isn't available — it may be private or deleted."
            : "Lists need an account — sign in to view them."}
        </p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
        >
          <ArrowLeft size={15} /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {detail.visibility !== "private" && (
              <button
                onClick={shareLink}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
              >
                <Link2 size={14} /> Copy link
              </button>
            )}
            {canCurate && (
              <button
                onClick={() => setShowActivity(true)}
                title="Who added, removed and ruled on what"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
              >
                <History size={14} /> Activity
              </button>
            )}
            {own && (
              <button
                onClick={() => setShowInvite(true)}
                title="Invite a friend to curate this list with you"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-ink"
              >
                <UserPlus size={14} /> Invite
              </button>
            )}
            {own && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-danger/40 hover:text-danger"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 sm:p-5">
          {own ? (
            <InlineEdit
              heading
              value={detail.title}
              placeholder="Name this list"
              onSave={(title) => {
                setDetail((d) => (d ? { ...d, title } : d));
                void updateList(listId, { title });
              }}
            />
          ) : (
            <h2 className="break-words font-display text-2xl tracking-tight text-ink">
              {detail.title}
            </h2>
          )}

          {!own && detail.ownerName && (
            <a
              href={`#u/${detail.userId}`}
              className="inline-flex w-fit items-center gap-2 text-sm text-muted underline-offset-2 hover:underline"
            >
              <Avatar url={detail.ownerAvatar} name={detail.ownerName} size={20} />
              {detail.ownerName}
            </a>
          )}

          {own ? (
            <InlineEdit
              value={detail.description}
              placeholder="Add a description — what ties this list together?"
              onSave={(description) => {
                setDetail((d) => (d ? { ...d, description } : d));
                void updateList(listId, { description });
              }}
            />
          ) : (
            detail.description && (
              <p className="break-words text-sm leading-relaxed text-muted">
                {detail.description}
              </p>
            )
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {own ? (
              <>
                {(Object.keys(VISIBILITY_META) as ListVisibility[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setDetail((d) => (d ? { ...d, visibility: v } : d));
                      void updateList(listId, { visibility: v });
                    }}
                    aria-pressed={detail.visibility === v}
                    title={VISIBILITY_META[v].blurb}
                    className={
                      "rounded-full border px-2.5 py-1 text-xs transition " +
                      (detail.visibility === v
                        ? "border-brand bg-brand text-brand-fg"
                        : "border-line text-muted hover:text-ink")
                    }
                  >
                    {VISIBILITY_META[v].label}
                  </button>
                ))}
                <span className="text-xs text-subtle">
                  {VISIBILITY_META[detail.visibility].blurb}
                </span>
              </>
            ) : (
              <VisibilityBadge visibility={detail.visibility} />
            )}
            <span className="ml-auto text-xs text-subtle">
              {items.length} {items.length === 1 ? "game" : "games"}
            </span>
          </div>

          {/* Shared-list indicators (issue b2059a55): the overlapping avatar
              stack of everyone curating. Tapping opens the roster (owner can
              remove; a contributor can leave). */}
          {contributors.length > 0 && (
            <button
              onClick={() => setShowMembers(true)}
              title="Curators on this list"
              className="flex w-fit items-center gap-2 rounded-lg py-0.5 pr-2 text-xs text-muted transition hover:text-ink"
            >
              <span className="flex -space-x-2">
                {members
                  .filter((m) => m.status === "accepted")
                  .slice(0, 5)
                  .map((m) => (
                    <span key={m.userId} className="rounded-full ring-2 ring-surface">
                      <Avatar url={m.avatarUrl} name={m.displayName} size={22} />
                    </span>
                  ))}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={12} /> {contributors.length + 1} curators
              </span>
            </button>
          )}
        </div>

        {/* A pending invite: this page IS the accept/decline surface. */}
        {myInvite && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm text-ink">
              {detail.ownerName ?? "The owner"} invited you to curate this list — you&apos;ll be
              able to add games and suggest removals.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void respondListInvite(listId, true).then(() => refresh())}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105"
              >
                Accept
              </button>
              <button
                onClick={() => void respondListInvite(listId, false).then(() => onBack())}
                className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted transition hover:text-ink"
              >
                Decline
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── The games ──────────────────────────────────────────────────────── */}
      {canCurate && !myInvite && (
        <AddGameSearch
          items={items}
          onAdd={(meta) => {
            void addListItem(listId, meta, nextRank(items)).then((ok) => {
              if (ok) void refresh();
            });
          }}
        />
      )}

      {own && items.length > 1 && (
        <p className="-mt-2 text-xs text-subtle">
          Tap an entry to open that game — or, for one you don't have yet, to look it over. Drag the
          handle on the left to re-rank.
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">
          {own
            ? "No games yet — search above to start building the ranking."
            : "This list is still empty."}
        </div>
      ) : own ? (
        <Reorder.Group
          axis="y"
          values={items.map((i) => i.id)}
          onReorder={setOrder}
          // Persist when the pointer lets go — onReorder fires per hover swap.
          onPointerUp={() => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            void reorderGameList(listId, orderRef.current);
          }}
          className="flex flex-col gap-2.5"
        >
          {items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              index={idx}
              role="owner"
              onDragStart={() => {
                draggingRef.current = true;
              }}
              onBlurb={(blurb) => {
                setDetail((d) =>
                  d
                    ? { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, blurb } : i)) }
                    : d,
                );
                void updateListItemBlurb(item.id, blurb);
              }}
              onRemove={() => {
                setDetail((d) =>
                  d ? { ...d, items: d.items.filter((i) => i.id !== item.id) } : d,
                );
                void removeListItem(item.id);
              }}
              onRequestRemoval={() => {}}
              onResolveRemoval={(approve) => {
                void resolveListItemRemoval(item.id, approve).then(() => refresh());
              }}
            />
          ))}
        </Reorder.Group>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              index={idx}
              role={myInvite ? "viewer" : role}
              onBlurb={(blurb) => {
                setDetail((d) =>
                  d
                    ? { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, blurb } : i)) }
                    : d,
                );
                void updateListItemBlurb(item.id, blurb);
              }}
              onRemove={() => {}}
              onRequestRemoval={() => {
                void requestListItemRemoval(item.id).then(() => refresh());
              }}
              onResolveRemoval={() => {}}
            />
          ))}
        </div>
      )}

      {showInvite && (
        <InviteModal
          listId={listId}
          onClose={() => setShowInvite(false)}
          onInvited={() => void refresh()}
        />
      )}
      {showMembers && detail && (
        <MembersModal
          members={members}
          role={role}
          myUserId={userId}
          onClose={() => setShowMembers(false)}
          onRemove={(memberId) => {
            void removeListMember(listId, memberId).then(() => refresh());
          }}
          onLeave={() => {
            setShowMembers(false);
            void removeListMember(listId, userId ?? "").then(() => onBack());
          }}
        />
      )}
      {showActivity && <ActivityModal listId={listId} onClose={() => setShowActivity(false)} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this list?"
          body={
            <>
              <strong className="text-ink">{detail.title}</strong> and its {items.length}{" "}
              {items.length === 1 ? "entry" : "entries"} will be removed. Your games themselves are
              untouched.
            </>
          }
          confirmLabel="Delete list"
          tone="danger"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void deleteList(listId).then((ok) => {
              if (ok) onBack();
            });
          }}
        />
      )}
    </div>
  );
}
/* ── Collaboration modals (issue b2059a55) ────────────────────────────────── */

/** Owner-only: pick a friend to invite as a contributor. Candidates come from
 *  the server-filtered options RPC (never the client friends array). */
function InviteModal({
  listId,
  onClose,
  onInvited,
}: {
  listId: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const fetchListMemberOptions = useStore((s) => s.fetchListMemberOptions);
  const inviteListMember = useStore((s) => s.inviteListMember);
  const [options, setOptions] = useState<
    { id: string; displayName: string; avatarUrl: string | null }[] | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchListMemberOptions(listId).then((opts) => live && setOptions(opts));
    return () => {
      live = false;
    };
  }, [fetchListMemberOptions, listId]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <UserPlus size={16} className="text-accent" /> Invite a curator
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <p className="text-sm text-muted">
            Contributors add games and edit notes freely; removing a game needs your approval.
          </p>
          {options == null ? (
            <p className="py-2 text-sm text-subtle">Loading friends…</p>
          ) : options.length === 0 ? (
            <p className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-muted">
              No friends to invite right now — everyone eligible is already on the list.
            </p>
          ) : (
            options.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-2"
              >
                <Avatar url={o.avatarUrl} name={o.displayName} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{o.displayName}</span>
                <button
                  onClick={() => {
                    setBusyId(o.id);
                    void inviteListMember(listId, o.id).then((ok) => {
                      setBusyId(null);
                      if (ok) {
                        setOptions((os) => (os ?? []).filter((x) => x.id !== o.id));
                        onInvited();
                      }
                    });
                  }}
                  disabled={busyId === o.id}
                  className="rounded-lg bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-60"
                >
                  Invite
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The full curator roster. The owner can remove a contributor (or retract a
 *  pending invite); a contributor gets a Leave button for themselves. */
function MembersModal({
  members,
  role,
  myUserId,
  onClose,
  onRemove,
  onLeave,
}: {
  members: ListMember[];
  role: ListRole;
  myUserId: string | null;
  onClose: () => void;
  onRemove: (memberId: string) => void;
  onLeave: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Users size={16} className="text-accent" /> Curators
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-2 p-4">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-2"
            >
              <Avatar url={m.avatarUrl} name={m.displayName} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {m.displayName}
                {m.userId === myUserId && <span className="text-subtle"> (you)</span>}
              </span>
              {m.isOwner ? (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  Owner
                </span>
              ) : m.status === "pending" ? (
                <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-subtle">
                  Invited
                </span>
              ) : null}
              {role === "owner" && !m.isOwner && (
                <button
                  onClick={() => onRemove(m.userId)}
                  title={`Remove ${m.displayName}`}
                  className="rounded-lg p-1 text-subtle transition hover:bg-surface hover:text-danger"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {role === "contributor" && (
            <button
              onClick={onLeave}
              className="mt-1 self-start rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-danger/40 hover:text-danger"
            >
              Leave this list
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The List Activity ledger: who added, who asked for a removal, and how the
 *  owner ruled — newest first, straight from game_list_events. */
function ActivityModal({ listId, onClose }: { listId: string; onClose: () => void }) {
  const fetchListActivity = useStore((s) => s.fetchListActivity);
  const [events, setEvents] = useState<ListActivityEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    void fetchListActivity(listId).then((e) => live && setEvents(e));
    return () => {
      live = false;
    };
  }, [fetchListActivity, listId]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <History size={16} className="text-accent" /> List Activity
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto p-4">
          {events == null ? (
            <p className="py-2 text-sm text-subtle">Loading…</p>
          ) : events.length === 0 ? (
            <p className="py-2 text-sm text-muted">Nothing logged yet.</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 rounded-xl px-1 py-1.5">
                <Avatar url={e.actorAvatar} name={e.actorName ?? "?"} size={22} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-ink">{listActivityLabel(e)}</p>
                  <p className="text-[11px] text-subtle">
                    {new Date(e.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
