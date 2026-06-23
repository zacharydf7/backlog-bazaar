import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Library, Banknote, ImagePlus, Trash2, RotateCcw, Clock, Users } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { ownedPlatformLabels } from "../lib/platforms";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import { fetchGameCover } from "../lib/gamedata";
import { SuggestEditButton } from "./GameSubmissionForm";
import { familyMembers, familyStats } from "../lib/families";
import {
  ownedPlatformSummary,
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
  const { editGame, myPlatforms, customPlatforms, cloud, setGameImage, clearGameImage, restoreGameImage, restoreOriginalImage } =
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
  const originalTarget = game.rawgId ? rawgCover : originalImage;
  // Offer "restore original" only when we know the original and it differs from
  // what's shown now (so it's hidden when you're already on the original cover).
  const canRestoreOriginal = Boolean(originalTarget) && originalTarget !== liveImage;

  const [played, setPlayed] = useState(formatPlaytime(game.playedHours ?? 0));
  const [rows, setRows] = useState<CopyRowDraft[]>((game.copies ?? []).map(copyToRow));

  const existing = (game.copies ?? []).map((c) => c.platform);
  const platformOptions = [
    ...new Set([...ownedPlatformLabels(myPlatforms, customPlatforms), ...existing]),
  ];

  // A wishlisted game hasn't been bought/played, so hide the played-hours field.
  const isWishlist = game.status === "wishlist";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    // Shared metadata is passed through unchanged — only personal fields move.
    await editGame(game.id, {
      title: game.title,
      released: game.released || undefined,
      hours: game.hours ?? undefined,
      playedHours: isWishlist ? (game.playedHours ?? 0) : (parsePlaytime(played) ?? 0),
      copies: rowsToCopies(rows),
      platforms: game.platforms ?? [],
    });
    onClose();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 p-4">
      {/* Shared catalog metadata — read-only; corrections go through moderation. */}
      <div className="rounded-xl border border-line bg-panel/30 p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-display text-base leading-tight text-ink">{game.title}</h3>
          <div className="shrink-0">
            <SuggestEditButton game={game} />
          </div>
        </div>
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

      {cloud && (
        <div className="flex items-center gap-3">
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-panel">
            {liveImage ? (
              <img src={liveImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-2xl opacity-50">🎮</div>
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

      {!isWishlist && (
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
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">
          {isWishlist ? "Version you want" : "Copies you own"}{" "}
          <span className="text-xs text-subtle">
            {isWishlist
              ? "— the platform/edition you plan to get"
              : "— platform, format, cost & an optional note"}
          </span>
        </span>
        {rows.length === 0 && (
          <p className="text-xs text-subtle">
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
      </div>

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
 *  Family hub. For an unlinked game there are no stats, but the owner still gets a
 *  "Link editions" entry so a family can be created. Returns null when there's
 *  nothing to show (an unlinked game viewed read-only). */
function FamilyStatsBlock({
  members,
  hideSpend,
  onManage,
}: {
  members: Game[];
  hideSpend: boolean;
  onManage?: () => void;
}) {
  const linked = members.length > 1;
  if (!linked && !onManage) return null;
  const stats = familyStats(members);

  return (
    <div className="border-b border-line bg-panel/30 p-4">
      {linked ? (
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
      ) : (
        onManage && (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/40 hover:text-accent"
          >
            <Users size={14} className="text-accent" /> Link editions
          </button>
        )
      )}
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

  const headerTitle = readOnly ? live.title : "Edit game";

  return (
    // Deliberately no backdrop click-to-close: an edit form is easy to fill out,
    // and a stray tap outside shouldn't discard it. Close only via the ✕ (or the
    // Cancel button / browser Back). Mirrors the Add game modal.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="min-w-0 truncate font-display text-xl text-ink">{headerTitle}</h2>
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
