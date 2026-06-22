import { useState } from "react";
import {
  X,
  Gamepad2,
  Store,
  Heart,
  Trophy,
  Library,
  Banknote,
  ImagePlus,
  Trash2,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type { Game, GameStatus } from "../types";
import { useStore } from "../store";
import { ownedPlatformLabels } from "../lib/platforms";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import { SuggestEditButton } from "./GameSubmissionForm";
import { familyMembers } from "../lib/families";
import {
  ownedPlatformSummary,
  ownershipLabel,
  formatLabel,
  totalCost,
  hasAnyCost,
  formatUsd,
} from "../lib/copies";
import { CopyRowsEditor, copyToRow, rowsToCopies, type CopyRowDraft } from "./CopyRowsEditor";
import { LinkedEditions } from "./LinkedEditions";
import { GameActions, ReadOnlyFooter } from "./GameActions";
import { useViewing } from "../lib/viewContext";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

const STATUS_ICON: Record<GameStatus, LucideIcon> = {
  playing: Gamepad2,
  backlog: Store,
  wishlist: Heart,
  finished: Trophy,
};

/** Edit one edition's personal details: your custom cover, time played, and the
 *  copies you own. Shared catalog metadata (title, cover, platforms, genres,
 *  release date, length) is read-only here — change it for everyone via Suggest
 *  edit. Status/coins/reward snapshots move through play, not here. */
function EditGameForm({ game, onClose }: { game: Game; onClose: () => void }) {
  const { editGame, myPlatforms, customPlatforms, cloud, setGameImage, clearGameImage, restoreGameImage } =
    useStore();
  // Read the game from the store so the cover refreshes live after upload/removal.
  const liveGame = useStore((s) => s.games.find((g) => g.id === game.id));
  const liveImage = liveGame?.image ?? game.image;
  const stockImage = liveGame?.stockImage ?? game.stockImage;
  // Offer "restore default" only when there's an original cover to go back to and
  // the current one differs (custom upload, or removed).
  const canRestore = Boolean(stockImage) && liveImage !== stockImage;

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
          <span className="mt-1 block text-xs text-subtle">
            Editing played hours here doesn&apos;t earn coins — use “Log time” while playing for that.
          </span>
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

      <div className="border-t border-line pt-3">
        <LinkedEditions game={game} />
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

/** The game detail screen. For a linked Game Family it shows per-edition sub-tabs
 *  — each tab carries that edition's actions (buy/log/finish), unlock cost,
 *  progress note, and editable stats. A standalone game shows just its form.
 *  When visiting another player's Bazaar it renders look-only (no edits). */
export function EditGameModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { games, viewing } = useStore();
  const { readOnly, hideSpend } = useViewing();
  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the modal instead of leaving the page

  // While visiting, the family is resolved from the visited snapshot; otherwise
  // from your own library.
  const members = familyMembers(viewing ? viewing.games : games, game);
  const isFamily = members.length > 1;
  const [selectedId, setSelectedId] = useState(game.id);
  const selected = members.find((m) => m.id === selectedId) ?? members[0] ?? game;

  const headerTitle = readOnly ? (isFamily ? "Game Family" : selected.title) : isFamily ? "Game Family" : "Edit game";

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

        {isFamily && (
          <div className="flex gap-1 overflow-x-auto border-b border-line p-2">
            {members.map((m) => {
              const active = m.id === selectedId;
              const Icon = STATUS_ICON[m.status];
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                    (active ? "bg-brand/15 text-accent" : "text-muted hover:bg-panel hover:text-ink")
                  }
                >
                  <Icon size={14} className={active ? "text-accent" : "text-subtle"} />
                  <span className="max-w-[160px] truncate">{m.title}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Per-edition actions (buy / log / finish / shelve, unlock cost, note).
            Read-only when visiting — a passive status footer instead. */}
        {isFamily && (
          <div className="border-b border-line bg-panel/30 p-4">
            {readOnly ? (
              <ReadOnlyFooter key={selected.id} game={selected} />
            ) : (
              <GameActions key={selected.id} game={selected} />
            )}
          </div>
        )}

        {/* Details for the selected edition. Keyed so it re-inits when you switch
            tabs. Editable for the owner; look-only while visiting. */}
        {readOnly ? (
          <ReadOnlyDetail key={selected.id} game={selected} hideSpend={hideSpend} />
        ) : (
          <EditGameForm key={selected.id} game={selected} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
