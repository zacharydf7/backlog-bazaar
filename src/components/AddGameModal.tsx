import { useEffect, useRef, useState } from "react";
import { X, Store, Heart, Trophy, type LucideIcon } from "lucide-react";
import type { GameMeta, GameStatus } from "../types";
import { useStore } from "../store";
import {
  searchGames,
  usingRawg,
  fetchGameDetails,
  fetchHltbTimes,
  type HltbTimes,
} from "../lib/gamedata";
import { computeFormula } from "../lib/economy";
import { parsePlaytime, formatPlaytime, formatLength } from "../lib/playtime";
import { ownedPlatformLabels } from "../lib/platforms";
import { CopyRowsEditor, rowsToCopies, type CopyRowDraft } from "./CopyRowsEditor";
import { CoinIcon } from "./CoinIcon";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

const PLAYSTYLES = [
  { key: "main", title: "Mainline it", desc: "Just the main story" },
  { key: "mainExtra", title: "Full playthrough", desc: "Main + extras" },
  { key: "completionist", title: "Complete it", desc: "100% / completionist" },
] as const;

// Where a newly added game lands. "playing" is intentionally excluded — you
// reach Now Playing by buying a game with coins, not by adding it directly.
const DESTINATIONS: {
  value: Extract<GameStatus, "backlog" | "wishlist" | "finished">;
  label: string;
  icon: LucideIcon;
  hint: string;
}[] = [
  { value: "backlog", label: "Bazaar", icon: Store, hint: "Buy it with coins to start playing." },
  { value: "wishlist", label: "Wishlist", icon: Heart, hint: "Can't play it yet — save it for later." },
  {
    value: "finished",
    label: "Finished",
    icon: Trophy,
    hint: "For your collection — a game you've already completed. No coins awarded.",
  },
];

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

export function AddGameModal({ onClose }: { onClose: () => void }) {
  const { games, addGame, myPlatforms, customPlatforms, economy } = useStore();
  const platformOptions = ownedPlatformLabels(myPlatforms, customPlatforms);

  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the modal instead of leaving the page

  // Form fields (editable, whether typed by hand or auto-filled from a pick).
  const [title, setTitle] = useState("");
  const [released, setReleased] = useState("");
  const [hours, setHours] = useState("");
  const [played, setPlayed] = useState("");
  // Draft copies: the platforms the player owns this game on (with optional
  // format, purchase cost, and note). Becomes game.copies on submit.
  const [copyRows, setCopyRows] = useState<CopyRowDraft[]>([]);
  const [destination, setDestination] =
    useState<(typeof DESTINATIONS)[number]["value"]>("backlog");
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
    // Tentative length from RAWG; HowLongToBeat overrides it below when available.
    setHours(formatLength(meta.hours));
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
        if (!hoursEdited.current) setHours(formatLength(times[style]));
      })
      .catch(() => {})
      .finally(() => setLoadingLength(false));
  }

  function selectPlaystyle(style: keyof HltbTimes) {
    setPlaystyle(style);
    const value = hltb?.[style];
    if (value) {
      hoursEdited.current = false;
      setHours(formatLength(value));
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
    hours: parsePlaytime(hours) ?? undefined,
    playedHours: parsePlaytime(played) ?? undefined,
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
    await addGame({ ...meta, copies: rowsToCopies(copyRows) }, destination);
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
                            {year(r.released)} · {r.hours ? formatPlaytime(r.hours) : "length ?"}
                            {already ? " · in your Bazaar" : ""}
                          </div>
                        </div>
                        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-accent">
                          <CoinIcon size={12} /> {computeFormula(r, economy.price)}
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
                      <div className="mt-1 font-display text-lg text-accent">
                        {formatPlaytime(value)}
                      </div>
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
              Length
              {loadingLength && <span className="text-accent"> · finding…</span>}
              <input
                type="text"
                value={hours}
                onChange={(e) => {
                  setHours(e.target.value);
                  hoursEdited.current = true;
                }}
                placeholder="e.g. 12h or 1h 30m"
                className={inputClass}
              />
            </label>
            <label className="text-sm text-muted">
              Played
              <input
                type="text"
                value={played}
                onChange={(e) => setPlayed(e.target.value)}
                placeholder="e.g. 20h or 1h 30m"
                className={inputClass}
              />
            </label>
          </div>

          {/* Copies you own this game on (optional). Platform suggestions come
              from the consoles you own; type any other platform to add it (it's
              saved to your account). Each copy can be Physical/Digital + a cost. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">
              Owned on{" "}
              <span className="text-xs text-subtle">
                — your platforms, format, and what each cost (optional)
              </span>
            </span>
            <CopyRowsEditor
              rows={copyRows}
              onChange={setCopyRows}
              platformOptions={platformOptions}
              listId="add-platform-options"
            />
          </div>

          {/* Where it lands: Bazaar (buyable), Wishlist, or Finished (collection) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Add to</span>
            <div className="grid grid-cols-3 gap-2">
              {DESTINATIONS.map((d) => {
                const Icon = d.icon;
                const active = destination === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDestination(d.value)}
                    aria-pressed={active}
                    className={
                      "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition " +
                      (active
                        ? "border-brand bg-brand/10 text-ink"
                        : "border-line bg-panel text-muted hover:border-brand/50")
                    }
                  >
                    <Icon size={15} className={active ? "text-accent" : ""} /> {d.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-subtle">{DESTINATIONS.find((d) => d.value === destination)!.hint}</p>
          </div>

          {title.trim() && destination === "backlog" && (
            <p className="text-xs text-muted">
              Estimated price:{" "}
              <span className="inline-flex items-center gap-1 font-medium text-accent">
                <CoinIcon size={12} /> {computeFormula(meta, economy.price)}
              </span>
            </p>
          )}

          <button
            type="submit"
            disabled={!meta.title}
            className="rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {destination === "wishlist"
              ? "Add to Wishlist"
              : destination === "finished"
                ? "Add to Collection"
                : "Add to Bazaar"}
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
