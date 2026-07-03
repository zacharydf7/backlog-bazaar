import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Library, Search, Pencil, Trash2, Users, RefreshCw, Package, Plus, X, Check, ImagePlus } from "lucide-react";
import { useStore } from "../store";
import { GameSubmissionForm } from "./GameSubmissionForm";
import { GameSearchBox } from "./GameSearchBox";
import { normalizeCatalogTitle, type CatalogFields, type CommunityCatalogEntry } from "../lib/submissions";
import type { CompilationTemplate, TemplateGame } from "../lib/compilationTemplates";
import type { GameMeta } from "../types";
import { formatLength, parsePlaytime } from "../lib/playtime";
import { newCopyId } from "../lib/copies";
import { useScrollLock } from "../lib/useScrollLock";

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

/** A two-step delete control for a compilation template. Templates aren't owned by
 *  any player (they only seed personal compilations at add-time), so there's no
 *  owner guard — deletion is always allowed. */
function CompilationDeleteControl({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const adminDeleteCompilationTemplate = useStore((s) => s.adminDeleteCompilationTemplate);
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);

  async function run() {
    setWorking(true);
    const ok = await adminDeleteCompilationTemplate(id);
    setWorking(false);
    setConfirm(false);
    if (ok) onDeleted();
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
 *  (games RAWG doesn't know about) and shared compilation templates. RAWG-backed
 *  games are managed through the moderation queue and don't appear here. */
export function CatalogManager() {
  const [tab, setTab] = useState<"games" | "compilations">("games");
  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit overflow-hidden rounded-lg border border-line">
        {(["games", "compilations"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={
              "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition " +
              (tab === t ? "bg-brand text-brand-fg" : "bg-panel text-muted hover:text-ink")
            }
          >
            {t === "games" ? <Library size={15} /> : <Package size={15} />}
            {t === "games" ? "Games" : "Compilations"}
          </button>
        ))}
      </div>
      {tab === "games" ? <GamesCatalogSection /> : <CompilationsCatalogSection />}
    </div>
  );
}

/** Browse / edit / delete community game catalog entries. */
function GamesCatalogSection() {
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
        <p className="max-w-xl text-xs text-muted">
          Games added by the community (not from RAWG). Edits update every copy; delete is blocked
          while a game is owned.
        </p>
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

/** Browse / edit / delete shared compilation templates. */
function CompilationsCatalogSection() {
  const fetchCompilationCatalog = useStore((s) => s.fetchCompilationCatalog);

  const [entries, setEntries] = useState<CompilationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CompilationTemplate | null>(null);

  async function load() {
    setLoading(true);
    const rows = await fetchCompilationCatalog();
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-muted">
          Shared compilations everyone can pick when adding one. Platform &amp; cost are personal, so
          each compilation appears once here. Editing or deleting affects only the shared template —
          never anyone's existing library.
        </p>
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
          placeholder="Search compilations…"
          className="w-full rounded-lg border border-line bg-panel py-2 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
      </label>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-muted">
          {entries.length === 0 ? "No shared compilations yet." : "No matches."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-nowrap"
            >
              <div className="flex shrink-0 gap-0.5">
                {t.games.slice(0, 3).map((g, i) => (
                  <div key={i} className="h-12 w-8 overflow-hidden rounded-sm border border-line bg-panel">
                    {g.image && <img src={g.image} alt="" className="h-full w-full object-cover" />}
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{t.title}</div>
                <div className="truncate text-xs text-muted">
                  {t.games.map((g) => g.name).join(", ") || "No games"}
                </div>
                <div className="mt-0.5 text-[11px] text-subtle">
                  {t.games.length} game{t.games.length === 1 ? "" : "s"}
                  {t.parentCatalogId && (
                    <span className="text-accent">
                      {" "}
                      · linked to {t.parentTitle ?? "a catalog game"} (expandable)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setEditing(t)}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition hover:border-brand/50 hover:text-ink"
                >
                  <Pencil size={12} /> Edit
                </button>
                <CompilationDeleteControl id={t.id} onDeleted={() => void load()} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CompilationTemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/** A draft game row in the compilation editor. `meta` carries the picked game's
 *  metadata (cover, ids, genres…) so it's preserved on save. */
interface CompRow {
  id: string;
  name: string;
  length: string;
  meta: Omit<TemplateGame, "name" | "hours">;
}

/** A focused editor for a shared compilation template: its title and the games it
 *  bundles (name + length, with autocomplete). Platform/format/cost are personal,
 *  so they're intentionally not here. */
function CompilationTemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: CompilationTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const adminEditCompilationTemplate = useStore((s) => s.adminEditCompilationTemplate);
  const adminSetCompilationTemplateImage = useStore((s) => s.adminSetCompilationTemplateImage);
  const uploadCatalogCover = useStore((s) => s.uploadCatalogCover);
  const ensureCatalogParent = useStore((s) => s.ensureCatalogParent);
  useScrollLock(true);
  const [title, setTitle] = useState(template.title);
  // The moderator cover for the collapsed parent card (fills the card for
  // owners without a personal cover). Saved via its own RPC when changed.
  const [coverUrl, setCoverUrl] = useState(template.image ?? "");
  const [coverUploading, setCoverUploading] = useState(false);
  // The moderator-set parent-game link: which catalog entry IS this compilation
  // sold as one game. Owners of that card gain "Expand compilation".
  const [parent, setParent] = useState<{ id: string; title: string } | null>(
    template.parentCatalogId
      ? { id: template.parentCatalogId, title: template.parentTitle ?? "Linked game" }
      : null,
  );
  const [parentDraft, setParentDraft] = useState("");
  const [parentLinking, setParentLinking] = useState(false);
  const [rows, setRows] = useState<CompRow[]>(() =>
    template.games.length
      ? template.games.map((g) => {
          const { name, hours, ...meta } = g;
          return { id: newCopyId(), name, length: hours ? formatLength(hours) : "", meta };
        })
      : [{ id: newCopyId(), name: "", length: "", meta: {} }],
  );
  const [working, setWorking] = useState(false);
  const lock = useRef(false);

  function update(id: string, patch: Partial<CompRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { id: newCopyId(), name: "", length: "", meta: {} }]);
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));
  }
  function onPick(id: string, meta: GameMeta) {
    update(id, {
      name: meta.title,
      length: meta.hours ? formatLength(meta.hours) : "",
      meta: {
        image: meta.image,
        rawgId: meta.rawgId,
        catalogId: meta.catalogId,
        genres: meta.genres,
        released: meta.released,
        metacritic: meta.metacritic,
        platforms: meta.platforms,
        developers: meta.developers,
        esrb: meta.esrb,
      },
    });
  }

  // Link a picked suggestion as the parent. The picker searches the full game
  // database (RAWG + community, like Add Game); a community/known game already
  // has a catalog id, while a RAWG game nobody has added yet gets its catalog
  // row created on demand (fill-blanks upsert — never overwrites approved data).
  async function pickParent(meta: GameMeta) {
    if (meta.catalogId) {
      setParent({ id: meta.catalogId, title: meta.title });
      setParentDraft("");
      return;
    }
    if (!meta.rawgId) return; // free text has no catalog identity to link
    setParentLinking(true);
    const id = await ensureCatalogParent({
      rawgId: meta.rawgId,
      title: meta.title,
      image: meta.image,
      released: meta.released,
    });
    setParentLinking(false);
    if (id) {
      setParent({ id, title: meta.title });
      setParentDraft("");
    }
  }

  const named = rows.filter((r) => r.name.trim());
  const canSave = title.trim() !== "" && named.length > 0;

  async function save() {
    if (lock.current || !canSave) return;
    lock.current = true;
    setWorking(true);
    const games: TemplateGame[] = named.map((r) => ({
      name: r.name.trim(),
      hours: parsePlaytime(r.length) ?? undefined,
      ...r.meta,
    }));
    let ok = await adminEditCompilationTemplate(template.id, title, games, parent?.id ?? null);
    // The cover rides its own RPC — only when it actually changed.
    const nextCover = coverUrl.trim();
    if (ok && nextCover !== (template.image ?? "")) {
      ok = await adminSetCompilationTemplateImage(template.id, nextCover || null);
    }
    setWorking(false);
    lock.current = false;
    if (ok) onSaved();
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex min-w-0 items-center gap-2 font-display text-xl text-ink">
            <Package size={18} className="shrink-0 text-accent" /> Edit compilation
          </h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <p className="rounded-lg border border-line bg-panel/50 p-2.5 text-xs text-muted">
            Editing the shared template only — platform, format and cost are personal and aren't
            changed for anyone. Logged for the audit trail.
          </p>
          <label className="text-sm text-muted">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">Games</span>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <GameSearchBox
                  value={r.name}
                  onChange={(v) => update(r.id, { name: v })}
                  onPick={(meta) => onPick(r.id, meta)}
                  placeholder="Search a game, or type a name"
                  ariaLabel="Game name"
                  className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
                <input
                  value={r.length}
                  onChange={(e) => update(r.id, { length: e.target.value })}
                  placeholder="Length"
                  aria-label="Length"
                  className="w-24 shrink-0 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  aria-label="Remove game"
                  className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-panel hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-brand/50"
            >
              <Plus size={14} className="text-accent" /> Add a game
            </button>
          </div>

          {/* Moderator cover for the collapsed parent card. Owners who set
              their own cover keep it; everyone else's card picks this up. */}
          <div className="text-sm text-muted">
            Parent card cover
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {coverUrl.trim() && (
                <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
                  <img src={coverUrl.trim()} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://… (empty = fall back to the first game's cover)"
                aria-label="Parent card cover URL"
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              <label
                className={
                  "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-medium transition " +
                  (coverUploading ? "cursor-wait text-subtle" : "text-muted hover:text-accent")
                }
              >
                <ImagePlus size={14} />
                {coverUploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={coverUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setCoverUploading(true);
                    void uploadCatalogCover(file).then((url) => {
                      setCoverUploading(false);
                      if (url) setCoverUrl(url);
                    });
                  }}
                />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-subtle">
              Paste an image URL or upload one. Shows on every collapsed parent card whose owner
              hasn&apos;t set a personal cover. Games inside the bundle keep their own covers.
            </p>
          </div>

          {/* Moderator-set parent link: the catalog entry for this compilation
              sold as ONE game. Owners of that single card can then expand it
              into this template's games (and collapse back). */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">Parent game (enables expand/collapse)</span>
            {parent ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-ink">
                  <Package size={14} className="shrink-0 text-accent" />
                  <span className="truncate">{parent.title}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setParent(null)}
                  aria-label="Clear parent game"
                  className="shrink-0 rounded-lg p-1 text-muted transition hover:bg-panel hover:text-danger"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <GameSearchBox
                value={parentDraft}
                onChange={setParentDraft}
                onPick={(meta) => void pickParent(meta)}
                placeholder="Search the game database for the compilation-as-one-game…"
                ariaLabel="Parent game"
                disabled={parentLinking}
                className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
            )}
            <p className="text-[11px] text-subtle">
              Searches the whole game database, community additions included — pick a result to
              link it; one compilation per game. Leave empty for bundles that aren&apos;t sold as a
              single title.
            </p>
          </div>

          <div className="mt-1 flex gap-2">
            <button
              onClick={save}
              disabled={!canSave || working}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={15} /> {working ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl bg-panel px-4 py-2.5 font-medium text-ink transition hover:brightness-95"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
