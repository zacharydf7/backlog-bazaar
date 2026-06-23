import { Scroll, X, Plus, Minus } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { charterResale, canBuyCharter, canSellCharter } from "../lib/charters";

// Buy / sell Import Charters. A charter is an economic license you stockpile in
// your wallet and spend to move a game from the Wishlist into your Bazaar.
// Reachable from the wallet's charter pill and the Wishlist cards' "Get a
// Charter" prompt. The actual mutations are server-authoritative (store actions).
export function ChartersModal() {
  const charters = useStore((s) => s.charters);
  const coins = useStore((s) => s.coins);
  const cost = useStore((s) => s.charterCost);
  const resalePct = useStore((s) => s.charterResalePct);
  const buyCharter = useStore((s) => s.buyCharter);
  const sellCharter = useStore((s) => s.sellCharter);
  const close = useStore((s) => s.closeCharters);

  useScrollLock(true);
  useHistoryDismiss(true, close);

  const resale = charterResale(cost, resalePct);
  const canBuy = canBuyCharter(coins, cost);
  const canSell = canSellCharter(charters);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Scroll size={18} className="text-accent" /> Import Charters
          </h2>
          <button onClick={close} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {/* Current holdings. */}
          <div className="flex items-center justify-between rounded-xl border border-brand/40 bg-brand/10 px-4 py-3">
            <span className="text-sm text-muted">You hold</span>
            <span className="inline-flex items-center gap-1.5 font-display text-xl font-semibold text-accent">
              <Scroll size={18} /> {charters}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-muted">
            An <span className="font-medium text-ink">Import Charter</span> is a license you spend to
            move a game from your Wishlist into your Bazaar. Stockpile them now and consume one
            whenever you&apos;re ready to commit to a game.
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => buyCharter()}
              disabled={!canBuy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} /> Buy a charter
              <span className="inline-flex items-center gap-1 opacity-90">
                · <CoinIcon size={13} /> {cost}
              </span>
            </button>
            {!canBuy && (
              <p className="text-center text-xs text-danger">
                You need <CoinIcon size={11} /> {cost} coins to buy a charter.
              </p>
            )}

            <button
              onClick={() => sellCharter()}
              disabled={!canSell}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Minus size={15} /> Sell a charter
              <span className="inline-flex items-center gap-1 text-success">
                · +<CoinIcon size={13} /> {resale}
              </span>
            </button>
          </div>

          <p className="text-xs leading-relaxed text-subtle">
            Selling returns {resalePct}% of the cost ({resale} of {cost} coins) — the rest is a
            haircut, so charters aren&apos;t a way to park coins.
          </p>
        </div>
      </div>
    </div>
  );
}
