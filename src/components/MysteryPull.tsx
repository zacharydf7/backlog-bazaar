import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dices, X, Clock } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { mysteryPullPool, drawPull } from "../lib/mysteryPull";
import { computeFormula } from "../lib/economy";
import { computeFamilyDiscountPrice } from "../lib/pricing";
import { isFamilyDiscounted } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { ActivationModal } from "./ActivationModal";
import { CoinIcon } from "./CoinIcon";

/** The Bazaar toolbar's Mystery Pull: cure choice paralysis by letting the
 *  Bazaar pick. Draws a random game the player can start RIGHT NOW (normal
 *  price, open compatible slot — see lib/mysteryPull.ts) and prompts them to
 *  add it to Now Playing, re-roll, or walk away. Accepting hands off to the
 *  standard ActivationModal, so pricing, vouchers, and lane choice are the
 *  exact buy flow; a confirmed pull is recorded to mystery_pull_events. */
export function MysteryPull() {
  const games = useStore((s) => s.games);
  const coins = useStore((s) => s.coins);
  const vouchers = useStore((s) => s.vouchers);
  const economy = useStore((s) => s.economy);
  const replayBonusPct = useStore((s) => s.replayBonusPct);
  const generalSlots = useStore((s) => s.generalSlots);
  const completionistSlots = useStore((s) => s.completionistSlots);
  const [open, setOpen] = useState(false);

  const ctx = { coins, vouchers, economy, replayBonusPct, generalSlots, completionistSlots };
  const { pool, reason } = mysteryPullPool(games, ctx);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pool.length === 0}
        title={reason ?? "Let the Bazaar pick your next game"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-ink transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Dices size={15} className="text-accent" />
        <span className="sr-only sm:not-sr-only">Mystery Pull</span>
      </button>
      {open && <MysteryPullModal onClose={() => setOpen(false)} />}
    </>
  );
}

function MysteryPullModal({ onClose }: { onClose: () => void }) {
  const games = useStore((s) => s.games);
  const coins = useStore((s) => s.coins);
  const vouchers = useStore((s) => s.vouchers);
  const economy = useStore((s) => s.economy);
  const replayBonusPct = useStore((s) => s.replayBonusPct);
  const generalSlots = useStore((s) => s.generalSlots);
  const completionistSlots = useStore((s) => s.completionistSlots);
  const logMysteryPull = useStore((s) => s.logMysteryPull);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // The pool recomputes live (coins/slots can change under the modal); the
  // current draw is held by id so re-renders keep showing the same game.
  const ctx = { coins, vouchers, economy, replayBonusPct, generalSlots, completionistSlots };
  const { pool } = mysteryPullPool(games, ctx);

  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [currentId, setCurrentId] = useState<string | null>(() => drawPull(pool, new Set())?.id ?? null);
  const [rerolls, setRerolls] = useState(0);
  const [activating, setActivating] = useState(false);

  const current: Game | undefined = games.find((g) => g.id === currentId);

  function reroll() {
    if (!currentId) return;
    const nextSeen = new Set(seen).add(currentId);
    const next = drawPull(
      pool.filter((g) => g.id !== currentId),
      nextSeen,
    );
    if (!next) return; // pool of one — nothing else to show
    // A full cycle restarts the exclusion set (keeping the fresh draw) so every
    // game stays reachable without immediate repeats.
    setSeen(nextSeen.has(next.id) ? new Set([next.id]) : nextSeen);
    setCurrentId(next.id);
    setRerolls((n) => n + 1);
  }

  // Activation closed: if the pulled game started, the pull is confirmed —
  // record it and close. Otherwise the player backed out; keep the pull open.
  function onActivationClose() {
    setActivating(false);
    const after = useStore.getState().games.find((g) => g.id === currentId);
    if (after?.status === "playing" && currentId) {
      void logMysteryPull(currentId, rerolls);
      onClose();
    }
  }

  // The drawn game vanished under us (removed/merged) — bail out via effect,
  // never as a render side effect.
  useEffect(() => {
    if (!current) onClose();
  }, [current, onClose]);
  if (!current) return null;

  const fullPrice = computeFormula(current, economy.price);
  const price = isFamilyDiscounted(games, current)
    ? computeFamilyDiscountPrice(fullPrice, replayBonusPct)
    : fullPrice;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
            <Dices size={15} className="text-accent" /> Mystery Pull
          </span>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            <div className="aspect-[16/9] w-full">
              {current.image ? (
                <img src={current.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl opacity-50">🎮</div>
              )}
            </div>
          </div>

          <div>
            <h2 className="font-display text-xl leading-tight text-ink">{current.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <CoinIcon size={14} /> {price} to start
              </span>
              {current.hours != null && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} className="text-accent/70" /> ~{formatPlaytime(current.hours)}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-subtle">
            The Bazaar picked this one for you. Take it on, roll again, or walk away — nothing
            is charged until you start it.
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setActivating(true)}
              className="w-full rounded-xl bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
            >
              Add to Now Playing
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reroll}
                disabled={pool.length < 2}
                title={pool.length < 2 ? "Nothing else to pull right now" : undefined}
                className="flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 font-medium text-ink transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Dices size={15} className="text-accent" /> Re-roll
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 font-medium text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {activating && <ActivationModal game={current} onClose={onActivationClose} />}
    </div>,
    document.body,
  );
}
