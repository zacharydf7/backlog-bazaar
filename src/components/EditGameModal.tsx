import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { PLATFORMS } from "../lib/platforms";
import { newCopyId } from "../lib/copies";
import { useScrollLock } from "../lib/useScrollLock";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

/** A copy being edited (cost kept as a string for the input). */
interface CopyRow {
  id: string;
  platform: string;
  cost: string;
  note: string;
}

/** Edit an existing game's details: title, release date, length, time played,
 *  and the copies you own (platforms + what each cost). Status, coins and reward
 *  snapshots are intentionally not editable here — those move through play. */
export function EditGameModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { editGame } = useStore();
  useScrollLock(true);

  const [title, setTitle] = useState(game.title);
  const [released, setReleased] = useState(game.released ?? "");
  const [hours, setHours] = useState(game.hours != null ? String(game.hours) : "");
  const [played, setPlayed] = useState(String(game.playedHours ?? 0));
  const [rows, setRows] = useState<CopyRow[]>(
    (game.copies ?? []).map((c) => ({
      id: c.id,
      platform: c.platform,
      cost: c.cost != null ? String(c.cost) : "",
      note: c.note ?? "",
    })),
  );

  // A wishlisted game hasn't been bought/played, so hide the played-hours field
  // (consistent with hiding "Edit playtime" on wishlist cards).
  const isWishlist = game.status === "wishlist";

  function addRow(platform = "") {
    setRows((r) => [...r, { id: newCopyId(), platform, cost: "", note: "" }]);
  }
  function updateRow(id: string, patch: Partial<CopyRow>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeRow(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const copies = rows
      .filter((r) => r.platform.trim())
      .map((r) => {
        const cost = Number(r.cost);
        return {
          id: r.id,
          platform: r.platform.trim(),
          cost: r.cost.trim() && Number.isFinite(cost) && cost >= 0 ? cost : undefined,
          note: r.note.trim() || undefined,
        };
      });
    await editGame(game.id, {
      title,
      released: released || undefined,
      hours: hours ? Number(hours) : undefined,
      playedHours: isWishlist ? game.playedHours ?? 0 : Number(played) || 0,
      copies,
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
                Played (h)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={played}
                  onChange={(e) => setPlayed(e.target.value)}
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

          {/* Copies you own: platform + cost + note. Add as many as you like,
              including multiple copies on the same platform. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">
              Copies you own{" "}
              <span className="text-xs text-subtle">— platform, cost &amp; an optional note</span>
            </span>
            <datalist id="edit-platform-options">
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.label} />
              ))}
            </datalist>

            {rows.length === 0 && (
              <p className="text-xs text-subtle">No copies recorded yet.</p>
            )}

            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <input
                  list="edit-platform-options"
                  value={r.platform}
                  onChange={(e) => updateRow(r.id, { platform: e.target.value })}
                  placeholder="Platform"
                  aria-label="Platform"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
                <div className="relative w-24 shrink-0">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.cost}
                    onChange={(e) => updateRow(r.id, { cost: e.target.value })}
                    placeholder="Cost"
                    aria-label="Cost"
                    className="w-full rounded-lg border border-line bg-panel py-1.5 pl-5 pr-2 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                  />
                </div>
                <input
                  value={r.note}
                  onChange={(e) => updateRow(r.id, { note: e.target.value })}
                  placeholder="Note"
                  aria-label="Note"
                  className="w-28 shrink-0 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
                />
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  aria-label="Remove copy"
                  className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-panel hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addRow()}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-ink transition hover:border-brand/50"
            >
              <Plus size={15} className="text-accent" /> Add a copy
            </button>
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
