import { useState } from "react";
import { Gamepad2, Tags, Plus, X } from "lucide-react";
import { useStore } from "../store";
import { sortTerms } from "../lib/taxonomy";

/** Admin manager for the controlled taxonomy — the master lists of Platforms and
 *  Genres that every dropdown draws from. The lists are additive: admins ADD new
 *  terms as the collection grows (there's no destructive removal, so no stored
 *  value is ever orphaned). Gated on the taxonomy.manage permission. */
export function TaxonomyManager() {
  const platformList = useStore((s) => s.platformList);
  const genreList = useStore((s) => s.genreList);
  const addPlatform = useStore((s) => s.addPlatform);
  const addGenre = useStore((s) => s.addGenre);
  const removePlatform = useStore((s) => s.removePlatform);
  const removeGenre = useStore((s) => s.removeGenre);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TermColumn
        title="Platforms"
        icon={<Gamepad2 size={16} className="text-accent" />}
        terms={sortTerms(platformList)}
        onAdd={addPlatform}
        onRemove={removePlatform}
        placeholder="e.g. Steam Deck"
      />
      <TermColumn
        title="Genres"
        icon={<Tags size={16} className="text-accent" />}
        terms={sortTerms(genreList)}
        onAdd={addGenre}
        onRemove={removeGenre}
        placeholder="e.g. Roguelike"
      />
    </div>
  );
}

function TermColumn({
  title,
  icon,
  terms,
  onAdd,
  onRemove,
  placeholder,
}: {
  title: string;
  icon: React.ReactNode;
  terms: string[];
  onAdd: (name: string) => Promise<boolean>;
  onRemove: (name: string) => Promise<boolean>;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const exists = terms.some((t) => t.toLowerCase() === draft.trim().toLowerCase());

  async function add() {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    const ok = await onAdd(name);
    setBusy(false);
    if (ok) setDraft("");
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

      <div className="flex max-h-80 flex-wrap content-start gap-1.5 overflow-y-auto">
        {terms.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-panel py-1 pl-2.5 pr-1 text-xs text-ink"
          >
            {t}
            <button
              type="button"
              onClick={() => void onRemove(t)}
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
        A term that&apos;s still used by a game can&apos;t be removed.
      </p>
    </div>
  );
}
