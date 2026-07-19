import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Store, Heart, Trophy, Plus, Lightbulb, Flag, FlagOff, Package, Lock, CalendarClock, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";
import type { Game, GameCopy, GameMeta, GameStatus } from "../types";
import { FINISH_TAGS, type FinishTag } from "../lib/finishTags";
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
import { copyPlatformOptions, canonicalizeTerms, missingFromVerified } from "../lib/taxonomy";
import {
  routeAdd,
  libraryPresence,
  versionHoursFromRows,
  versionHoursForGroup,
  type AddRouteDecision,
  type PlatformAddGroup,
} from "../lib/addRouting";
import { findExpandTemplate } from "../lib/compilationGrouping";
import { buildPlaytimeRows, type PlaytimeBreakdown } from "../lib/platformPlaytime";
import { ownedVersions, versionLabel } from "../lib/copies";
import { STATUS_LABEL } from "../lib/status";
import { CopyRowsEditor, rowsToCopies, type CopyRowDraft } from "./CopyRowsEditor";
import { PlayedByVersionFields } from "./PlayedByVersionFields";
import { ConfirmDialog } from "./ConfirmDialog";
import { CoinIcon } from "./CoinIcon";
import { GameSubmissionForm } from "./GameSubmissionForm";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { emptyCatalogFields, type CatalogFields } from "../lib/submissions";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { canOfferPreorder } from "../lib/preorders";

// Per-version playtime rows for a game being added: nothing is logged yet, so
// the rows come purely from the draft copies (an empty breakdown).
const EMPTY_BREAKDOWN: PlaytimeBreakdown = { byVersion: [], unattributed: 0, lastVersion: null };

// Lucide icons for each finish tag (FINISH_TAGS keeps the icon as a string so the
// catalog stays framework-free; resolve them here at the call site).
const FINISH_TAG_ICONS: Record<FinishTag, LucideIcon> = {
  beaten: Flag,
  completed: Trophy,
  endless: InfinityIcon,
  retired: FlagOff,
};

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

