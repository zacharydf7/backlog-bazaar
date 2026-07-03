import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { createPortal } from "react-dom";
import { X, Library, Banknote, ImagePlus, Trash2, RotateCcw, Clock, Users, Gamepad2, ChevronDown, ChevronRight, Package, Lock } from "lucide-react";
import type { Game, GameCopy } from "../types";
import { useStore } from "../store";
import { copyPlatformOptions, canonicalizeTerms, newlyMissingPlatforms } from "../lib/taxonomy";
import { foldedCompilationCopies } from "../lib/ownershipMerge";
import { parsePlaytime, formatPlaytime, formatLength } from "../lib/playtime";
import {
  summarizePlatformPlaytime,
  buildPlaytimeRows,
  UNSPECIFIED_ROW_KEY,
  type PlaytimeRow,
  type PlaytimeBreakdown,
} from "../lib/platformPlaytime";
import { fetchGameCover } from "../lib/gamedata";
import { SuggestEditButton, gameToCatalogFields } from "./GameSubmissionForm";
import { ScreenshotGallery } from "./ScreenshotGallery";
import { familyMembers, familyStats, familyName } from "../lib/families";
import {
  ownedPlatformSummary,
  ownedVersions,
  ownershipLabel,
  formatLabel,
  totalCost,
  hasAnyCost,
  formatUsd,
} from "../lib/copies";
import { CopyRowsEditor, copyToRow, rowsToCopies, type CopyRowDraft } from "./CopyRowsEditor";
import { PlayedByVersionFields, resolvedRowHours } from "./PlayedByVersionFields";
import { FamilyHub } from "./FamilyHub";
import { useViewing } from "../lib/viewContext";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

/** Edit one edition's personal details: your custom cover, time played, and the
 *  copies you own. Shared catalog metadata (title, cover, platforms, genres,
 *  release date, length) is read-only here — change it for everyone via Suggest
 *  edit. Status/coins/reward snapshots move through play, not here. */
