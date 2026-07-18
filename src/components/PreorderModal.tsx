import { useState } from "react";
import { CalendarClock, CalendarX, Check, X } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

/** Mark a wishlist entry as pre-ordered (or edit an existing pre-order): one
 *  date field, prefilled from the catalog release date when known. The date is
 *  optional — a pre-order with no date still pins and badges; it just can't
 *  count down or fire the release-day alert. Editing also offers the cancel. */
export function PreorderModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const setPreorder = useStore((s) => s.setPreorder);
  const clearPreorder = useStore((s) => s.clearPreorder);
  const editing = game.preorderedAt != null;
  const [date, setDate] = useState(game.preorderExpectedOn ?? game.released ?? "");

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const save = () => {
    void setPreorder(game.id, date.trim() || null);
    onClose();
  };
  const cancelPreorder = () => {
    void clearPreorder(game.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <CalendarClock size={18} className="text-accent" />
            {editing ? "Edit pre-order" : "Mark as pre-ordered"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          <span className="font-medium text-ink">{game.title}</span> stays on your Wishlist,
          pinned with the other pre-orders, and you&apos;ll get a heads-up when its day comes.
          Record what you paid on the entry&apos;s copies, like any game.
        </p>
        <label className="mt-4 block text-sm text-muted">
          Expected release
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
          <span className="mt-1 block text-[11px] text-subtle">
            Prefilled from the catalog when known. Dates slip — edit any time, and the
            release alert re-arms. Leave blank if it&apos;s not announced yet.
          </span>
        </label>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {editing ? (
            <button
              onClick={cancelPreorder}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-muted transition hover:text-danger"
            >
              <CalendarX size={14} /> Cancel pre-order
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105"
          >
            <Check size={15} /> {editing ? "Save" : "Pre-ordered it"}
          </button>
        </div>
      </div>
    </div>
  );
}
