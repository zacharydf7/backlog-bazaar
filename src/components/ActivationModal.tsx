import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Gamepad2, Ticket, Lock, ArrowRight, Infinity as InfinityIcon } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { computeFormula } from "../lib/economy";
import { computeFinishReward } from "../lib/pricing";
import { isReplayFinish } from "../lib/families";
import { canStartGame, openEndlessSlots, planSlotForGame, playingGames } from "../lib/slots";
import { canRedeemVoucher } from "../lib/vouchers";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { CoinIcon } from "./CoinIcon";

/**
 * The activation choice for moving a Bazaar (backlog) game into Now Playing. It
 * presents the standard coin activation fee alongside a prominent "Use Voucher"
 * option whenever the player holds an Onboarding Free Game Voucher — the only
 * place a voucher can be spent. Both paths land the game in the same open slot;
 * the voucher path is free (and records a zero-cost ledger entry). Strictly
 * Bazaar → Now Playing — never reachable from the Wishlist.
 */
export function ActivationModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { coins, vouchers, economy, games, generalSlots, myTargetedSlots, buyGame, redeemVoucher } =
    useStore();
  const [working, setWorking] = useState<"coins" | "voucher" | null>(null);
  const [parkEndless, setParkEndless] = useState(false);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const price = computeFormula(game, economy.price);
  const bounty = computeFormula(game, economy.bounty);
  const reward = computeFinishReward(isReplayFinish(games, game), bounty, useStore.getState().replayBonusPct);
  const canAfford = coins >= price;
  const hasOpenSlot = canStartGame(game, games, generalSlots, myTargetedSlots);
  const hasVoucher = canRedeemVoucher(vouchers, game.status);

  // Endless ("ongoing") option: offered when the player holds an open Endless
  // slot. If no general/standard slot can auto-place the game, the only way in is
  // an Endless slot, so the choice is forced on.
  const endlessSlots = openEndlessSlots(playingGames(games), myTargetedSlots);
  const autoPlaceable = planSlotForGame(game, playingGames(games), generalSlots, myTargetedSlots).ok;
  const mustUseEndless = !autoPlaceable && endlessSlots.length > 0;
  const useEndless = (parkEndless || mustUseEndless) && endlessSlots.length > 0;
  const targetSlotId = useEndless ? endlessSlots[0].id : undefined;

  async function pickCoins() {
    if (working || !canAfford || !hasOpenSlot) return;
    setWorking("coins");
    await buyGame(game.id, targetSlotId);
    onClose();
  }
  async function pickVoucher() {
    if (working || !hasVoucher || !hasOpenSlot) return;
    setWorking("voucher");
    await redeemVoucher(game.id, targetSlotId);
    onClose();
  }

  // Portal to <body> so the fixed overlay isn't trapped by a transformed ancestor
  // (the game card uses a hover translate, which would otherwise capture
  // position:fixed and make the modal flicker as the hover state toggles).
  return createPortal(
    // Backdrop click closes — this is a quick decision, not in-progress input.
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
            <Gamepad2 size={15} className="text-accent" /> Start playing
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-lg p-1 text-subtle transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-2 pt-3">
          <h2 className="font-display text-lg leading-tight text-ink">{game.title}</h2>
          <p className="mt-1 text-sm text-muted">
            Move it from the Bazaar into a Now Playing slot. Choose how to cover the activation
            fee.
          </p>
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5 pt-2">
          {!hasOpenSlot && (
            <p className="inline-flex items-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-xs text-danger">
              <Lock size={13} /> No open Now Playing slot — finish or shelve a game first.
            </p>
          )}

          {/* Endless slot: park an ongoing/live-service game in a dedicated slot so
              it doesn't tie up a general slot. Forced on when it's the only opening. */}
          {endlessSlots.length > 0 && (
            <label
              className={
                "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs transition " +
                (useEndless ? "border-brand/50 bg-brand/5" : "border-line") +
                (mustUseEndless ? " opacity-90" : " cursor-pointer")
              }
            >
              <input
                type="checkbox"
                checked={useEndless}
                disabled={mustUseEndless}
                onChange={(e) => setParkEndless(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
              />
              <span className="flex-1">
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  <InfinityIcon size={13} className="text-accent" /> Park in “{endlessSlots[0].definition.name}”
                </span>
                <span className="mt-0.5 block text-subtle">
                  {mustUseEndless
                    ? "Your general slots are full — this ongoing slot is the open one."
                    : "Keep this ongoing game out of your general slots."}
                </span>
              </span>
            </label>
          )}

          {/* Voucher path — shown prominently first whenever one is available. */}
          {hasVoucher && (
            <button
              onClick={pickVoucher}
              disabled={!hasOpenSlot || working !== null}
              className="group flex items-center justify-between rounded-2xl bg-brand px-4 py-3 font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <Ticket size={17} /> Use a voucher
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="rounded-full bg-brand-fg/15 px-2 py-0.5 text-xs uppercase tracking-wide">
                  Free
                </span>
                <ArrowRight size={15} className="opacity-80" />
                <Gamepad2 size={15} />
              </span>
            </button>
          )}

          {/* Standard coin payment. */}
          <button
            onClick={pickCoins}
            disabled={!canAfford || !hasOpenSlot || working !== null}
            className={
              "flex items-center justify-between rounded-2xl px-4 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 " +
              (hasVoucher
                ? "border border-line text-ink hover:bg-panel active:scale-[0.99]"
                : "bg-brand text-brand-fg shadow-sm hover:brightness-105 active:brightness-95")
            }
          >
            <span className="inline-flex items-center gap-2">
              <CoinIcon size={16} /> Pay with coins
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span className="inline-flex items-center gap-1">
                <CoinIcon size={14} /> {price.toLocaleString()}
              </span>
              <ArrowRight size={15} className="opacity-70" />
              <Gamepad2 size={15} className={hasVoucher ? "text-muted" : ""} />
            </span>
          </button>

          {!canAfford && (
            <p className="px-1 text-center text-xs text-danger">
              You need <CoinIcon size={11} /> {(price - coins).toLocaleString()} more coins
              {hasVoucher ? " — or use a voucher above." : "."}
            </p>
          )}
          <p className="px-1 pt-0.5 text-center text-[11px] text-subtle">
            Finish it later to earn a bounty of <CoinIcon size={11} /> {reward.toLocaleString()}.
            {hasVoucher && " A voucher activation is free, so shelving it refunds nothing."}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
