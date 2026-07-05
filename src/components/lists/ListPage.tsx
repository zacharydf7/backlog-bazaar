import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder } from "motion/react";
import {
  ArrowLeft,
  Check,
  GripVertical,
  Library,
  Link2,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "../../store";
import { toast } from "../../lib/toast";
import { gameHash, listHash } from "../../lib/route";
import { searchGameSuggestions } from "../../lib/gameSearch";
import {
  listHasGame,
  nextRank,
  ownedListGame,
  VISIBILITY_META,
  type GameListDetail,
  type GameListItem,
  type ListVisibility,
} from "../../lib/gameLists";
import type { GameMeta } from "../../types";
import { Avatar } from "../Avatar";
import { ConfirmDialog } from "../ConfirmDialog";
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
  onAdd: (meta: { rawgId?: number; catalogId?: string; title: string; image?: string }) => void;
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
        setResults(found);
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
          !g.catalogId &&
          g.status !== "wishlist" &&
          g.title.toLowerCase().includes(q),
      )
      .slice(0, 3);
  }, [games, query]);

  function pick(meta: { rawgId?: number; catalogId?: string; title: string; image?: string }) {
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
                key={r.rawgId ?? r.catalogId ?? r.title}
                onClick={() =>
                  pick({ rawgId: r.rawgId, catalogId: r.catalogId, title: r.title, image: r.image })
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
 *  gets a drag handle, an editable blurb, and a remove button. */
function ItemRow({
  item,
  index,
  own,
  onBlurb,
  onRemove,
}: {
  item: GameListItem;
  index: number;
  own: boolean;
  onBlurb: (blurb: string) => void;
  onRemove: () => void;
}) {
  const games = useStore((s) => s.games);
  const [editingBlurb, setEditingBlurb] = useState(false);
  const [draft, setDraft] = useState(item.blurb);
  const owned = ownedListGame(games, item);

  const body = (
    <div className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3">
      {own && (
        <span className="mt-4 shrink-0 cursor-grab touch-none text-subtle" aria-hidden>
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
            {owned ? (
              <a
                href={gameHash(owned.id)}
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
          {own && (
            <button
              onClick={onRemove}
              title={`Remove ${item.title}`}
              className="shrink-0 rounded-lg p-1 text-subtle transition hover:bg-panel hover:text-danger"
            >
              <X size={15} />
            </button>
          )}
        </div>
        {own ? (
          editingBlurb ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
              onClick={() => {
                setDraft(item.blurb);
                setEditingBlurb(true);
              }}
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
      </div>
    </div>
  );

  if (!own) return body;
  return (
    <Reorder.Item value={item.id} className="list-none">
      {body}
    </Reorder.Item>
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

  const [detail, setDetail] = useState<GameListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The live drag order (item ids); committed to the server on drag end.
  const orderRef = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setDetail(null);
    void fetchGameList(listId).then((d) => {
      if (!alive) return;
      setDetail(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [listId, fetchGameList]);

  const own = detail != null && userId != null && detail.userId === userId;
  const items = useMemo(() => detail?.items ?? [], [detail]);
  orderRef.current = items.map((i) => i.id);

  async function refresh() {
    const d = await fetchGameList(listId);
    if (d) setDetail(d);
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
        </div>
      </div>

      {/* ── The games ──────────────────────────────────────────────────────── */}
      {own && (
        <AddGameSearch
          items={items}
          onAdd={(meta) => {
            void addListItem(listId, meta, nextRank(items)).then((ok) => {
              if (ok) void refresh();
            });
          }}
        />
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
          onPointerUp={() => void reorderGameList(listId, orderRef.current)}
          className="flex flex-col gap-2.5"
        >
          {items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              index={idx}
              own
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
              own={false}
              onBlurb={() => {}}
              onRemove={() => {}}
            />
          ))}
        </div>
      )}

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
