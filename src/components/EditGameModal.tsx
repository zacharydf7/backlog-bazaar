import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { createPortal } from "react-dom";
import { X, Library, Banknote, ImagePlus, Trash2, RotateCcw, Clock, Users, Gamepad2, ChevronDown, ChevronRight } from "lucide-react";
import type { Game, GameCopy } from "../types";
import { useStore } from "../store";
import { ownedPlatformLabels } from "../lib/platforms";
import { parsePlaytime, formatPlaytime, formatLength } from "../lib/playtime";
import {
  summarizePlatformPlaytime,
  buildPlaytimeRows,
  UNSPECIFIED_ROW_KEY,
  type PlaytimeRow,
  type PlaytimeBreakdown,
} from "../lib/platformPlaytime";
import { fetchGameCover } from "../lib/gamedata";
import { SuggestEditButton } from "./GameSubmissionForm";
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
  const { editGame, myPlatforms, customPlatforms, cloud, setGameImage, clearGameImage, restoreGameImage, restoreOriginalImage, fetchGameScreenshots } =
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
  // The copies list grows a row per platform, so collapse it by default once you
  // own several — it's tall, and the modal is usually opened for other reasons.
  const [copiesOpen, setCopiesOpen] = useState((game.copies ?? []).length <= 1);
  const playtimeRef = useRef<PlaytimeEditorHandle>(null);
  // The copies as you're currently editing them, so the playtime editor can
  // attribute time to a copy you add in the same sitting (not "Unspecified").
  const liveCopies = useMemo(() => rowsToCopies(rows), [rows]);

  const existing = (game.copies ?? []).map((c) => c.platform);
  const platformOptions = [
    ...new Set([...ownedPlatformLabels(myPlatforms, customPlatforms), ...existing]),
  ];

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
    if (cloud && !isWishlist) await playtimeRef.current?.apply();
    await editGame(game.id, {
      title: game.title,
      released: game.released || undefined,
      hours: game.hours ?? undefined,
      playedHours: cloud ? undefined : isWishlist ? (game.playedHours ?? 0) : (parsePlaytime(played) ?? 0),
      copies: rowsToCopies(rows),
      platforms: game.platforms ?? [],
    });
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
        </div>
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
          <PlaytimeEditor ref={playtimeRef} game={game} copies={liveCopies} />
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
                listId="edit-platform-options"
                showCost={!isWishlist}
                addLabel={isWishlist ? "Add a version" : "Add a copy"}
              />
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
 *  Save. Cloud-only; the parent renders a single plain field offline. */
const PlaytimeEditor = forwardRef<PlaytimeEditorHandle, { game: Game; copies: GameCopy[] }>(
  function PlaytimeEditor({ game, copies }, ref) {
    const { fetchPlaySessions, setPlatformPlaytime } = useStore();
    const [breakdown, setBreakdown] = useState<PlaytimeBreakdown | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    useEffect(() => {
      let active = true;
      void fetchPlaySessions(game.id).then((sessions) => {
        if (active) setBreakdown(summarizePlatformPlaytime(sessions));
      });
      return () => {
        active = false;
      };
    }, [game.id, fetchPlaySessions]);

    // Rows track the live copies you're editing, so adding the copy you played
    // immediately gives its time a home instead of falling into "Unspecified".
    const rows = useMemo(
      () => (breakdown ? buildPlaytimeRows(ownedVersions(copies), breakdown) : null),
      [copies, breakdown],
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
    const resolved = (r: PlaytimeRow): number => {
      const text = (drafts[r.key] ?? "").trim();
      if (text === "") return 0;
      return parsePlaytime(text) ?? r.hours;
    };

    useImperativeHandle(
      ref,
      () => ({
        async apply() {
          if (!rows) return;
          for (const r of rows) {
            const next = resolved(r);
            if (Math.abs(next - r.hours) > 1e-9) {
              // Clear any folded-in buckets first (e.g. legacy format-less time),
              // then set the canonical version to the new total — so the folded
              // hours move onto the version this row represents.
              for (const a of r.absorbs) {
                await setPlatformPlaytime(game.id, a.platform, a.format, 0);
              }
              await setPlatformPlaytime(game.id, r.platform, r.format, next);
            }
          }
        },
      }),
      // resolved closes over drafts/rows; re-create the handle when they change.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [rows, drafts, game.id, setPlatformPlaytime],
    );

    if (!rows) return null; // sessions still loading

    // One bucket → a plain "Played" field (the version is unambiguous). Two or
    // more → the per-version splitter with a reassignable Unspecified row.
    if (rows.length === 1) {
      const key = rows[0].key;
      return (
        <label className="text-sm text-muted">
          Played
          <input
            type="text"
            value={drafts[key] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setDrafts((d) => ({ ...d, [key]: v }));
            }}
            placeholder="e.g. 1h 30m"
            className={inputClass}
          />
        </label>
      );
    }

    const total = rows.reduce((sum, r) => sum + resolved(r), 0);
    return (
      <div className="rounded-xl border border-line bg-panel/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-subtle">
            <Clock size={13} className="text-accent" /> Played by version
          </span>
          <span className="text-[11px] text-subtle">
            Total <span className="tabular-nums text-muted">{formatPlaytime(total)}</span>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <label key={r.key} className="flex items-center gap-2">
              <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm text-ink">
                {r.platform != null ? (
                  <Gamepad2 size={13} className="shrink-0 text-accent/70" />
                ) : (
                  <Clock size={13} className="shrink-0 text-subtle" />
                )}
                <span className="truncate" title={r.label}>
                  {r.label}
                </span>
              </span>
              <input
                type="text"
                value={drafts[r.key] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
                placeholder="0h"
                aria-label={`Hours played${r.platform ? ` on ${r.label}` : ""}`}
                className="w-28 shrink-0 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
            </label>
          ))}
        </div>
        {rows.some((r) => r.key === UNSPECIFIED_ROW_KEY) && (
          <p className="mt-2 text-[11px] text-subtle">
            Time is tracked per version. “Unspecified” collects hours not tied to a copy you own —
            time logged without a version, or on a copy you've changed or removed — so you can move
            it onto the version you actually played.
          </p>
        )}
      </div>
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
      </div>

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
 *  When visiting another player's Bazaar it renders look-only (no edits).
 *  (A future option: an in-modal tab switcher to hop between sibling editions.) */
export function EditGameModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { games, viewing } = useStore();
  const { readOnly, hideSpend } = useViewing();
  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the modal instead of leaving the page
  const [manageOpen, setManageOpen] = useState(false);

  // Resolve the family live (from the visited snapshot while visiting, else your
  // own library) so the stats + Manage entry react to link/unlink in the hub.
  const libraryGames = viewing ? viewing.games : games;
  const live = libraryGames.find((g) => g.id === game.id) ?? game;
  const members = familyMembers(libraryGames, live);
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

        {readOnly ? (
          <ReadOnlyDetail game={live} hideSpend={hideSpend} />
        ) : (
          <EditGameForm game={live} onClose={onClose} />
        )}
      </div>

      {manageOpen &&
        createPortal(
          <FamilyHub game={live} onClose={() => setManageOpen(false)} />,
          document.body,
        )}
    </div>
  );
}
