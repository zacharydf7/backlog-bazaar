import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { GameMeta } from "../types";
import { useStore } from "../store";
import {
  searchGames,
  usingRawg,
  fetchGameDetails,
  fetchHltbTimes,
  type HltbTimes,
} from "../lib/gamedata";
import { computePrice } from "../lib/pricing";

const PLAYSTYLES = [
  { key: "main", title: "Mainline it", desc: "Just the main story" },
  { key: "mainExtra", title: "Full playthrough", desc: "Main + extras" },
  { key: "completionist", title: "Complete it", desc: "100% / completionist" },
] as const;

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

export function AddGameModal({ onClose }: { onClose: () => void }) {
  const { games, addGame } = useStore();

  // Form fields (editable, whether typed by hand or auto-filled from a pick).
  const [title, setTitle] = useState("");
  const [released, setReleased] = useState("");
  const [hours, setHours] = useState("");
  const [rating, setRating] = useState("");
  // Extra metadata captured from a selected suggestion (cover art, id, genres).
  const [picked, setPicked] = useState<
    Pick<
      GameMeta,
      "rawgId" | "image" | "genres" | "metacritic" | "platforms" | "developers" | "esrb"
    >
  >({ genres: [] });

  // Autocomplete state.
  const [results, setResults] = useState<GameMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [loadingLength, setLoadingLength] = useState(false);
  const [hltb, setHltb] = useState<HltbTimes | null>(null);
  const [playstyle, setPlaystyle] = useState<keyof HltbTimes>("main");

  const reqId = useRef(0); // discards out-of-order responses
  const skipSearch = useRef(false); // don't re-search right after a pick
  const hoursEdited = useRef(false); // user typed a length by hand

  const owned = new Set(games.map((g) => g.rawgId).filter(Boolean));

  // Debounced autocomplete search on the title field.
  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    // Require 2+ chars before searching — avoids wasteful one-letter API calls.
    if (title.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await searchGames(title.trim());
        if (id !== reqId.current) return;
        setResults(found);
        setHighlight(0);
        setOpen(true);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : "Search failed.");
        setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [title]);

  function pick(meta: GameMeta) {
    skipSearch.current = true; // the title change below shouldn't trigger a search
    hoursEdited.current = false;
    setTitle(meta.title);
    setReleased(meta.released ?? "");
    setRating(meta.rating != null ? String(meta.rating) : "");
    // Tentative length from RAWG; HowLongToBeat overrides it below when available.
    setHours(meta.hours && meta.hours > 0 ? String(meta.hours) : "");
    setHltb(null);
    setPlaystyle("main");
    setPicked({
      rawgId: meta.rawgId,
      image: meta.image,
      genres: meta.genres,
      metacritic: meta.metacritic,
      platforms: meta.platforms,
      developers: meta.developers,
      esrb: meta.esrb,
    });
    setResults([]);
    setOpen(false);

    // Best-effort: pull the developer (and any other detail-only fields) in.
    if (usingRawg && meta.rawgId) {
      fetchGameDetails(meta.rawgId)
        .then((extra) => setPicked((prev) => ({ ...prev, ...extra })))
        .catch(() => {});
    }

    // HowLongToBeat is the preferred length source (RAWG playtime is the fallback,
    // already set above; blank if neither). Defaults to the main-story estimate.
    setLoadingLength(true);
    fetchHltbTimes(meta.title)
      .then((times) => {
        if (!times) return;
        setHltb(times);
        const style: keyof HltbTimes = times.main
          ? "main"
          : times.mainExtra
            ? "mainExtra"
            : "completionist";
        setPlaystyle(style);
        if (!hoursEdited.current) setHours(String(times[style]));
      })
      .catch(() => {})
      .finally(() => setLoadingLength(false));
  }

  function selectPlaystyle(style: keyof HltbTimes) {
    setPlaystyle(style);
    const value = hltb?.[style];
    if (value) {
      hoursEdited.current = false;
      setHours(String(value));
    }
  }

  function onTitleChange(value: string) {
    setTitle(value);
    // Manual edits invalidate the previously picked game's hidden metadata.
    setPicked({ genres: [] });
    setHltb(null);
  }

  function onTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
        e.preventDefault(); // don't submit the form; pick instead
        const choice = results[highlight];
        if (choice) pick(choice);
        break;
      }
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  const meta: GameMeta = {
    title: title.trim(),
    released: released || undefined,
    hours: hours ? Number(hours) : undefined,
    rating: rating ? Number(rating) : undefined,
    rawgId: picked.rawgId,
    image: picked.image,
    genres: picked.genres ?? [],
    metacritic: picked.metacritic,
    platforms: picked.platforms,
    developers: picked.developers,
    esrb: picked.esrb,
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!meta.title) return;
    await addGame(meta);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-display text-xl text-ink">Add a game to your Bazaar</h2>
          <button onClick={onClose} className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          {/* Title with autocomplete */}
          <label className="text-sm text-muted">
            Title
            <div className="relative mt-1">
              <input
                autoFocus
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                onKeyDown={onTitleKeyDown}
                onFocus={() => results.length > 0 && setOpen(true)}
                role="combobox"
                aria-expanded={open}
                aria-controls="game-autocomplete"
                aria-autocomplete="list"
                placeholder="Start typing… (e.g. Zelda Breath of the Wild)"
                className="w-full rounded-lg border border-line bg-panel px-3 py-2 pr-10 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              {loading && (
                <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand" />
              )}

              {open && results.length > 0 && (
                <ul
                  id="game-autocomplete"
                  role="listbox"
                  className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl"
                >
                  {results.map((r, i) => {
                    const already = r.rawgId ? owned.has(r.rawgId) : false;
                    return (
                      <li
                        key={r.rawgId ?? r.title}
                        role="option"
                        aria-selected={i === highlight}
                        onMouseEnter={() => setHighlight(i)}
                        onMouseDown={(e) => {
                          e.preventDefault(); // fire before input blur
                          pick(r);
                        }}
                        className={
                          "flex cursor-pointer items-center gap-3 px-2 py-2 " +
                          (i === highlight ? "bg-panel" : "")
                        }
                      >
                        <div className="h-10 w-14 flex-shrink-0 overflow-hidden rounded bg-panel">
                          {r.image && (
                            <img src={r.image} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-ink">{r.title}</div>
                          <div className="text-xs text-subtle">
                            {year(r.released)} · {r.hours ? `${r.hours}h` : "length ?"}
                            {already ? " · in your Bazaar" : ""}
                          </div>
                        </div>
                        <span className="flex-shrink-0 text-xs text-accent">
                          🪙 {computePrice(r)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </label>

          {error && (
            <p className="text-sm text-danger">
              {error} You can still fill the fields in by hand.
            </p>
          )}

          {/* Playstyle selector — only when HowLongToBeat returned times */}
          {hltb && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">
                How do you want to play?{" "}
                <span className="text-xs text-subtle">— sets the length (HowLongToBeat)</span>
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PLAYSTYLES.map((ps) => {
                  const value = hltb[ps.key];
                  if (!value) return null;
                  const active = playstyle === ps.key;
                  return (
                    <button
                      key={ps.key}
                      type="button"
                      onClick={() => selectPlaystyle(ps.key)}
                      className={
                        "rounded-xl border px-3 py-2 text-left transition " +
                        (active
                          ? "border-brand bg-brand/10"
                          : "border-line bg-panel hover:border-brand/50")
                      }
                    >
                      <div className="text-sm font-medium text-ink">{ps.title}</div>
                      <div className="text-xs text-subtle">{ps.desc}</div>
                      <div className="mt-1 font-display text-lg text-accent">{value}h</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-filled, still editable */}
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm text-muted">
              Release date
              <input
                type="date"
                value={released}
                onChange={(e) => setReleased(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-muted">
              Length (h)
              {loadingLength && <span className="text-accent"> · finding…</span>}
              <input
                type="number"
                min="0"
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  hoursEdited.current = true;
                }}
                className={inputClass}
              />
            </label>
            <label className="text-sm text-muted">
              Rating (0–5)
              <input
                type="number"
                min="0"
                max="5"
                step="any"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {title.trim() && (
            <p className="text-xs text-muted">
              Estimated price: <span className="font-medium text-accent">🪙 {computePrice(meta)}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={!meta.title}
            className="rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to Backlog
          </button>

          {!usingRawg && (
            <p className="text-center text-xs text-subtle">
              Suggestions from Wikidata (no key needed). Game length isn&apos;t available here —
              type it in. Add a RAWG key to <code>.env</code> for auto-filled length, ratings &amp;
              cover art.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
