import { useState } from "react";
import { Banknote, CalendarClock, CalendarX, Check, X } from "lucide-react";
import type { Game, GameCopy } from "../types";
import { useStore } from "../store";
import { newCopyId, versionLabel } from "../lib/copies";
import { parseAmount } from "../lib/mathInput";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

/** The pre-order fields shared by this modal and the Add flow: the expected
 *  date (optional) and what you paid, applied to one of the entry's copies —
 *  the same place every other real-world dollar lives. */
function costOf(copy: GameCopy | undefined): string {
  return copy?.cost != null ? String(copy.cost) : "";
}

/** Mark a Bazaar card as pre-ordered (or edit an existing pre-order): the
 *  expected date (prefilled from the catalog release date when known,
 *  optional) and the amount paid, recorded as the version's copy cost. A
 *  pre-order is already yours — it sits in your Bazaar locked from starting,
 *  and unlocks by itself when the date arrives. Editing also offers the
 *  cancel, which asks what to do with the card: a fallen-through order isn't
 *  owned anymore, so it's either removed or demoted to the Wishlist. */
export function PreorderModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const setPreorder = useStore((s) => s.setPreorder);
  const cancelPreorder = useStore((s) => s.cancelPreorder);
  const editing = game.preorderedAt != null;
  const copies = game.copies ?? [];
  const [date, setDate] = useState(game.preorderExpectedOn ?? game.released ?? "");
  // Which version the payment lands on (only asked with several versions).
  const [copyId, setCopyId] = useState(copies[0]?.id ?? "");
  const targetCopy = copies.find((c) => c.id === copyId) ?? copies[0];
  const [amount, setAmount] = useState(costOf(targetCopy));

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const pickCopy = (id: string) => {
    setCopyId(id);
    setAmount(costOf(copies.find((c) => c.id === id)));
  };

  const [confirmCancel, setConfirmCancel] = useState(false);
  const save = () => {
    const parsed = parseAmount(amount);
    const cost = parsed != null && parsed >= 0 ? parsed : undefined;
    // Rewrite the entry's copies only when the amount actually changed —
    // an untouched field must not churn the copies column.
    let nextCopies: GameCopy[] | undefined;
    if (cost !== targetCopy?.cost) {
      nextCopies = targetCopy
        ? copies.map((c) => (c.id === targetCopy.id ? { ...c, cost } : c))
        : cost != null
          ? // No version recorded yet: hold the payment on a platform-less
            // copy; picking the platform later keeps the cost.
            [{ id: newCopyId(), platform: "", cost }]
          : undefined;
    }
    void setPreorder(game.id, date.trim() || null, nextCopies);
    onClose();
  };
  const cancelAs = (disposition: "remove" | "wishlist") => {
    void cancelPreorder(game.id, disposition);
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
          <span className="font-medium text-ink">{game.title}</span> stays in your Bazaar — it&apos;s
          already yours — locked from starting, wearing a countdown. When the day comes it{" "}
          <span className="font-medium text-ink">unlocks by itself</span>, priced and ready to
          start.
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
            Prefilled from the catalog when known. Dates slip — edit any time. With no date, the
            card offers an &ldquo;it&apos;s arrived&rdquo; button instead.
          </span>
        </label>
        {copies.length > 1 && (
          <label className="mt-3 block text-sm text-muted">
            Which version did you pre-order?
            <select
              value={targetCopy?.id ?? ""}
              onChange={(e) => pickCopy(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-panel px-2 py-2 text-sm text-ink outline-none transition focus:border-brand"
            >
              {copies.map((c) => (
                <option key={c.id} value={c.id}>
                  {versionLabel(c.platform, c.format)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-3 block text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Banknote size={14} className="text-accent/70" /> What you paid (USD)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 69.99"
            title="Math works here — try 59.99+8.25%"
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
          <span className="mt-1 block text-[11px] text-subtle">
            Optional. Saved on the version&apos;s copy, so it joins your spend stats when the game
            lands in your Bazaar. Math works — try 59.99+8.25%.
          </span>
        </label>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          {editing ? (
            <button
              onClick={() => setConfirmCancel((v) => !v)}
              aria-expanded={confirmCancel}
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
        {confirmCancel && (
          // A cancelled order isn't owned anymore, so the card can't stay in
          // the Bazaar — the owner picks where it goes.
          <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-2.5">
            <p className="text-xs text-muted">
              Order fell through? Choose what happens to{" "}
              <span className="font-medium text-ink">{game.title}</span>:
              {game.preorderCharter && (
                <span className="mt-0.5 block text-success">
                  Either way, the Import Charter you spent on it comes back.
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => cancelAs("wishlist")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-brand/50"
              >
                Keep it on my Wishlist
              </button>
              <button
                onClick={() => cancelAs("remove")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger/15 px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/25"
              >
                Remove it from my library
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
