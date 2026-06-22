import { useState } from "react";
import { X, Gamepad2, Store, Heart, Trophy, type LucideIcon } from "lucide-react";
import type { Game, GameStatus } from "../types";
import { useStore } from "../store";
import { ownedPlatformLabels } from "../lib/platforms";
import { parsePlaytime, formatPlaytime } from "../lib/playtime";
import { familyMembers } from "../lib/families";
import { CopyRowsEditor, copyToRow, rowsToCopies, type CopyRowDraft } from "./CopyRowsEditor";
import { LinkedEditions } from "./LinkedEditions";
import { GameActions } from "./GameActions";
import { useScrollLock } from "../lib/useScrollLock";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

const STATUS_ICON: Record<GameStatus, LucideIcon> = {
  playing: Gamepad2,
  backlog: Store,
  wishlist: Heart,
  finished: Trophy,
};

/** Edit one edition's details: title, release date, length, time played, and the
 *  copies you own. Status/coins/reward snapshots move through play, not here. */
function EditGameForm({ game, onClose }: { game: Game; onClose: () => void }) {
  const { editGame, myPlatforms, customPlatforms } = useStore();

  const [title, setTitle] = useState(game.title);
  const [released, setReleased] = useState(game.released ?? "");
  const [hours, setHours] = useState(game.hours != null ? String(game.hours) : "");
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
    if (!title.trim()) return;
    await editGame(game.id, {
      title,
      released: released || undefined,
      hours: hours ? Number(hours) : undefined,
      playedHours: isWishlist ? (game.playedHours ?? 0) : (parsePlaytime(played) ?? 0),
      copies: rowsToCopies(rows),
    });
    onClose();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 p-4">
      <label className="text-sm text-muted">
        Title
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
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
          Editing played hours here doesn&apos;t earn coins — use “Log time” while playing for that.
        </p>
      )}

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

      <div className="border-t border-line pt-3">
        <LinkedEditions game={game} />
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
  );
}

/** The game detail screen. For a linked Game Family it shows per-edition sub-tabs
 *  — each tab carries that edition's actions (buy/log/finish), unlock cost,
 *  progress note, and editable stats. A standalone game shows just its form. */
export function EditGameModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { games } = useStore();
  useScrollLock(true);

  const members = familyMembers(games, game);
  const isFamily = members.length > 1;
  const [selectedId, setSelectedId] = useState(game.id);
  const selected = members.find((m) => m.id === selectedId) ?? members[0] ?? game;

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
          <h2 className="font-display text-xl text-ink">{isFamily ? "Game Family" : "Edit game"}</h2>
          <button onClick={onClose} className="text-muted transition hover:text-ink">
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

        {/* Per-edition actions (buy / log / finish / shelve, unlock cost, note). */}
        {isFamily && (
          <div className="border-b border-line bg-panel/30 p-4">
            <GameActions key={selected.id} game={selected} />
          </div>
        )}

        {/* Editable details for the selected edition. Keyed so the form re-inits
            when you switch tabs. */}
        <EditGameForm key={selected.id} game={selected} onClose={onClose} />
      </div>
    </div>
  );
}
