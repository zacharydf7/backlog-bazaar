import { useState } from "react";
import { Gamepad2, Tags, Plus, X, ArrowRight, AlertTriangle } from "lucide-react";
import { useStore } from "../store";
import { sortTerms, type TaxonomyRemoveResult } from "../lib/taxonomy";

/** Admin manager for the controlled taxonomy — the master lists of Platforms and
 *  Genres that every dropdown draws from. Terms are added freely; removing a term
 *  that's still in use first prompts for a replacement (pick existing or type new),
 *  which reassigns every usage before the old term is dropped — so no stored value
 *  is ever orphaned. Gated on the taxonomy.manage permission. */
export function TaxonomyManager() {
  const platformList = useStore((s) => s.platformList);
  const genreList = useStore((s) => s.genreList);
  const addPlatform = useStore((s) => s.addPlatform);
  const addGenre = useStore((s) => s.addGenre);
  const removePlatform = useStore((s) => s.removePlatform);
  const removeGenre = useStore((s) => s.removeGenre);
  const replacePlatform = useStore((s) => s.replacePlatform);
  const replaceGenre = useStore((s) => s.replaceGenre);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TermColumn
        title="Platforms"
        noun="platform"
        icon={<Gamepad2 size={16} className="text-accent" />}
        terms={sortTerms(platformList)}
        onAdd={addPlatform}
        onRemove={removePlatform}
        onReplace={replacePlatform}
        placeholder="e.g. Steam Deck"
      />
      <TermColumn
        title="Genres"
        noun="genre"
        icon={<Tags size={16} className="text-accent" />}
        terms={sortTerms(genreList)}
        onAdd={addGenre}
        onRemove={removeGenre}
        onReplace={replaceGenre}
        placeholder="e.g. Roguelike"
      />
    </div>
  );
}

function TermColumn({
  title,
  noun,
  icon,
  terms,
  onAdd,
  onRemove,
  onReplace,
  placeholder,
}: {
  title: string;
  /** Singular lower-case label used in prompts, e.g. "platform" / "genre". */
  noun: string;
  icon: React.ReactNode;
  terms: string[];
  onAdd: (name: string) => Promise<boolean>;
  onRemove: (name: string) => Promise<TaxonomyRemoveResult>;
  onReplace: (oldName: string, newName: string) => Promise<boolean>;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // The term currently being removed-via-replace, plus its replacement draft.
  const [replacing, setReplacing] = useState<string | null>(null);
  const [replaceWith, setReplaceWith] = useState("");
  const [replaceBusy, setReplaceBusy] = useState(false);
  const exists = terms.some((t) => t.toLowerCase() === draft.trim().toLowerCase());
  const dlId = `replace-options-${title}`;

  async function add() {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    const ok = await onAdd(name);
    setBusy(false);
    if (ok) setDraft("");
  }

  // Try to remove; if the term is still in use the server refuses, so open the
  // replace prompt instead of silently failing.
  async function handleRemove(name: string) {
    if (replaceBusy) return;
    const result = await onRemove(name);
    if (result === "in_use") {
      setReplacing(name);
      setReplaceWith("");
    }
  }

  const replaceTarget = replaceWith.trim();
  const replaceValid =
    replacing != null &&
    replaceTarget.length > 0 &&
    replaceTarget.toLowerCase() !== replacing.toLowerCase();

  async function confirmReplace() {
    if (!replacing || !replaceValid || replaceBusy) return;
    setReplaceBusy(true);
    const ok = await onReplace(replacing, replaceTarget);
    setReplaceBusy(false);
    if (ok) {
      setReplacing(null);
      setReplaceWith("");
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-display text-lg text-ink">{title}</h3>
        <span className="text-xs text-subtle">({terms.length})</span>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={!draft.trim() || exists || busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} /> Add
        </button>
      </div>
      {exists && draft.trim() && (
        <p className="mb-2 text-xs text-subtle">“{draft.trim()}” is already on the list.</p>
      )}

      {/* Replace-before-remove prompt: shown when a removal was refused because the
          term is still in use. Pick an existing term or type a new one. */}
      {replacing && (
        <div className="mb-3 rounded-xl border border-line bg-panel/60 p-3">
          <div className="flex items-start gap-2 text-sm text-ink">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
            <p>
              <span className="font-medium">“{replacing}”</span> is still used by some games.
              Replace it with another {noun} to remove it — every usage will be reassigned.
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="shrink-0 truncate text-xs text-muted" title={replacing}>
                {replacing}
              </span>
              <ArrowRight size={14} className="shrink-0 text-subtle" />
              <input
                autoFocus
                list={dlId}
                value={replaceWith}
                onChange={(e) => setReplaceWith(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void confirmReplace();
                  } else if (e.key === "Escape") {
                    setReplacing(null);
                  }
                }}
                placeholder={`Pick or type a ${noun}…`}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              <datalist id={dlId}>
                {terms
                  .filter((t) => t.toLowerCase() !== replacing.toLowerCase())
                  .map((t) => (
                    <option key={t} value={t} />
                  ))}
              </datalist>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void confirmReplace()}
                disabled={!replaceValid || replaceBusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {replaceBusy ? "Replacing…" : "Replace & remove"}
              </button>
              <button
                type="button"
                onClick={() => setReplacing(null)}
                disabled={replaceBusy}
                className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex max-h-80 flex-wrap content-start gap-1.5 overflow-y-auto">
        {terms.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-panel py-1 pl-2.5 pr-1 text-xs text-ink"
          >
            {t}
            <button
              type="button"
              onClick={() => void handleRemove(t)}
              aria-label={`Remove ${t}`}
              title={`Remove ${t}`}
              className="rounded-full p-0.5 text-subtle transition hover:bg-danger/15 hover:text-danger"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        A term that&apos;s still used by a game must be replaced before it can be removed.
      </p>
    </div>
  );
}
