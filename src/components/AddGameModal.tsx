import { useEffect, useRef, useState } from "react";
import { X, Store, Heart, Trophy, Plus, Lightbulb, type LucideIcon } from "lucide-react";
import type { GameMeta, GameStatus } from "../types";
import { useStore } from "../store";
import {
  usingRawg,
  fetchGameDetails,
  fetchHltbTimes,
  type HltbTimes,
} from "../lib/gamedata";
import { searchGameSuggestions, sortByRelevance } from "../lib/gameSearch";
import { computeFormula } from "../lib/economy";
import { parsePlaytime, formatPlaytime, formatLength } from "../lib/playtime";
import { copyPlatformOptions } from "../lib/taxonomy";
import { CopyRowsEditor, rowsToCopies, type CopyRowDraft } from "./CopyRowsEditor";
import { CoinIcon } from "./CoinIcon";
import { GameSubmissionForm } from "./GameSubmissionForm";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { emptyCatalogFields } from "../lib/submissions";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

const PLAYSTYLES = [
  { key: "main", title: "Mainline it", desc: "Just the main story" },
  { key: "mainExtra", title: "Full playthrough", desc: "Main + extras" },
  { key: "completionist", title: "Complete it", desc: "100% / completionist" },
] as const;

// Where a newly added game lands. "playing" is intentionally excluded — you
// reach Now Playing by buying a game with coins, not by adding it directly.
/** Where a newly added game lands. Note Now Playing isn't a choice — you reach it
 *  by buying a game out of the Bazaar. */
export type AddDestination = Extract<GameStatus, "backlog" | "wishlist" | "finished">;

const DESTINATIONS: {
  value: AddDestination;
  label: string;
  icon: LucideIcon;
  hint: string;
}[] = [
  {
    value: "backlog",
    label: "Bazaar",
    icon: Store,
    hint: "A game you own — free to add. Buy it with coins later to start playing.",
  },
  {
    value: "wishlist",
    label: "Wishlist",
    icon: Heart,
    hint: "A game you don't own yet. Spend an Import Charter to move it to your Bazaar.",
  },
  {
    value: "finished",
    label: "Finished",
    icon: Trophy,
    hint: "For your collection — a game you've already completed. No coins awarded.",
  },
];

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

/** The board a chosen destination adds to — used in the modal heading ("Add a
 *  game to your …") and the submit button ("Add to …") so both reflect where the
 *  game is actually going. Matches the board/tab names: Bazaar / Wishlist /
 *  Finished. */
export function destinationNoun(destination: AddDestination): string {
  return destination === "wishlist"
    ? "Wishlist"
    : destination === "finished"
      ? "Finished"
      : "Bazaar";
}

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

// Re-exported from the shared search lib so existing importers (and its test)
// keep working; the implementation now lives alongside the search pipeline.
export { sortByRelevance } from "../lib/gameSearch";

/** Whether to show the "no matches — suggest a new game" prompt: a real query was
 *  typed, the search returned nothing, and no game has been picked yet. The pick
 *  check matters because selecting a suggestion clears `results` too — without it
 *  the prompt wrongly fired for an existing game the user just chose. */
export function showAddMissingPrompt(opts: {
  title: string;
  loading: boolean;
  error: string | null;
  resultCount: number;
  rawgId?: number;
  catalogId?: string;
}): boolean {
  return (
    opts.title.trim().length >= 2 &&
    !opts.loading &&
    !opts.error &&
    opts.resultCount === 0 &&
    !opts.rawgId &&
    !opts.catalogId
  );
}

