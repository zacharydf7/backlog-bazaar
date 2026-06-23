import { useEffect, useRef, useState } from "react";
import type { GameMeta } from "../types";
import { useStore } from "../store";
import { searchGames } from "../lib/gamedata";
import { formatPlaytime } from "../lib/playtime";
import { sortByRelevance } from "./AddGameModal";

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

/** A lightweight game-search input with an autocomplete dropdown, sharing the same
 *  catalog/RAWG sources as Add Game. Free text is allowed (the field is a plain
 *  controlled input); picking a suggestion fires `onPick` with that game's
 *  metadata so the caller can autofill length, cover art, etc. Kept deliberately
 *  simple (no "suggest a new game" escape hatches) for reuse in compact rows. */
export function GameSearchBox({
  value,
  onChange,
  onPick,
  placeholder,
  ariaLabel,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (meta: GameMeta) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { searchCatalogGames } = useStore();
  const [results, setResults] = useState<GameMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const reqId = useRef(0);
  const skipSearch = useRef(false); // don't re-search right after a pick
  const interacted = useRef(false); // only search once the user has typed
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    // Don't auto-search a value the field mounted with (e.g. an edit form's
    // pre-filled game name) — that would pop the dropdown open unprompted.
    if (!interacted.current) return;
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const [found, community] = await Promise.all([
          searchGames(value.trim()).catch(() => [] as GameMeta[]),
          searchCatalogGames(value.trim()).catch(() => [] as GameMeta[]),
        ]);
        if (id !== reqId.current) return;
        const seenRawg = new Set(found.map((r) => r.rawgId).filter(Boolean));
        const seenTitle = new Set(found.map((r) => r.title.toLowerCase()));
        const extra = community.filter(
          (c) => !(c.rawgId && seenRawg.has(c.rawgId)) && !seenTitle.has(c.title.toLowerCase()),
        );
        setResults(sortByRelevance([...found, ...extra], value.trim()).slice(0, 8));
        setHighlight(0);
        setOpen(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [value, searchCatalogGames]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [open]);

  function pick(meta: GameMeta) {
    skipSearch.current = true;
    onChange(meta.title);
    onPick(meta);
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight((h) => (h + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((h) => (h - 1 + results.length) % results.length);
        break;
      case "Enter": {
        e.preventDefault();
        const choice = results[highlight];
        if (choice) pick(choice);
        break;
      }
      case "Escape":
        setOpen(false);
        break;
    }
  }

  return (
    <div className="relative min-w-0 flex-1" ref={boxRef}>
      <input
        value={value}
        onChange={(e) => {
          interacted.current = true;
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={className}
      />
      {loading && (
        <span className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand" />
      )}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
          <ul role="listbox" className="max-h-60 overflow-y-auto">
            {results.map((r, i) => (
              <li
                key={r.rawgId ?? r.catalogId ?? r.title}
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // fire before input blur
                  pick(r);
                }}
                className={
                  "flex cursor-pointer items-center gap-2 px-2 py-1.5 " +
                  (i === highlight ? "bg-panel" : "")
                }
              >
                <div className="h-8 w-12 flex-shrink-0 overflow-hidden rounded bg-panel">
                  {r.image && <img src={r.image} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{r.title}</div>
                  <div className="text-[11px] text-subtle">
                    {year(r.released)} · {r.hours ? formatPlaytime(r.hours) : "length ?"}
                    {r.catalogId && !r.rawgId ? " · community" : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