function EditGameForm({ game, onClose }: { game: Game; onClose: () => void }) {
  const { editGame, platformList, cloud, setGameImage, clearGameImage, restoreGameImage, restoreOriginalImage, fetchGameScreenshots, submitGameSubmission } =
    useStore();
  // Read the game from the store so the cover refreshes live after upload/removal.
  const liveGame = useStore((s) => s.games.find((g) => g.id === game.id));
  const liveImage = liveGame?.image ?? game.image;
  const stockImage = liveGame?.stockImage ?? game.stockImage;
  const originalImage = liveGame?.originalImage ?? game.originalImage;
  // Offer "restore default" only when there's a default cover to go back to and
  // the current one differs (custom upload, or removed).
  const canRestore = Boolean(stockImage) && liveImage !== stockImage;

  // The cover this game shipped with: re-fetched live from RAWG (authoritative,
  // and recovers it even for games edited before we tracked it), falling back to
  // the stored original for community games with no RAWG id.
  const [rawgCover, setRawgCover] = useState<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (cloud && game.rawgId) {
      void fetchGameCover(game.rawgId).then((url) => active && setRawgCover(url));
    }
    return () => {
      active = false;
    };
  }, [cloud, game.rawgId]);
  // The catalog's community screenshots for this game (read-only here), shown as a
  // flip-through below the cover so you can preview the game.
  const [screenshots, setScreenshots] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    if (cloud && (game.rawgId || game.catalogId)) {
      void fetchGameScreenshots({ rawgId: game.rawgId, catalogId: game.catalogId }).then(
        (s) => active && setScreenshots(s),
      );
    }
    return () => {
      active = false;
    };
  }, [cloud, game.rawgId, game.catalogId, fetchGameScreenshots]);

  const originalTarget = game.rawgId ? rawgCover : originalImage;
  // Offer "restore original" only when we know the original and it differs from
  // what's shown now (so it's hidden when you're already on the original cover).
  const canRestoreOriginal = Boolean(originalTarget) && originalTarget !== liveImage;

  const [played, setPlayed] = useState(formatPlaytime(game.playedHours ?? 0));
  const [rows, setRows] = useState<CopyRowDraft[]>((game.copies ?? []).map(copyToRow));
  // The copies section is tall, and the modal is usually opened for other reasons,
  // so collapse it by default whenever copies already exist (even a single one).
  // Only an empty list stays open, to prompt recording the first copy.
  const [copiesOpen, setCopiesOpen] = useState((game.copies ?? []).length === 0);
  const playtimeRef = useRef<PlaytimeEditorHandle>(null);
  // The copies as you're currently editing them, so the playtime editor can
  // attribute time to a copy you add in the same sitting (not "Unspecified").
  const liveCopies = useMemo(() => rowsToCopies(rows), [rows]);

  // Overlapping ownership: compilation copies of this same game fold into this
  // (standalone master) detail beneath your editable copies. Their cost/platform/
  // format are owned by the bundle (read-only here). Playtime is unified on this
  // master — only the master can ever be Now Playing, so a single "Played by
  // platform" editor spans every platform you own the game on (yours + the folded
  // copies'), exactly like any other multi-platform game.
  const allGames = useStore((s) => s.games);
  const foldedCopies = useMemo(() => foldedCompilationCopies(allGames, game), [allGames, game]);

  // The platforms the playtime editor offers: your editable copies plus the folded
  // compilation copies' copies, so time can be attributed to a platform you own
  // only through a bundle.
  const playtimeCopies = useMemo(
    () => [...liveCopies, ...foldedCopies.flatMap((c) => c.copies ?? [])],
    [liveCopies, foldedCopies],
  );

  // "Missing platform?" escape hatch: widen the owned-copy choices from this
  // game's verified release list to the full master list. Picking one it isn't
  // listed on still saves the copy now and quietly files a platform edit-suggestion
  // — the same optimistic flow Add-Game uses, here for adding copies to a game you
  // already own.
  const [allPlatforms, setAllPlatforms] = useState(false);

  // Owned-copy platforms: restricted to the platforms this game released on when
  // known (else the whole master list), with any legacy value on a copy kept.
  // Opening the escape hatch drops the release-list restriction.
  const existing = (game.copies ?? []).map((c) => c.platform).filter(Boolean);
  const platformOptions = copyPlatformOptions(
    allPlatforms ? undefined : game.platforms,
    platformList,
    existing,
  );

  // The game's verified release platforms (canonicalized). The hatch only makes
  // sense when choices are actually restricted to a known list and there's a
  // catalog/RAWG game to file a suggestion against.
  const verifiedPlatforms = canonicalizeTerms(game.platforms, platformList);
  const hasGlobalTarget = Boolean(game.rawgId || game.catalogId);
  const canRequestPlatform = verifiedPlatforms.length > 0 && hasGlobalTarget;

  // A wishlisted game hasn't been bought/played, so hide the played-hours field.
  const isWishlist = game.status === "wishlist";
  // A compilation child's cost/platform/format are owned by the compilation, so
  // its copies are read-only here — change them by managing the compilation.
  const inCompilation = game.compilationId != null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Cloud: playtime is edited per-version (set_platform_playtime); apply those
    // first, then save the rest without touching played_hours. Offline: there's a
    // single plain field, so editGame carries played_hours as before.
    // The master editor persists its own per-version edits and consolidates any
    // playtime logged on a folded compilation copy onto this master (see mergeFrom).
    if (cloud && !isWishlist) await playtimeRef.current?.apply();
    const copies = rowsToCopies(rows);
    await editGame(game.id, {
      title: game.title,
      released: game.released || undefined,
      hours: game.hours ?? undefined,
      playedHours: cloud ? undefined : isWishlist ? (game.playedHours ?? 0) : (parsePlaytime(played) ?? 0),
      copies,
      platforms: game.platforms ?? [],
    });

    // "Missing platform?": if a copy was just added on a platform this catalogued
    // game isn't verified for, seamlessly file a platform edit-suggestion (the copy
    // is already saved). Only newly added platforms are suggested, so re-saving a
    // game with a grandfathered off-list copy doesn't re-file every time. The lone
    // proposed change is `platforms`, so a moderator can approve just that field; on
    // approval it joins the verified list for everyone — the same path Add-Game uses.
    if (cloud && hasGlobalTarget) {
      const missing = newlyMissingPlatforms(
        copies.map((c) => c.platform),
        (game.copies ?? []).map((c) => c.platform),
        game.platforms,
        platformList,
      );
      if (missing.length > 0) {
        const baseline = { ...gameToCatalogFields(game), platforms: verifiedPlatforms, screenshots };
        await submitGameSubmission({
          kind: "edit",
          catalogId: game.catalogId ?? null,
          rawgId: game.rawgId ?? null,
          proposed: {
            ...baseline,
            platforms: canonicalizeTerms([...verifiedPlatforms, ...missing], platformList),
          },
          before: baseline,
        }).catch(() => {});
      }
    }
    onClose();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 p-4">
      {/* Your personal cover — shown large up top so the artwork's easy to enjoy
          and to see clearly while changing it. Customizes only your own cards. */}
      {cloud && (
        <div className="flex flex-col gap-2">
          <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
            {liveImage ? (
              <img src={liveImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-5xl opacity-50">🎮</div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-muted">
              Your cover image{" "}
              <span className="text-xs text-subtle">— customizes only your own cards</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink transition hover:border-brand/50">
                <ImagePlus size={14} className="text-accent" /> Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void setGameImage(game.id, f);
                    e.target.value = "";
                  }}
                />
              </label>
              {liveImage && (
                <button
                  type="button"
                  onClick={() => void clearGameImage(game.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:text-danger"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
              {canRestore && (
                <button
                  type="button"
                  onClick={() => void restoreGameImage(game.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:text-accent"
                >
                  <RotateCcw size={14} /> Restore default
                </button>
              )}
              {canRestoreOriginal && originalTarget && (
                <button
                  type="button"
                  onClick={() => void restoreOriginalImage(game.id, originalTarget)}
                  title="Revert to the cover this game originally shipped with"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:text-accent"
                >
                  <RotateCcw size={14} /> Restore original
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Shared catalog metadata — read-only; corrections go through moderation. */}
      <div className="rounded-xl border border-line bg-panel/30 p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-display text-base leading-tight text-ink">{game.title}</h3>
          <div className="shrink-0">
            <SuggestEditButton game={game} />
          </div>
        </div>
        {screenshots.length > 0 && (
          <div className="mb-3">
            <ScreenshotGallery urls={screenshots} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DetailStat label="Released" value={year(game.released)} />
          <DetailStat label="Length" value={game.hours ? formatPlaytime(game.hours) : "—"} />
          {game.metacritic != null && (
            <DetailStat label="Metacritic" value={String(game.metacritic)} />
          )}
        </div>
        {(game.developers?.length ?? 0) > 0 && (
          <div className="mt-2">
            <DetailStat label="Developer" value={(game.developers ?? []).join(", ")} />
          </div>
        )}
        {(game.platforms?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {(game.platforms ?? []).map((p) => (
              <span key={p} className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-muted">
                {p}
              </span>
            ))}
          </div>
        )}
        {game.genres.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {game.genres.map((g) => (
              <span key={g} className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-subtle">
                {g}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-subtle">
          Title, platforms, genres, release date and length are shared with everyone — use Suggest
          edit to change them.
        </p>
      </div>

      {/* Playtime. Cloud tracks it per version (with a reassignable Unspecified
          bucket); offline keeps a single total field. */}
      {!isWishlist &&
        (cloud ? (
          <PlaytimeEditor
            ref={playtimeRef}
            game={game}
            copies={playtimeCopies}
            mergeFrom={foldedCopies}
          />
        ) : (
          <label className="text-sm text-muted">
            Played
            <input
              type="text"
              value={played}
              onChange={(e) => setPlayed(e.target.value)}
              placeholder="e.g. 1h 30m"
              className={inputClass}
            />
          </label>
        ))}

      {inCompilation ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">Copies you own</span>
          <div className="rounded-xl border border-line bg-panel/50 p-2.5 text-[11px] text-muted">
            {(game.copies ?? []).map((c) => (
              <div key={c.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {c.platform || "—"}
                  {c.format ? ` (${formatLabel(c.format)})` : ""}
                </span>
                <span className="shrink-0 text-accent">{c.cost != null ? formatUsd(c.cost) : "—"}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-subtle">
            Cost, platform &amp; format are managed by the{" "}
            <span className="text-ink">{game.compilationName ?? "compilation"}</span> compilation —
            open it from the card to change them.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setCopiesOpen((o) => !o)}
            aria-expanded={copiesOpen}
            className="flex w-full items-center gap-1.5 text-left text-sm text-muted transition hover:text-ink"
          >
            {copiesOpen ? (
              <ChevronDown size={15} className="shrink-0 text-subtle" />
            ) : (
              <ChevronRight size={15} className="shrink-0 text-subtle" />
            )}
            <span>
              {isWishlist ? "Version you want" : "Copies you own"}
              {rows.length > 0 && <span className="text-subtle"> ({rows.length})</span>}
            </span>
          </button>
          {copiesOpen ? (
            <>
              <span className="pl-[21px] text-xs text-subtle">
                {isWishlist
                  ? "The platform/edition you plan to get"
                  : "Platform, format, cost & an optional note"}
              </span>
              {rows.length === 0 && (
                <p className="pl-[21px] text-xs text-subtle">
                  {isWishlist ? "No version chosen yet." : "No copies recorded yet."}
                </p>
              )}
              <CopyRowsEditor
                rows={rows}
                onChange={setRows}
                platformOptions={platformOptions}
                showCost={!isWishlist}
                addLabel={isWishlist ? "Add a version" : "Add a copy"}
              />
              {/* Missing-platform escape hatch — only when the choices are actually
                  restricted to a known release list and there's a catalog/RAWG game
                  to suggest an edit against. */}
              {canRequestPlatform && !allPlatforms && (
                <button
                  type="button"
                  onClick={() => setAllPlatforms(true)}
                  className="self-start pl-[21px] text-xs font-medium text-accent underline-offset-2 transition hover:underline"
                >
                  Missing platform? Choose from all platforms
                </button>
              )}
              {canRequestPlatform && allPlatforms && (
                <p className="pl-[21px] text-xs text-subtle">
                  Showing every platform. Pick one this game isn&apos;t listed on and we&apos;ll send
                  a request to add it to the game&apos;s release list — your copy is saved right away.
                </p>
              )}
            </>
          ) : (
            rows.length > 0 && (
              <p className="truncate pl-[21px] text-xs text-subtle">
                {rows.map((r) => r.platform.trim() || "—").join(" · ")}
              </p>
            )
          )}
        </div>
      )}

      {/* Compilation copies of this same game, folded in. The bundle owns their
          platform/format/cost (shown locked, changed from the compilation hub via
          the card's "Part of …" badge). Their platforms feed the single "Played by
          platform" editor above, where this game's time is tracked once — so there's
          no separate playtime field here. */}
      {foldedCopies.map((copyGame) => (
        <div key={copyGame.id} className="flex flex-col gap-2">
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted">
            <Package size={14} className="shrink-0 text-accent" />
            Part of {copyGame.compilationName ?? "a compilation"}
            <span className="text-xs text-subtle">· Locked / managed</span>
          </span>
          <div className="rounded-xl border border-line bg-panel/50 p-2.5 text-[11px] text-muted">
            {(copyGame.copies ?? []).length === 0 ? (
              <span className="text-subtle">No platform recorded.</span>
            ) : (
              (copyGame.copies ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                    <Lock size={11} className="shrink-0 text-subtle" />
                    {c.platform || "—"}
                    {c.format ? ` (${formatLabel(c.format)})` : ""}
                  </span>
                  <span className="shrink-0 text-accent">
                    {c.cost != null ? formatUsd(c.cost) : "—"}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-subtle">
            Cost, platform &amp; format are managed by the{" "}
            <span className="text-ink">{copyGame.compilationName ?? "compilation"}</span> compilation
            — open it from the card to change them.
          </p>
        </div>
      ))}

      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-panel px-4 py-2.5 font-medium text-ink transition hover:brightness-95"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

export interface PlaytimeEditorHandle {
  /** Persist any per-version edits (called by the modal's Save). */
  apply: () => Promise<void>;
}

/** Edit your logged play time per version (platform + format). The rows reflect
 *  the copies you currently own — including ones you're adding right now — plus
 *  any version you've already logged time on, so a brand-new game with one copy
 *  reads as a plain "Played" field and the time lands on that copy, not in
 *  "Unspecified". When there's an actual split (multiple versions, or some time
 *  not yet attributed) it expands to one field per version with a reassignable
 *  "Unspecified" row. Edits log attributed corrections (set_platform_playtime) on
 *  Save. Cloud-only; the parent renders a single plain field offline.
 *
 *  `mergeFrom` lists other game records whose playtime belongs to this same game
 *  (folded compilation copies of a standalone master). Their sessions are read in
 *  and shown as one combined breakdown, and on Save they're consolidated onto this
 *  master — each contributed bucket is zeroed on its own record and its hours land
 *  on the master — so a game owned standalone + in bundles tracks time once, by
 *  platform, like any other multi-platform game. Total hours are preserved (every
 *  move is an append-only set_platform_playtime correction). */
// (Rendering of the row fields lives in PlayedByVersionFields, shared with the
// Add Game form so the two surfaces stay visually identical.)
const PlaytimeEditor = forwardRef<
  PlaytimeEditorHandle,
  { game: Game; copies: GameCopy[]; mergeFrom?: Game[] }
>(function PlaytimeEditor({ game, copies, mergeFrom }, ref) {
    const { fetchPlaySessions, setPlatformPlaytime, trackEditions } = useStore();
    const [breakdown, setBreakdown] = useState<PlaytimeBreakdown | null>(null);
    // Per-record breakdowns of the folded copies, so Save can zero exactly the
    // buckets they contributed (their hours are already in the combined `breakdown`).
    const [mergeBreakdowns, setMergeBreakdowns] = useState<
      { id: string; breakdown: PlaytimeBreakdown }[]
    >([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    // A stable key for the merge sources, so the fetch effect doesn't re-run on
    // every render (mergeFrom is a fresh array each time).
    const mergeIds = (mergeFrom ?? []).map((m) => m.id).join(",");
    useEffect(() => {
      let active = true;
      const ids = mergeIds ? mergeIds.split(",") : [];
      void Promise.all([
        fetchPlaySessions(game.id),
        ...ids.map((id) => fetchPlaySessions(id)),
      ]).then((results) => {
        if (!active) return;
        setBreakdown(summarizePlatformPlaytime(results.flat()));
        setMergeBreakdowns(
          ids.map((id, i) => ({ id, breakdown: summarizePlatformPlaytime(results[i + 1]) })),
        );
      });
      return () => {
        active = false;
      };
    }, [game.id, fetchPlaySessions, mergeIds]);

    // Rows track the live copies you're editing, so adding the copy you played
    // immediately gives its time a home instead of falling into "Unspecified".
    const rows = useMemo(
      () =>
        breakdown
          ? buildPlaytimeRows(ownedVersions(copies), breakdown, { byPlatform: !trackEditions })
          : null,
      [copies, breakdown, trackEditions],
    );

    // Keep the editable values in sync as the rows change. A new row starts at its
    // logged hours; when the editor collapses to a single field (e.g. you add the
    // one copy you played), the value you already typed carries onto it.
    const prevSingleKey = useRef<string | null>(null);
    useEffect(() => {
      if (!rows) return;
      setDrafts((prev) => {
        const single = rows.length === 1;
        const carry =
          single && prevSingleKey.current && prev[prevSingleKey.current] != null
            ? prev[prevSingleKey.current]
            : null;
        const next: Record<string, string> = {};
        for (const r of rows) {
          next[r.key] = prev[r.key] ?? (carry != null ? carry : formatLength(r.hours));
        }
        prevSingleKey.current = single ? rows[0].key : null;
        return next;
      });
    }, [rows]);

    // Resolve a row's edited hours: blank means zero (clear the bucket); an
    // unparseable value leaves the bucket unchanged.
    const resolved = (r: PlaytimeRow): number => resolvedRowHours(r, drafts[r.key]);

    useImperativeHandle(
      ref,
      () => ({
        async apply() {
          if (!rows) return;
          // When folded copies have logged time, their hours are already included in
          // each row's combined total, so we write every row to the master (claiming
          // those hours) and then zero the copies' buckets below. Otherwise only
          // changed rows are written, to avoid logging no-op corrections.
          const consolidating = mergeBreakdowns.some(
            (m) => m.breakdown.byVersion.length > 0 || m.breakdown.unattributed > 0,
          );
          for (const r of rows) {
            const next = resolved(r);
            if (consolidating || Math.abs(next - r.hours) > 1e-9) {
              // Clear any folded-in buckets first (e.g. legacy format-less time),
              // then set the canonical version to the new total — so the folded
              // hours move onto the version this row represents.
              for (const a of r.absorbs) {
                await setPlatformPlaytime(game.id, a.platform, a.format, 0);
              }
              await setPlatformPlaytime(game.id, r.platform, r.format, next);
            }
          }
          // Move every folded copy's playtime onto the master by zeroing the buckets
          // it contributed — their hours now live on the master rows above. Append-
          // only corrections, so the grand total is preserved.
          if (consolidating) {
            for (const m of mergeBreakdowns) {
              for (const v of m.breakdown.byVersion) {
                await setPlatformPlaytime(m.id, v.platform, v.format, 0);
              }
              if (m.breakdown.unattributed > 0) {
                await setPlatformPlaytime(m.id, null, null, 0);
              }
            }
          }
        },
      }),
      // resolved closes over drafts/rows; re-create the handle when they change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [rows, drafts, game.id, setPlatformPlaytime, mergeBreakdowns],
    );

    if (!rows) return null; // sessions still loading

    // The row fields themselves are shared with the Add Game form.
    return (
      <PlayedByVersionFields
        rows={rows}
        drafts={drafts}
        onChange={(key, value) => setDrafts((d) => ({ ...d, [key]: value }))}
        trackEditions={trackEditions}
      />
    );
  },
);

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-subtle">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

/** Look-only details for one edition, shown when visiting another player's
 *  Bazaar: stats, owned platforms, genres, and copies (with real-world spend
 *  omitted if they've hidden it). No inputs, no save. */
function ReadOnlyDetail({ game, hideSpend }: { game: Game; hideSpend: boolean }) {
  const owned = ownedPlatformSummary(game.copies);
  const showSpend = !hideSpend && hasAnyCost(game.copies);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* The cover, shown large up top — visitors get the same prominent artwork
          as the owner's edit view. */}
      {game.image && (
        <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
          <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-display text-lg leading-tight text-ink">{game.title}</h3>
        <div className="shrink-0">
          <SuggestEditButton game={game} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <DetailStat label="Released" value={year(game.released)} />
        <DetailStat label="Length" value={game.hours ? formatPlaytime(game.hours) : "—"} />
        <DetailStat
          label="Played"
          value={game.playedHours ? formatPlaytime(game.playedHours) : "—"}
        />
        {game.metacritic != null && (
          <DetailStat label="Metacritic" value={String(game.metacritic)} />
        )}
      </div>

      {(game.developers?.length ?? 0) > 0 && (
        <DetailStat label="Developer" value={(game.developers ?? []).join(", ")} />
      )}

      {game.genres.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {game.genres.map((g) => (
            <span key={g} className="rounded-full bg-panel px-2 py-0.5 text-[10px] text-muted">
              {g}
            </span>
          ))}
        </div>
      )}

      {owned.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-accent">
          <Library size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {game.status === "wishlist" ? "Want on" : "Owned on"}{" "}
            {owned.map(ownershipLabel).join(" · ")}
          </span>
        </div>
      )}

      {showSpend && (
        <div className="rounded-lg bg-panel p-2 text-[11px] text-muted">
          <div className="mb-1 inline-flex items-center gap-1 text-accent">
            <Banknote size={12} /> Spent {formatUsd(totalCost(game.copies))}
          </div>
          {(game.copies ?? []).map((c) => (
            <div key={c.id} className="flex justify-between gap-2">
              <span className="truncate">
                {c.platform}
                {c.format ? ` (${formatLabel(c.format)})` : ""}
                {c.note ? ` · ${c.note}` : ""}
              </span>
              <span className="shrink-0">{c.cost ? formatUsd(c.cost) : "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The family overview surfaced inside a single edition's detail: combined Hours
 *  Played + Money Spent across every edition, plus the entry point to the Manage
 *  Family hub. Only shown for a game that's already linked — creating a family
 *  from an unlinked game now lives in the card's ⋮ menu ("Link editions"), out of
 *  the way. Returns null when the game isn't part of a family. */
function FamilyStatsBlock({
  members,
  hideSpend,
  onManage,
}: {
  members: Game[];
  hideSpend: boolean;
  onManage?: () => void;
}) {
  if (members.length <= 1) return null;
  const stats = familyStats(members);

  return (
    <div className="border-b border-line bg-panel/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
            <Users size={13} /> Game Family · {stats.count} editions
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock size={13} className="text-accent/70" /> {formatPlaytime(stats.totalPlayed)}{" "}
              played
            </span>
            {!hideSpend && stats.totalCost > 0 && (
              <span className="inline-flex items-center gap-1">
                <Banknote size={13} className="text-accent/70" /> {formatUsd(stats.totalCost)} spent
              </span>
            )}
          </div>
        </div>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
          >
            <Users size={15} /> Manage Family
          </button>
        )}
      </div>
    </div>
  );
}

/** The game detail screen for a single edition. Each edition (including each
 *  member of a linked Game Family) has its own card and opens here, with the
 *  family's combined stats + a Manage Family entry point shown above its details.
 *  Clicking a sibling in the Manage Family hub re-targets this modal to that
 *  edition in place. When visiting another player's Bazaar it renders look-only
 *  (no edits). */
export function EditGameModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { games, viewing } = useStore();
  const { readOnly, hideSpend } = useViewing();
  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the modal instead of leaving the page
  const [manageOpen, setManageOpen] = useState(false);
  // Which edition the modal is showing — starts as the opened game, and hops to
  // a sibling when one is clicked in the Manage Family hub.
  const [viewedId, setViewedId] = useState(game.id);

  // Resolve the family live (from the visited snapshot while visiting, else your
  // own library) so the stats + Manage entry react to link/unlink in the hub.
  // A jumped-to edition that disappears (unlinked + deleted) falls back to the
  // originally opened game.
  const libraryGames = viewing ? viewing.games : games;
  const live =
    libraryGames.find((g) => g.id === viewedId) ??
    libraryGames.find((g) => g.id === game.id) ??
    game;
  // Fall back to the game itself when it isn't in the active library — e.g. a
  // read-only preview of a game shared in a chat (the sender's game), so the
  // family stats + header still render as a family of one.
  const found = familyMembers(libraryGames, live);
  const members = found.length ? found : [live];
  const linked = members.length > 1;

  // For a linked game, lead with the family's name (the specific edition's own
  // title still shows in the detail below). Otherwise keep the plain heading.
  const headerTitle = linked ? familyName(members) : readOnly ? live.title : "Edit game";

  return (
    // Deliberately no backdrop click-to-close: an edit form is easy to fill out,
    // and a stray tap outside shouldn't discard it. Close only via the ✕ (or the
    // Cancel button / browser Back). Mirrors the Add game modal.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex min-w-0 items-center gap-2 font-display text-xl text-ink">
            {linked && <Users size={17} className="shrink-0 text-accent" />}
            <span className="min-w-0 truncate">{headerTitle}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Family overview + the entry point to the Manage Family hub (owner only). */}
        <FamilyStatsBlock
          members={members}
          hideSpend={hideSpend}
          onManage={readOnly ? undefined : () => setManageOpen(true)}
        />

        {/* Keyed by edition so the form's draft state resets when the hub jumps
            to a sibling — otherwise the previous edition's edits would linger. */}
        {readOnly ? (
          <ReadOnlyDetail key={live.id} game={live} hideSpend={hideSpend} />
        ) : (
          <EditGameForm key={live.id} game={live} onClose={onClose} />
        )}
      </div>

      {manageOpen &&
        createPortal(
          <FamilyHub
            game={live}
            onClose={() => setManageOpen(false)}
            onJump={(m) => {
              setViewedId(m.id);
              setManageOpen(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
