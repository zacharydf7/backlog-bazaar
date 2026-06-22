import { useState } from "react";
import { X } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { ownedPlatformLabels } from "../lib/platforms";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import { CopyRowsEditor, copyToRow, rowsToCopies, type CopyRowDraft } from "./CopyRowsEditor";
import { useScrollLock } from "../lib/useScrollLock";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

/** Edit an existing game's details: title, release date, length, time played,
 *  and the copies you own (platforms + what each cost). Status, coins and reward
 *  snapshots are intentionally not editable here — those move through play. */
export function EditGameModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { editGame, myPlatforms, customPlatforms } = useStore();
  useScrollLock(true);

  const [title, setTitle] = useState(game.title);
  const [released, setReleased] = useState(game.released ?? "");
  const [hours, setHours] = useState(game.hours != null ? String(game.hours) : "");
  const [played, setPlayed] = useState(formatPlaytime(game.playedHours ?? 0));
  const [rows, setRows] = useState<CopyRowDraft[]>((game.copies ?? []).map(copyToRow));

  // Suggest the consoles you own, plus any platforms already on this game.
  const existing = (game.copies ?? []).map((c) => c.platform);
  const platformOptions = [
    ...new Set([...ownedPlatformLabels(myPlatforms, customPlatforms), ...existing]),
  ];

  // A wishlisted game hasn't been bought/played, so hide the played-hours field
  // (consistent with hiding "Edit playtime" on wishlist cards).
  const isWishlist = game.status === "wishlist";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await editGame(game.id, {
      title,
      released: released || undefined,
      hours: hours ? Number(hours) : undefined,
      playedHours: isWishlist ? game.playedHours ?? 0 : parsePlaytime(played) ?? 0,
      copies: rowsToCopies(rows),
    });
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
          <h2 className="font-display text-xl text-ink">Edit game</h2>
          <button onClick={onClose} className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={save} className="flex flex-col gap-3 p-4">
          <label className="text-sm text-muted">
            Title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className={"grid gap-3 " + (isWishlist ? "grid-cols-2" : "grid-cols-3")}>
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
              <input
                type="number"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className={inputClass}
              />
            </label>
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
          </div>
          {!isWishlist && (
            <p className="-mt-1 text-xs text-subtle">
              Editing played hours here doesn&apos;t earn coins — use “Log time” while playing for
              that.
            </p>
          )}

          {/* Copies you own: platform (+ optional format), cost & note. Add as
              many as you like, including multiple copies on the same platform. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">
              Copies you own{" "}
              <span className="text-xs text-subtle">— platform, format, cost &amp; an optional note</span>
            </span>
            {rows.length === 0 && <p className="text-xs text-subtle">No copies recorded yet.</p>}
            <CopyRowsEditor
              rows={rows}
              onChange={setRows}
              platformOptions={platformOptions}
              listId="edit-platform-options"
            />
          </div>

          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              disabled={!title.trim()}
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
      </div>
    </div>
  );
}