/** The "you already have this" tag on a search suggestion, by where it lives. */
const PRESENCE_LABEL: Record<GameStatus, string> = {
  wishlist: "on your Wishlist",
  backlog: "in your Bazaar",
  playing: "in Now Playing",
  finished: "in your Finished",
};

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
  initialPick,
}: {
  onClose: () => void;
  defaultDestination?: AddDestination;
  // Seed the search/title field — used when a library search comes up empty and
  // the player taps "Add" to go straight from searching to adding.
  initialQuery?: string;
  /** Pre-pick a game on open, exactly as if the user searched and selected it —
   *  used by the game hub's Library tab ("Add another platform") so recording a
   *  second-platform copy skips the search step. The form stays fully editable
   *  and all the usual routing (duplicate block, confirm plan, wishlist
   *  intercepts) applies unchanged. */
  initialPick?: GameMeta;
}) {
  const { games, addGame, attachCopies, removeGame, trackEditions, platformList, economy, fetchCatalogGame, searchCatalogGames, fetchCatalogOverrides, fetchGameScreenshots, submitGameSubmission, parentTemplates, setPreorder } =
    useStore();
  // Community screenshots for the picked game, shown as a preview gallery.
  const [previewShots, setPreviewShots] = useState<string[]>([]);

  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the modal instead of leaving the page

  // Form fields (editable, whether typed by hand or auto-filled from a pick).
  const [title, setTitle] = useState(initialQuery);
  const [released, setReleased] = useState("");
  const [hours, setHours] = useState("");
  // Per-version "hours played" drafts, keyed by playtime-row key (one input per
  // platform/version you're adding a copy on — see playedRows below).
  const [playedDrafts, setPlayedDrafts] = useState<Record<string, string>>({});
  // A non-clean routing decision awaiting the user's confirmation (the game is
  // already in the library or on the wishlist). null = no dialog.
  const [pending, setPending] = useState<AddRouteDecision | null>(null);
  // Draft copies: the platforms the player owns this game on (with optional
  // format, purchase cost, and note). Becomes game.copies on submit.
  const [copyRows, setCopyRows] = useState<CopyRowDraft[]>([]);
  const [destination, setDestination] = useState<AddDestination>(defaultDestination);
  // How a game added straight to Finished concluded (Beaten / Completed / Endless),
  // assigned right away so the Finished board is categorized from the start.
  const [finishTag, setFinishTag] = useState<FinishTag>("beaten");
  // A live-service / ongoing game (Hearthstone, MTGA, …): exempt from the buy/finish
  // economy — added free to your library and played from the Rotation lane. Seeded
  // from the catalog's is_live_service flag on a pick; user-toggleable.
  const [ongoing, setOngoing] = useState(false);
  // Add the game already hidden from visitors, instead of adding then toggling
  // Private on its card (issue d2229900). Owner-only; never touches the economy.
  const [isPrivate, setIsPrivate] = useState(false);
  // Wishlist adds: the game was already pre-ordered when it's being added —
  // it lands marked, with an optional expected date (issue: pre-orders).
  const [preorderOn, setPreorderOn] = useState(false);
  const [preorderDate, setPreorderDate] = useState("");
  // Extra metadata captured from a selected suggestion (cover art, id, genres).
  const [picked, setPicked] = useState<
    Pick<
      GameMeta,
      "rawgId" | "image" | "genres" | "metacritic" | "platforms" | "developers" | "esrb" | "catalogId"
    >
  >({ genres: [] });
  // When the search comes up short, let the user propose the game to the catalog.
  const [suggestNew, setSuggestNew] = useState(false);
  // "Missing platform?" escape hatch: widen the owned-copy platform choices from the
  // game's verified release list to the full master list. Picking one the game isn't
  // listed on still adds the game now and quietly files a platform edit-suggestion.
  const [allPlatforms, setAllPlatforms] = useState(false);

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
    setAllPlatforms(false); // a fresh pick re-restricts copies to its release list
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

  // A pre-picked game (Library tab's "Add another platform") seeds the form on
  // open through the exact same path a searched-and-selected suggestion takes.
  useEffect(() => {
    if (initialPick) pick(initialPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setAllPlatforms(false);
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

  // The game's verified release platforms (canonicalized). When known, owned-copy
  // choices are restricted to these — unless the user opens "Missing platform?",
  // which widens to the whole master list. A global catalog/RAWG target is needed
  // to file a suggestion, so the escape hatch only appears then.
  const verifiedPlatforms = canonicalizeTerms(picked.platforms, platformList);
  const platformRestricted = verifiedPlatforms.length > 0;
  const hasGlobalTarget = Boolean(picked.rawgId || picked.catalogId);
  const canRequestPlatform = platformRestricted && hasGlobalTarget;

  // The picked game is a moderator-linked compilation — surface a passive hint
  // that the single card can be expanded into its games after adding.
  const knownCompilation = hasGlobalTarget
    ? findExpandTemplate(
        { rawgId: picked.rawgId, catalogId: picked.catalogId, status: "backlog", compilationId: null },
        parentTemplates,
      )
    : null;

  // Owned-copy platforms: restrict to the platforms the picked game released on
  // (when known) so you can't tag a copy on a platform it never shipped on; else
  // (or once "Missing platform?" is opened) offer the whole master list. Existing
  // draft rows always keep their chosen platform.
  const platformOptions = copyPlatformOptions(
    allPlatforms ? undefined : picked.platforms,
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

  // The copies as they'd be submitted right now — drives the per-version played
  // rows and the live routing validation below.
  const draftCopies = useMemo(() => (ongoing ? [] : rowsToCopies(copyRows)), [copyRows, ongoing]);

  // One "hours played" input per version being added, matching the Edit modal's
  // "Played by platform" component exactly (and its trackEditions behavior). With
  // no copies yet this collapses to a single plain "Played" field.
  const playedRows = useMemo(
    () => buildPlaytimeRows(ownedVersions(draftCopies), EMPTY_BREAKDOWN, { byPlatform: !trackEditions }),
    [draftCopies, trackEditions],
  );

  // Keep drafts keyed to the live rows; when the single generic "Played" field
  // gains its platform (the first copy is added), the typed value carries over.
  const prevSingleKey = useRef<string | null>(null);
  useEffect(() => {
    setPlayedDrafts((prev) => {
      const single = playedRows.length === 1;
      const carry =
        single && prevSingleKey.current && prev[prevSingleKey.current] != null
          ? prev[prevSingleKey.current]
          : null;
      const next: Record<string, string> = {};
      for (const r of playedRows) next[r.key] = prev[r.key] ?? carry ?? "";
      prevSingleKey.current = single ? playedRows[0].key : null;
      return next;
    });
  }, [playedRows]);

  // Live pre-submission routing: how this add would land against the existing
  // library + wishlist. Wishlist version conflicts block inline (before submit);
  // the other non-clean decisions raise a confirmation dialog on submit.
  const liveDecision = useMemo(
    () =>
      routeAdd({
        games,
        meta: { rawgId: picked.rawgId, catalogId: picked.catalogId },
        destination: effectiveDestination,
        copies: draftCopies,
      }),
    [games, picked.rawgId, picked.catalogId, effectiveDestination, draftCopies],
  );
  const duplicateBlocked =
    liveDecision.kind === "blocked-duplicate-version" ? liveDecision : null;

  // "Missing platform?": if a copy is tagged on a platform this catalogued game
  // isn't verified for, seamlessly file a platform edit-suggestion (the game is
  // already in the library). The only proposed change is `platforms`, so a
  // moderator can approve just that field; on approval it joins the game's
  // verified list for everyone and the submitter is notified — exactly the manual
  // "suggest an edit" flow, filed for them.
  async function fileMissingPlatformSuggestion(copies: GameCopy[]) {
    if (!hasGlobalTarget) return;
    const missing = missingFromVerified(
      copies.map((c) => c.platform),
      picked.platforms,
      platformList,
    );
    if (missing.length === 0) return;
    const baseline: CatalogFields = {
      title: meta.title,
      image: picked.image ?? "",
      platforms: verifiedPlatforms,
      genres: picked.genres ?? [],
      developers: picked.developers ?? [],
      released: released || "",
      hours: parsePlaytime(hours) ?? null,
      screenshots: previewShots,
      isLiveService: ongoing,
    };
    await submitGameSubmission({
      kind: "edit",
      catalogId: picked.catalogId ?? null,
      rawgId: picked.rawgId ?? null,
      proposed: {
        ...baseline,
        platforms: canonicalizeTerms([...verifiedPlatforms, ...missing], platformList),
      },
      before: baseline,
    }).catch(() => {});
  }

  // Execute a routed plan: each group either attaches its copies to the
  // existing same-platform instance or inserts its own new row; fulfilled
  // wishlist entries are removed LAST (add-first ordering — a failed add never
  // orphans an entry; the deletes are audited server-side).
  async function executePlan(groups: PlatformAddGroup[], intercepts: Game[]) {
    const allCopies = groups.flatMap((g) => g.copies);
    const hours = ownsGame ? versionHoursFromRows(playedRows, playedDrafts) : [];
    // "This is a pre-order" (Bazaar adds only): new rows land marked — locked
    // until release; a version attaching to an EXISTING Bazaar card marks
    // that card too. canOfferPreorder re-guards a stale tick left from before
    // the picker switched to an already-released catalog game (the checkbox
    // itself is hidden for those).
    const preorderPlan =
      effectiveDestination === "backlog" && preorderOn && canOfferPreorder(meta.released)
        ? { expectedOn: preorderDate.trim() || null }
        : undefined;
    for (const g of groups) {
      const slice = versionHoursForGroup(hours, g.platform);
      if (g.action === "attach" && g.target) {
        await attachCopies(
          g.target.id,
          g.copies,
          effectiveDestination === "wishlist" ? undefined : slice,
        );
        if (preorderPlan && g.target.status === "backlog") {
          await setPreorder(g.target.id, preorderPlan.expectedOn);
        }
      } else {
        await addGame(
          { ...meta, copies: g.copies },
          effectiveDestination,
          effectiveDestination === "finished" ? finishTag : null,
          {
            versionHours: ownsGame ? slice : undefined,
            private: isPrivate,
            preorder: preorderPlan,
          },
        );
      }
    }
    for (const w of intercepts) await removeGame(w.id);
    await fileMissingPlatformSuggestion(allCopies);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!meta.title) return;
    if (platformMissing) {
      setError("Choose the platform you own this game on before adding it.");
      return;
    }
    if (duplicateBlocked) return; // surfaced inline; the button is disabled too
    // Ongoing games carry no owned-copy cost data — they're free-to-play live games.
    const copies = ongoing ? [] : rowsToCopies(copyRows);
    // Pre-submission routing: the request is split per platform; anything that
    // lands on or beside existing instances halts here for the user's
    // confirmation (see the plan ConfirmDialog below).
    const decision = routeAdd({
      games,
      meta: { rawgId: picked.rawgId, catalogId: picked.catalogId },
      destination: effectiveDestination,
      copies,
    });
    if (decision.kind === "blocked-duplicate-version") return; // inline, like duplicateBlocked
    if (decision.kind === "confirm-plan") {
      setPending(decision);
      return;
    }
    await executePlan(decision.groups, []);
    onClose();
  }

  // Carry out a confirmed plan. See src/lib/addRouting.ts for the semantics.
  async function confirmPending() {
    if (!pending || pending.kind !== "confirm-plan") return;
    await executePlan(pending.groups, pending.intercepts);
    setPending(null);
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
      {/* Pre-submission routing confirmation: the add lands on or beside
          existing instances. One dialog lists where each platform's copy goes
          (attach vs its own new card) and warns when a fulfilled Wishlist
          entry will be removed (charter bypass). */}
      {pending && pending.kind === "confirm-plan" && (
        createPortal(
          <ConfirmDialog
            title={
              pending.intercepts.length > 0 ? "It's on your Wishlist" : "You already have this game"
            }
            tone={pending.intercepts.length > 0 ? "danger" : undefined}
            body={
              <>
                <span className="font-medium text-ink">{meta.title}</span> is already in your
                collection. Each platform is its own card — here&apos;s how this add lands:
                <ul className="mt-2 flex flex-col gap-1">
                  {pending.groups.map((g, i) => (
                    <li key={g.platform ?? `x${i}`} className="flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      <span>
                        <span className="font-medium text-ink">{g.platform ?? "This game"}</span>
                        {g.action === "attach" && g.target
                          ? effectiveDestination === "wishlist"
                            ? " — added to your existing Wishlist entry"
                            : ` — attaches to your existing card in ${STATUS_LABEL[g.target.status]}`
                          : ` — its own new card in your ${destinationNoun(effectiveDestination)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {pending.intercepts.length > 0 && (
                  <p className="mt-2">
                    Your fulfilled Wishlist entr{pending.intercepts.length === 1 ? "y" : "ies"} for
                    it will be removed — adding directly bypasses the Import Charter system. Cancel
                    if you&apos;d rather import from your Wishlist with a Charter.
                  </p>
                )}
              </>
            }
            confirmLabel={pending.intercepts.length > 0 ? "Add anyway" : "Add"}
            onConfirm={() => void confirmPending()}
            onCancel={() => setPending(null)}
          />,
          document.body,
        )
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
                    // Status-aware presence: a wishlisted match says so, rather
                    // than the old blanket "in your Bazaar".
                    const presence = libraryPresence(games, r);
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
                            {presence ? ` · ${PRESENCE_LABEL[presence]}` : ""}
                          </div>
                        </div>
                        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-accent">
                          <CoinIcon size={12} /> {computeFormula(r, economy.price)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {/* Escape hatches — ALWAYS shown, even when an exact-title match
                    is listed, so title collisions (reboots, remakes, same-named
                    legacy games) never block adding or requesting the right game.
                    "Request a new addition" is appended at the very bottom. */}
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
                {/* Contribute the game to the shared catalog (moderated). The
                    static label bypasses the exact-match check so duplicate-title
                    games can still be requested. */}
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
                    Don&apos;t see your specific game? Request a new addition
                  </span>
                </button>
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

          {/* Passive heads-up when the picked game IS a moderator-linked
              compilation: no routing change, just sets expectations that the
              single card can later be split into its games. */}
          {knownCompilation && (
            <p className="flex items-start gap-1.5 rounded-lg border border-accent/30 bg-accent/5 p-2.5 text-xs text-accent">
              <Package size={14} className="mt-px shrink-0" />
              <span>
                A known compilation — after adding it you can expand the card into its{" "}
                {knownCompilation.games.length} individual games from its ⋮ menu.
              </span>
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

          {/* Length is HLTB-driven when times exist: the playstyle chips above
              are then the only length control, so the free-text field only
              shows when HowLongToBeat has nothing. (When an approved catalog
              length exists it stays authoritative via hoursEdited until a chip
              is explicitly clicked.) The release date is no longer entered —
              a recognized pick still carries it silently into the catalog. */}
          {!ongoing && !hltb && (
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
          )}

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
              // Missing-platform escape hatch, offered at the bottom of the
              // platform dropdown itself (issue 9aacac99) — only while the
              // choices are actually restricted to a known release list and
              // there's a catalog/RAWG game to suggest an edit against.
              onShowAllPlatforms={
                canRequestPlatform && !allPlatforms ? () => setAllPlatforms(true) : undefined
              }
            />
            {platformMissing && (
              <p className="text-xs text-danger">
                Add a copy and choose its platform to record what you own it on.
              </p>
            )}
            {/* Version-level duplicate validation, consistent across every
                board. The block can come from an OWNED card (a copy colliding
                with a version you have — same platform with the same or an
                unspecified format) or from the Wishlist entry itself (nothing
                new to add) — say which. */}
            {duplicateBlocked && (
              <p className="text-xs text-danger">
                {duplicateBlocked.target.status === "wishlist" ? (
                  duplicateBlocked.duplicateVersions.length > 0 ? (
                    <>
                      Your Wishlist already lists{" "}
                      <span className="font-medium">
                        {duplicateBlocked.duplicateVersions
                          .map((v) => versionLabel(v.platform, v.format))
                          .join(", ")}
                      </span>{" "}
                      — add a version it doesn&apos;t have yet.
                    </>
                  ) : (
                    "This game is already on your Wishlist — add a version it doesn't list yet."
                  )
                ) : duplicateBlocked.duplicateVersions.length > 0 ? (
                  <>
                    You already own{" "}
                    <span className="font-medium">
                      {duplicateBlocked.duplicateVersions
                        .map((v) => versionLabel(v.platform, v.format))
                        .join(", ")}
                    </span>{" "}
                    —{" "}
                    {effectiveDestination === "wishlist"
                      ? "pick a different platform or format to wishlist."
                      : "that copy is already on your card. Pick a different platform or format to add another version."}
                  </>
                ) : (
                  // Name the ACTUAL destination — this branch also fires for a
                  // Bazaar/Finished add, where "Wishlist" was just wrong (fdba9a72).
                  `You already own this game — pick the specific version you want to add to your ${destinationNoun(
                    effectiveDestination,
                  )}.`
                )}
              </p>
            )}
            {canRequestPlatform && allPlatforms && (
              <p className="text-xs text-subtle">
                Showing every platform. Pick one this game isn&apos;t listed on and we&apos;ll send a
                request to add it to the game&apos;s release list — your game is added right away.
              </p>
            )}
          </div>
          )}

          {/* Hours already played, per version being added — the same "Played by
              platform" fields as the Edit modal, driven live by the copy rows
              above. Only for games you own (a wishlist game hasn't been played). */}
          {ownsGame && (
            <PlayedByVersionFields
              rows={playedRows}
              drafts={playedDrafts}
              onChange={(key, value) => setPlayedDrafts((d) => ({ ...d, [key]: value }))}
              trackEditions={trackEditions}
            />
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

          {/* A pre-order goes in your BAZAAR — you bought it, it's part of
              your collection — locked from starting until release day, when
              it unlocks by itself. With a verified catalog release date that
              has already PASSED the ask is just noise, so it's hidden; custom
              entries and unknown dates keep it (issue a264d7d8). */}
          {!ongoing && destination === "backlog" && canOfferPreorder(meta.released) && (
            <div className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={preorderOn}
                  onChange={(e) => {
                    setPreorderOn(e.target.checked);
                    // First tick: seed the date from the catalog release.
                    if (e.target.checked && !preorderDate) setPreorderDate(meta.released ?? "");
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    <CalendarClock size={14} className="text-accent" /> This is a pre-order —
                    it&apos;s not out yet
                  </span>
                  <span className="text-xs text-subtle">
                    It joins your Bazaar with a countdown, locked from starting, and unlocks by
                    itself on release day.
                  </span>
                </span>
              </label>
              {preorderOn && (
                <label className="text-sm text-muted">
                  Expected release
                  <input
                    type="date"
                    value={preorderDate}
                    onChange={(e) => setPreorderDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
                  />
                  <span className="mt-1 block text-[11px] text-subtle">
                    Optional — leave blank if it&apos;s not announced. Record what you paid in the
                    version&apos;s cost field above.
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Adding straight to Finished? Tag how it concluded so the board's
              categorized from the start (the owner can change it later). */}
          {!ongoing && destination === "finished" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted">How did you finish it?</span>
              <div className="grid grid-cols-3 gap-2">
                {FINISH_TAGS.map((t) => {
                  const Icon = FINISH_TAG_ICONS[t.value];
                  const active = finishTag === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFinishTag(t.value)}
                      aria-pressed={active}
                      className={
                        "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition " +
                        (active
                          ? "border-brand bg-brand/10 text-ink"
                          : "border-line bg-panel text-muted hover:border-brand/50")
                      }
                    >
                      <Icon size={15} className={active ? "text-accent" : ""} /> {t.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-subtle">{FINISH_TAGS.find((t) => t.value === finishTag)!.blurb}</p>
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

          {/* Add it already hidden from anyone who visits your Bazaar, instead of
              adding then flipping Private on the card (issue d2229900). Owner-only
              — never affects the economy or your own boards. */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-panel/40 px-3 py-2.5">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                <Lock size={14} className="text-accent" /> Make this game private
              </span>
              <span className="text-xs text-subtle">
                Hidden from anyone who visits your Bazaar. You can change this anytime.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={!meta.title || platformMissing || duplicateBlocked != null}
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
