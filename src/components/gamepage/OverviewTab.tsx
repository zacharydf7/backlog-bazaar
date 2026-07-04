import { useEffect, useState } from "react";
import { ImagePlus, Trash2, RotateCcw, Banknote } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { fetchGameCover } from "../../lib/gamedata";
import { formatPlaytime } from "../../lib/playtime";
import {
  ownedPlatformSummary,
  isDlcOnly,
  formatLabel,
  totalCost,
  hasAnyCost,
  formatUsd,
} from "../../lib/copies";
import { SuggestEditButton } from "../GameSubmissionForm";
import { ScreenshotGallery } from "../ScreenshotGallery";
import { PlatformBadge } from "../PlatformBadge";

export function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-subtle">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

/** The "just looking" pane: your cover customization, the shared catalog
 *  metadata (read-only — corrections go through Suggest edit), and an
 *  at-a-glance ownership/spend rollup (editing copies lives in Library). */
export function OverviewTab({ game, screenshots }: { game: Game; screenshots: string[] }) {
  const { cloud, setGameImage, clearGameImage, restoreGameImage, restoreOriginalImage } =
    useStore();

  // Offer "restore default" only when there's a default cover to go back to and
  // the current one differs (custom upload, or removed).
  const canRestore = Boolean(game.stockImage) && game.image !== game.stockImage;

  // The cover this game shipped with: re-fetched live from RAWG (authoritative,
  // and recovers it even for games edited before we tracked it), falling back
  // to the stored original for community games with no RAWG id.
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
  const originalTarget = game.rawgId ? rawgCover : game.originalImage;
  // Offer "restore original" ONLY when the user is on their own uploaded cover —
  // the current image must differ from BOTH the original art and the (possibly
  // community-approved) default. Once art is approved it becomes the canonical
  // cover, so a user viewing the default/approved cover shouldn't be offered a
  // revert to the old original.
  const canRestoreOriginal =
    Boolean(originalTarget) &&
    originalTarget !== game.image &&
    game.image !== game.stockImage;

  return (
    <div className="flex flex-col gap-4">
      {/* Your personal cover — the hero above shows it large; these controls
          customize only your own cards. */}
      {cloud && (
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
            {game.image && (
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
      )}

      <CatalogCard game={game} screenshots={screenshots} />
      <OwnershipRollup game={game} hideSpend={false} />
    </div>
  );
}

/** Shared catalog metadata — read-only; corrections go through moderation. */
function CatalogCard({
  game,
  screenshots,
  playedStat = false,
}: {
  game: Game;
  screenshots: string[];
  /** Visitors get a Played stat here (owners edit time in Journey instead). */
  playedStat?: boolean;
}) {
  return (
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
        <DetailStat label="Length" value={game.hours ? formatPlaytime(game.hours) : "—"} />
        {playedStat && (
          <DetailStat label="Played" value={formatPlaytime(game.playedHours ?? 0)} />
        )}
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        Title, length and screenshots are shared with everyone — use Suggest edit to change them.
      </p>
    </div>
  );
}

/** "Owned on …" plus the per-copy spend breakdown, at a glance. */
function OwnershipRollup({ game, hideSpend }: { game: Game; hideSpend: boolean }) {
  const owned = ownedPlatformSummary(game.copies);
  const showSpend = !hideSpend && hasAnyCost(game.copies);
  if (owned.length === 0 && !showSpend) return null;

  return (
    <div className="flex flex-col gap-2">
      {owned.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-subtle">
            {game.status === "wishlist" ? "Want on" : "Owned on"}
          </span>
          <div className="flex flex-wrap gap-1">
            {owned.map((o) => (
              <PlatformBadge key={o.platform} label={o.platform} dlc={isDlcOnly(o)} />
            ))}
          </div>
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

/** The look-only Overview: catalog metadata (with a Played stat) plus the
 *  ownership/spend rollup, spend omitted when the owner hides it. Used for the
 *  visitor variant of the game page and the chat share preview. */
export function ReadOnlyOverview({
  game,
  hideSpend,
  screenshots = [],
}: {
  game: Game;
  hideSpend: boolean;
  screenshots?: string[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <CatalogCard game={game} screenshots={screenshots} playedStat />
      <OwnershipRollup game={game} hideSpend={hideSpend} />
    </div>
  );
}
