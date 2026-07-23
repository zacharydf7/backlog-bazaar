import { useState } from "react";
import { Banknote, CalendarClock, Check, Scroll, X } from "lucide-react";
import type { Game, GameCopy } from "../types";
import { useStore } from "../store";
import { newCopyId, versionLabel } from "../lib/copies";
import { parseAmount } from "../lib/mathInput";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

/** The "did you pre-order it?" interception on a wishlist import (issue
 *  fe5f7f54): spending an Import Charter on a game the catalog says isn't out
 *  yet almost always means a placed pre-order. Confirming imports the game as
 *  a locked pre-order (countdown, pinned, unlocks on release) with the
 *  expected date and what-you-paid recorded — and if the order later falls
 *  through, cancelling returns the charter. Declining runs the plain import.
 *  Mounted once in App; renders only while the store holds an intercepted
 *  import (the charter is spent only after the answer). */
export function ImportPreorderPrompt() {
  const promptId = useStore((s) => s.preorderImportPromptId);
  const games = useStore((s) => s.games);
  const game = promptId ? games.find((g) => g.id === promptId) : undefined;
  if (!game) return null;
  // Keyed by game so a later prompt for another game starts with fresh fields.
  return <PromptBody key={game.id} game={game} />;
}

function PromptBody({ game }: { game: Game }) {
  const importWithCharter = useStore((s) => s.importWithCharter);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const close = useStore((s) => s.closePreorderImportPrompt);

  useScrollLock(true);
  useHistoryDismiss(true, close);

  const copies = game.copies ?? [];
  // The catalog release date prefills the expected date; it's the player's
  // order though, so it stays editable (regional dates, delays).
  const [date, setDate] = useState(game.released ?? "");
  const [copyId, setCopyId] = useState(copies[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [working, setWorking] = useState(false);
  const targetCopy = copies.find((c) => c.id === copyId) ?? copies[0];

  const confirm = async (asPreorder: boolean) => {
    if (working) return;
    setWorking(true);
    if (!asPreorder) {
      await importWithCharter(game.id, { preorder: "skip" });
      setWorking(false);
      return;
    }
    const parsed = parseAmount(amount);
    const cost = parsed != null && parsed >= 0 ? parsed : undefined;
    // What-you-paid lands on the chosen version's copy — or a platform-less
    // copy when none is recorded yet (the PreorderModal convention).
    let nextCopies: GameCopy[] | undefined;
    if (cost !== undefined && cost !== targetCopy?.cost) {
      nextCopies = targetCopy
        ? copies.map((c) => (c.id === targetCopy.id ? { ...c, cost } : c))
        : [{ id: newCopyId(), platform: "", cost }];
    }
    await importWithCharter(game.id, {
      preorder: { expectedOn: date.trim() || null, copies: nextCopies },
    });
    setWorking(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <CalendarClock size={18} className="text-accent" /> Did you pre-order it?
          </h2>
          <button
            onClick={close}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          <span className="font-medium text-ink">{game.title}</span> isn&apos;t out yet. If
          you&apos;ve pre-ordered it, it lands in your Bazaar as a{" "}
          <span className="font-medium text-ink">pre-order</span> — locked with a countdown,
          unlocking by itself on release day.
          {economyEnabled &&
            " And if the order ever falls through, cancelling returns your Import Charter."}
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
            Prefilled from the catalog when known. Dates slip — edit any time.
          </span>
        </label>
        {copies.length > 1 && (
          <label className="mt-3 block text-sm text-muted">
            Which version did you pre-order?
            <select
              value={targetCopy?.id ?? ""}
              onChange={(e) => setCopyId(e.target.value)}
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
            Optional. Saved on the version&apos;s copy for your spend stats.
          </span>
        </label>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void confirm(true)}
            disabled={working}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-60"
          >
            <Check size={15} /> Yes — import as a pre-order
          </button>
          <button
            onClick={() => void confirm(false)}
            disabled={working}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-muted transition hover:text-ink disabled:opacity-60"
          >
            <Scroll size={13} /> No — just import it
          </button>
        </div>
      </div>
    </div>
  );
}
