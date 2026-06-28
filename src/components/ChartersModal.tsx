import { Scroll, X, Plus, Minus, ArrowRight } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import {
  charterResale,
  canBuyCharter,
  canSellCharter,
  cheapestBazaarPrice,
  activeIncomeGameCount,
  wouldSoftLock,
} from "../lib/charters";

// Buy / sell Import Charters. A charter is a license you stockpile in your wallet
// and spend to move a game from your Wishlist into your Bazaar — the disciplined
// path that rewards clearing your backlog before chasing new wants. The actual
// mutations are server-authoritative (store actions); this is just the surface.
export function ChartersModal() {
  const charters = useStore((s) => s.charters);
  const coins = useStore((s) => s.coins);
  const cost = useStore((s) => s.charterCost);
  const resalePct = useStore((s) => s.charterResalePct);
  const games = useStore((s) => s.games);
  const economy = useStore((s) => s.economy);
  const buyCharter = useStore((s) => s.buyCharter);
  const sellCharter = useStore((s) => s.sellCharter);
  const close = useStore((s) => s.closeCharters);

  useScrollLock(true);
  useHistoryDismiss(true, close);

  const resale = charterResale(cost, resalePct);
  const affordable = canBuyCharter(coins, cost);
  // Overdraft Guard: even when affordable, a charter is refused if it would soft-lock
  // you (no game in play AND it'd drop you below the cheapest Bazaar game). Mirrors
  // the store + server so the button reflects the rule before you tap it.
  const floor = cheapestBazaarPrice(games, economy.price);
  const softLock = wouldSoftLock(coins, cost, floor, activeIncomeGameCount(games));
  const canBuy = affordable && !softLock;
  const canSell = canSellCharter(charters);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-subtle">
            <Scroll size={15} className="text-accent" /> Import Charters
          </span>
          <button
            onClick={close}
            aria-label="Close"
            className="-mr-1 rounded-lg p-1 text-subtle transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero balance */}
        <div className="flex flex-col items-center gap-1 px-5 pb-5 pt-3">
          <span className="inline-flex items-center gap-2 font-display text-5xl font-semibold leading-none text-accent">
            <Scroll size={36} /> {charters}
          </span>
          <span className="text-sm text-muted">
            charter{charters === 1 ? "" : "s"} in your wallet
          </span>
        </div>

        {/* What it does */}
        <p className="mx-5 mb-4 rounded-2xl bg-panel px-4 py-3 text-center text-sm leading-relaxed text-muted">
          Spend a charter to move a game from your{" "}
          <span className="font-medium text-ink">Wishlist</span> into your{" "}
          <span className="font-medium text-ink">Bazaar</span>. Games you already own go
          straight to the Bazaar for free.
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-5 pb-5">
          <button
            onClick={() => buyCharter()}
            disabled={!canBuy}
            className="group flex items-center justify-between rounded-2xl bg-brand px-4 py-3 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} /> Buy a charter
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="inline-flex items-center gap-1 opacity-90">
                <CoinIcon size={14} /> {cost.toLocaleString()}
              </span>
              <ArrowRight size={15} className="opacity-80" />
              <Scroll size={15} />
            </span>
          </button>

          <button
            onClick={() => sellCharter()}
            disabled={!canSell}
            className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 font-semibold text-ink transition hover:bg-panel active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <Minus size={16} /> Sell a charter
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm text-success">
              <Scroll size={15} className="text-muted" />
              <ArrowRight size={15} className="text-muted" />
              <span className="inline-flex items-center gap-1">
                +<CoinIcon size={14} /> {resale.toLocaleString()}
              </span>
            </span>
          </button>

          {!affordable && (
            <p className="px-1 pt-0.5 text-center text-xs text-danger">
              You need <CoinIcon size={11} /> {cost.toLocaleString()} coins to buy one.
            </p>
          )}
          {affordable && softLock && (
            <p className="px-1 pt-0.5 text-center text-xs text-danger">
              Buying one would leave you short of the cheapest Bazaar game with nothing in play.
              Finish or shelve a game first.
            </p>
          )}
          <p className="px-1 text-center text-[11px] leading-relaxed text-subtle">
            Selling returns {resalePct}% of the cost — the rest is forfeit.
          </p>
        </div>
      </div>
    </div>
  );
}