export function AddGameModal({
  onClose,
  defaultDestination = "backlog",
  initialQuery = "",
}: {
  onClose: () => void;
  defaultDestination?: AddDestination;
  // Seed the search/title field — used when a library search comes up empty and
  // the player taps "Add" to go straight from searching to adding.
  initialQuery?: string;
}) {
  const { games, addGame, platformList, economy, fetchCatalogGame, searchCatalogGames, fetchCatalogOverrides, fetchGameScreenshots } =
    useStore();
  // Community screenshots for the picked game, shown as a preview gallery.
  const [previewShots, setPreviewShots] = useState<string[]>([]);

  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the modal instead of leaving the page

  // Form fields (editable, whether typed by hand or auto-filled from a pick).
  const [title, setTitle] = useState(initialQuery);
  const [released, setReleased] = useState("");
  const [hours, setHours] = useState("");
  const [played, setPlayed] = useState("");
  // Draft copies: the platforms the player owns this game on (with optional
  // format, purchase cost, and note). Becomes game.copies on submit.
  const [copyRows, setCopyRows] = useState<CopyRowDraft[]>([]);
  const [destination, setDestination] = useState<AddDestination>(defaultDestination);
  // A live-service / ongoing game (Hearthstone, MTGA, …): exempt from the buy/finish
  // economy — added free to your library and played from the Rotation lane. Seeded
  // from the catalog's is_live_service flag on a pick; user-toggleable.
  const [ongoing, setOngoing] = useState(false);
  // Extra metadata captured from a selected suggestion (cover art, id, genres).
  const [picked, setPicked] = useState<
    Pick<
      GameMeta,
      "rawgId" | "image" | "genres" | "metacritic" | "platforms" | "developers" | "esrb" | "catalogId"
    >
  >({ genres: [] });
  // When the search comes up short, let the user propose the game to the catalog.
  const [suggestNew, setSuggestNew] = useState(false);

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
  const comboRef = useRef<HTMLDivElement>(null); // input + suggestions, for outside-tap dismiss

  const owned = new Set(games.map((g) => g.rawgId).filter(Boolean));
  const ownedCatalog = new Set(games.map((g) => g.catalogId).filter(Boolean));
  // When a suggestion's title exactly matches what's typed, the "add custom" /
  // "suggest new" escape hatches are just noise — the game is right there.
  const hasExactMatch = results.some(
    (r) => r.title.trim().toLowerCase() === title.trim().toLowerCase(),
  );

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
        // Shared pipeline: RAWG/Wikidata results enriched with approved catalog
        // edits, then merged with community games and sorted by relevance.
        const found = await searchGameSuggestions(title.trim(), {
          searchCatalogGames,
          fetchCatalogOverrides,
        });
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
  }, [title, searchCatalogGames, fetchCatalogOverrides]);

  // A tap anywhere outside the suggestions dismisses them. Important on touch,
  // where there's no Escape key — without this you can't get past the dropdown
  // to add a custom game the catalog doesn't list.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [open]);

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
      catalogId: meta.catalogId,
    });
    setResults([]);
    setOpen(false);
    setPreviewShots([]);
    setOngoing(Boolean(meta.ongoing)); // catalog-flagged live-service games seed the toggle
    // Community-added games (catalog id, no RAWG id) load screenshots directly;
    // RAWG-backed games get them from the catalog overlay below.
    if (meta.catalogId && !meta.rawgId) {
      void fetchGameScreenshots({ catalogId: meta.catalogId }).then(setPreviewShots);
    }

    // Best-effort: pull the developer (and any other detail-only fields) in.
    if (usingRawg && meta.rawgId) {
      fetchGameDetails(meta.rawgId)
        .then((extra) => setPicked((prev) => ({ ...prev, ...extra })))
        .catch(() => {});
    }

    // Overlay any approved catalog edits for this game so they become the
    // defaults — not just platforms, but title, cover, genres, release date and
    // length too. A field is applied only when the catalog actually set it.
    if (meta.rawgId) {
      fetchCatalogGame(meta.rawgId)
        .then((c) => {
          if (!c) return;
          setPreviewShots(c.screenshots);
          setPicked((prev) => ({
            ...prev,
            catalogId: c.catalogId,
            image: c.image.trim() ? c.image : prev.image,
            genres: c.genres.length ? c.genres : prev.genres,
            // Catalog platforms are authoritative (add + remove), so replace —
            // merging would bring back a platform an editor removed.
            platforms: c.platforms.length ? c.platforms : prev.platforms,
          }));
          if (c.isLiveService) setOngoing(true);
          if (c.title.trim()) {
            skipSearch.current = true; // don't re-open suggestions on the title set
            setTitle(c.title);
          }
          if (c.released.trim()) setReleased(c.released);
          if (c.hours != null) {
            // Treat the approved length as authoritative so HLTB doesn't override it.
            hoursEdited.current = true;
            setHours(formatLength(c.hours));
          }
        })
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
    setOngoing(false);
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
    catalogId: picked.catalogId,
    ongoing,
  };

  // Owned-copy platforms: restrict to the platforms the picked game released on
  // (when known) so you can't tag a copy on a platform it never shipped on; else
  // offer the whole master list. Existing draft rows keep their chosen platform.
  const platformOptions = copyPlatformOptions(
    picked.platforms,
    platformList,
    copyRows.map((r) => r.platform),
  );

  // An ongoing game is always added free to the library (parked in the Bazaar);
  // it's never bought or finished, so its effective destination is the backlog.
  const effectiveDestination: AddDestination = ongoing ? "backlog" : destination;

  // Mandatory platform: a game you OWN (added to the Bazaar or Finished, and not a
  // free-to-play live-service game) must record which console you own it on, so
  // ownership analytics never have null platforms. Wishlist games aren't owned yet,
  // and ongoing games carry no copies, so neither requires one.
  const ownsGame = !ongoing && effectiveDestination !== "wishlist";
  const hasPlatform = copyRows.some((r) => r.platform.trim());
  const platformMissing = ownsGame && !hasPlatform;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!meta.title) return;
    if (platformMissing) {
      setError("Choose the platform you own this game on before adding it.");
      return;
    }
    // Ongoing games carry no owned-copy cost data — they're free-to-play live games.
    await addGame(
      { ...meta, copies: ongoing ? [] : rowsToCopies(copyRows) },
      effectiveDestination,
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      {suggestNew && (
        <GameSubmissionForm
          kind="new"
          catalogId={null}
          rawgId={null}
          before={null}
          initial={{ ...emptyCatalogFields(), title: title.trim() }}
          onClose={() => setSuggestNew(false)}
        />
      )}
      {/* Deliberately no backdrop-click-to-close: like the other editing modals,
          this form holds in-progress work, so it only closes via the ✕ or Back —
          accidental outside taps shouldn't discard what you've typed. */}
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-display text-xl text-ink">Add a game to your {destinationNoun(effectiveDestination)}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 p-4">
          {/* Title with autocomplete */}
          <label className="text-sm text-muted">
            Title
            <div className="relative mt-1" ref={comboRef}>
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
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
                <ul
                  id="game-autocomplete"
                  role="listbox"
                  className="max-h-72 overflow-y-auto"
                >
                  {results.map((r, i) => {
                    const already =
                      (r.rawgId ? owned.has(r.rawgId) : false) ||
                      (r.catalogId ? ownedCatalog.has(r.catalogId) : false);
                    return (
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
                            {r.catalogId && !r.rawgId ? " · community" : ""}
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
                {/* Escape hatches — hidden when an exact-title match is already
                    listed (then the game is right there to pick). */}
                {!hasExactMatch && (
                  <>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // fire before input blur
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-xs text-muted transition hover:bg-panel"
                    >
                      <Plus size={13} className="shrink-0 text-accent" />
                      <span className="truncate">
                        Not listed? Add <span className="text-ink">{title.trim()}</span> as a custom game
                      </span>
                    </button>
                    {/* Or contribute it to the shared catalog (moderated). */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setOpen(false);
                        setSuggestNew(true);
                      }}
                      className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-xs text-muted transition hover:bg-panel"
                    >
                      <Lightbulb size={13} className="shrink-0 text-accent" />
                      <span className="truncate">
                        Suggest <span className="text-ink">{title.trim()}</span> as a new game for everyone
                      </span>
                    </button>
                  </>
                )}
                </div>
              )}
            </div>
          </label>

          {error && (
            <p className="text-sm text-danger">
              {error} You can still fill the fields in by hand.
            </p>
          )}

          {/* Add Missing Game: the search came up empty AND nothing is picked yet —
              offer to propose it. (After a pick the dropdown clears too, so we must
              also check a game hasn't already been chosen.) */}
          {showAddMissingPrompt({
            title,
            loading,
            error,
            resultCount: results.length,
            rawgId: picked.rawgId,
            catalogId: picked.catalogId,
          }) && (
            <p className="text-xs text-muted">
              No matches found.{" "}
              <button
                type="button"
                onClick={() => setSuggestNew(true)}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Suggest “{title.trim()}” as a new game
              </button>{" "}
              to add it to the catalog for everyone.
            </p>
          )}

          {/* Live-service / ongoing toggle — flips the form into the no-economy mode
              (added free, played from the Rotation lane, never bought or finished). */}
          {meta.title.trim().length > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-line bg-panel/40 p-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={ongoing}
                onChange={(e) => setOngoing(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span>
                Live-service / ongoing game
                <span className="mt-0.5 block text-xs text-subtle">
                  A game with no real ending (Fortnite, Destiny 2, League of Legends, Genshin Impact,
                  …). Added free, with no buy price or finish bounty — play it from the Rotation lane
                  and check in weekly for coins.
                </span>
              </span>
            </label>
          )}

          {/* Playstyle selector — only when HowLongToBeat returned times */}
          {hltb && !ongoing && (
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

          {/* A glimpse of the game — community screenshots for the picked title. */}
          {previewShots.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">Screenshots</span>
              <ScreenshotGallery urls={previewShots} />
            </div>
          )}

          {/* Auto-filled, still editable. Ongoing games have no meaningful length or
              completion time, so only the release date is shown for them. */}
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
            {!ongoing && (
              <>
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
              </>
            )}
          </div>

          {/* Copies you own (or, for a wishlist game, the version you want).
              Platforms are chosen from the controlled master list. Ongoing games
              are typically free-to-play across devices, so owned copies don't apply. */}
          {!ongoing && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">
              {destination === "wishlist" ? "Version you want" : "Owned on"}
              {ownsGame && <span className="text-danger"> *</span>}{" "}
              <span className="text-xs text-subtle">
                {destination === "wishlist"
                  ? "— the platform/edition you plan to get (optional)"
                  : "— pick the platform you own it on (cost & format optional)"}
              </span>
            </span>
            <CopyRowsEditor
              rows={copyRows}
              onChange={setCopyRows}
              platformOptions={platformOptions}
              showCost={destination !== "wishlist"}
              addLabel={destination === "wishlist" ? "Add a version" : "Add a copy"}
            />
            {platformMissing && (
              <p className="text-xs text-danger">
                Add a copy and choose its platform to record what you own it on.
              </p>
            )}
          </div>
          )}

          {/* Where it lands: Bazaar (buyable), Wishlist, or Finished (collection).
              An ongoing game is always added free to your library, so the picker is
              hidden and a short note explains where it goes instead. */}
          {ongoing ? (
            <p className="rounded-lg border border-line bg-panel/40 p-2.5 text-xs text-muted">
              Added free to your library. Open it and choose{" "}
              <span className="font-medium text-ink">Add to Rotation</span> to start playing and earn
              weekly check-in coins.
            </p>
          ) : (
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
          )}

          {title.trim() && destination === "backlog" && !ongoing && (
            <p className="text-xs text-muted">
              Estimated price:{" "}
              <span className="inline-flex items-center gap-1 font-medium text-accent">
                <CoinIcon size={12} /> {computeFormula(meta, economy.price)}
              </span>
            </p>
          )}

          <button
            type="submit"
            disabled={!meta.title || platformMissing}
            className="rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ongoing ? "Add to Library — free" : `Add to ${destinationNoun(destination)}`}
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
