import { useState } from "react";
import { X, Plus, Tag } from "lucide-react";
import { addTagToList, tagSuggestions, MAX_TAGS } from "../lib/tags";

/** Pick tags for a feature/bug report: shows the chosen tags as removable chips,
 *  a free-text input to add a custom tag (Enter or +), and quick-add suggestions
 *  drawn from the predefined set plus tags everyone has already used. */
export function TagPicker({
  value,
  onChange,
  usedTags,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  usedTags: string[];
}) {
  const [input, setInput] = useState("");
  const atMax = value.length >= MAX_TAGS;
  const suggestions = atMax ? [] : tagSuggestions(usedTags, value).slice(0, 10);

  function add(raw: string) {
    onChange(addTagToList(value, raw));
    setInput("");
  }

  return (
    <div className="mt-2">
      <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <Tag size={13} className="text-accent" /> Tags{" "}
        <span className="text-subtle">(optional, up to {MAX_TAGS})</span>
      </div>

      {value.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand/15 px-2 py-0.5 text-xs text-accent"
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== t))}
                aria-label={`Remove ${t}`}
                className="-mr-0.5 rounded-full p-0.5 text-accent/70 transition hover:bg-brand/20 hover:text-accent"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!atMax && (
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(input);
              }
            }}
            placeholder="Add a tag…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => add(input)}
            disabled={!input.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-ink transition hover:bg-panel/70 disabled:opacity-50"
          >
            <Plus size={13} /> Add
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs text-muted transition hover:border-brand/50 hover:text-accent"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Read-only row of tag chips (on cards and the detail view). */
export function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[10px] text-muted"
        >
          <Tag size={9} className="text-accent/70" /> {t}
        </span>
      ))}
    </div>
  );
}
