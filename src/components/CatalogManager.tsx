import { useEffect, useMemo, useState } from "react";
import { Library, Search, Pencil, Trash2, Users, RefreshCw } from "lucide-react";
import { useStore } from "../store";
import { GameSubmissionForm } from "./GameSubmissionForm";
import { normalizeCatalogTitle, type CatalogFields, type CommunityCatalogEntry } from "../lib/submissions";

/** A one-line summary of an entry's catalog fields, for the list row. */
function fieldsSummary(e: CommunityCatalogEntry): string {
  const bits: string[] = [];
  if (e.released) bits.push(new Date(e.released).getFullYear().toString());
  if (e.hours != null) bits.push(`${e.hours}h`);
  if (e.platforms.length) bits.push(e.platforms.slice(0, 3).join(", "));
  if (e.genres.length) bits.push(e.genres.slice(0, 3).join(", "));
  return bits.join(" · ") || "No details yet";
}

/** A two-step delete control for a catalog entry. Surfaces the server's "still in N
 *  libraries" guard message inline rather than as a generic error toast. */
function DeleteControl({ entry, onDeleted }: { entry: CommunityCatalogEntry; onDeleted: () => void }) {
  const adminDeleteCatalogGame = useStore((s) => s.adminDeleteCatalogGame);
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const blocked = entry.ownerCount > 0;

  async function run() {
    setWorking(true);
    const ok = await adminDeleteCatalogGame(entry.id);
    setWorking(false);
    setConfirm(false);
    if (ok) onDeleted();
  }

  if (blocked) {
    return (
      <span
        className="text-[11px] text-subtle"
        title={`In ${entry.ownerCount} player ${entry.ownerCount === 1 ? "library" : "libraries"} — edit it instead of deleting.`}
      >
        Can't delete
      </span>
    );
  }
  return confirm ? (
    <span className="inline-flex items-center gap-2 text-[11px]">
      <button
        onClick={run}
        disabled={working}
        className="rounded-md bg-danger/15 px-2 py-1 font-semibold text-danger transition hover:bg-danger/25 disabled:opacity-50"
      >
        {working ? "Deleting…" : "Delete"}
      </button>
      <button onClick={() => setConfirm(false)} className="rounded-md bg-panel px-2 py-1 text-ink transition hover:brightness-95">
        Cancel
      </button>
    </span>
  ) : (
    <button
      onClick={() => setConfirm(true)}
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-danger/50 hover:text-danger"
    >
      <Trash2 size={12} /> Delete
    </button>
  );
}

/** Admin tool to browse, directly edit, and delete community catalog entries
 *  (games RAWG doesn't know about). RAWG-backed games are managed through the
 *  moderation queue and don't appear here. */
export function CatalogManager() {
  const fetchCommunityCatalog = useStore((s) => s.fetchCommunityCatalog);
  const adminEditCatalogGame = useStore((s) => s.adminEditCatalogGame);

  const [entries, setEntries] = useState<CommunityCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CommunityCatalogEntry | null>(null);

  async function load() {
    setLoading(true);
    const rows = await fetchCommunityCatalog();
    setEntries(rows);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeCatalogTitle(query);
    if (!q) return entries;
    return entries.filter((e) => normalizeCatalogTitle(e.title).includes(q));
  }, [entries, query]);

  async function saveEdit(id: string, proposed: CatalogFields): Promise<boolean> {
    const ok = await adminEditCatalogGame(id, proposed);
    if (ok) await load();
    return ok;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <Library size={18} className="text-accent" /> Community catalog
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Games added by the community (not from RAWG). Edits update every copy; delete is blocked while a game is owned.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-brand/50 hover:text-ink"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <label className="relative block">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search community games…"
          className="w-full rounded-lg border border-line bg-panel py-2 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
      </label>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-muted">
          {entries.length === 0 ? "No community catalog entries yet." : "No matches."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-nowrap"
            >
              <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
                {e.image ? (
                  <img src={e.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-lg opacity-50">🎮</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{e.title}</div>
                <div className="truncate text-xs text-muted">{fieldsSummary(e)}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-subtle">
                  <Users size={11} /> {e.ownerCount} {e.ownerCount === 1 ? "library" : "libraries"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setEditing(e)}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-brand/50 hover:text-ink"
                >
                  <Pencil size={12} /> Edit
                </button>
                <DeleteControl entry={e} onDeleted={() => void load()} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <GameSubmissionForm
          kind="edit"
          catalogId={editing.id}
          rawgId={null}
          before={editing}
          initial={editing}
          onClose={() => setEditing(null)}
          onAdminSave={(proposed) => saveEdit(editing.id, proposed)}
        />
      )}
    </div>
  );
}
