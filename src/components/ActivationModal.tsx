import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Gamepad2, Ticket, Lock, ArrowRight, Timer, RotateCcw, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { computeFormula } from "../lib/economy";
import { computeFinishReward } from "../lib/pricing";
import { isReplayFinish } from "../lib/families";
import {
  canStartGame,
  eligibleStartSlots,
  defaultStartChoice,
  playingGames,
  type SlotChoice,
  type SlotKind,
} from "../lib/slots";
import { canRedeemVoucher } from "../lib/vouchers";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { CoinIcon } from "./CoinIcon";

// Icon per slot kind shown in the picker (general gets the controller).
const PICKER_ICON: Record<SlotKind | "general" | "rotation", LucideIcon> = {
  general: Gamepad2,
  standard: Timer,
  endless: InfinityIcon,
  rotation: InfinityIcon,
  replay: RotateCcw,
};

/** Stable key for a SlotChoice, for marking the selected radio. */
function choiceKey(c: SlotChoice): string {
  return c.kind === "slot" ? `slot:${c.id}` : c.kind;
}

/**
 * The activation choice for moving a Bazaar (backlog) game into Now Playing. It
 * presents the standard coin activation fee alongside a prominent "Use Voucher"
 * option whenever the player holds an Onboarding Free Game Voucher — the only
 * place a voucher can be spent. When the game qualifies for more than one open
 * slot, a picker lets the player choose where it lands (a smart default is
 * preselected). Strictly Bazaar → Now Playing — never reachable from the Wishlist.
 */
export function ActivationModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const {
    coins,
    vouchers,
    economy,
    games,
    generalSlots,
    rotationSlots,
    myTargetedSlots,
    buyGame,
    redeemVoucher,
  } = useStore();
  const [working, setWorking] = useState<"coins" | "voucher" | null>(null);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const price = computeFormula(game, economy.price);
  const bounty = computeFormula(game, economy.bounty);
  const reward = computeFinishReward(isReplayFinish(games, game), bounty, useStore.getState().replayBonusPct);
  const canAfford = coins >= price;
  const hasOpenSlot = canStartGame(game, games, generalSlots, myTargetedSlots, rotationSlots);
  const hasVoucher = canRedeemVoucher(vouchers, game.status);

  // The open slots this game can land in, and the smart default preselection.
  const playing = playingGames(games);
  const options = eligibleStartSlots(game, playing, generalSlots, myTargetedSlots, rotationSlots);
  const [choice, setChoice] = useState<SlotChoice>(() =>
    defaultStartChoice(game, playing, generalSlots, myTargetedSlots, rotationSlots),
  );
  // The Rotation lane is free, so when it's chosen the coin/voucher costs vanish.
  const isRotationChoice = choice.kind === "rotation";
  // Surface the picker when there's a real choice, OR whenever the Rotation lane is
  // an option — landing in Rotation (free, no bounty) should always be a conscious
  // pick. The chosen choice (smart default or the player's pick) is always passed.
  const showPicker = options.length > 1 || options.some((o) => o.kind === "rotation");

  async function pickCoins() {
    if (working || !hasOpenSlot || (!canAfford && !isRotationChoice)) return;
    setWorking("coins");
    await buyGame(game.id, choice);
    onClose();
  }
  async function pickVoucher() {
    if (working || !hasVoucher || !hasOpenSlot) return;
    setWorking("voucher");
    await redeemVoucher(game.id, choice);
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

          {/* Slot picker: when the game qualifies for more than one open slot, let
              the player choose where it lands (a smart default is preselected). */}
          {showPicker && (
            <div className="rounded-xl border border-line p-2">
              <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wide text-subtle">
                Start in
              </div>
              <div className="flex flex-col gap-1">
                {options.map((o) => {
                  const Icon = PICKER_ICON[o.kind];
                  const selected = choiceKey(o.choice) === choiceKey(choice);
                  return (
                    <button
                      key={choiceKey(o.choice)}
                      type="button"
                      onClick={() => setChoice(o.choice)}
                      className={
                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition " +
                        (selected ? "border-brand bg-brand/10 text-ink" : "border-line text-muted hover:border-brand/50")
                      }
                    >
                      <Icon size={14} className={selected ? "text-accent" : ""} />
                      <span className="flex-1 truncate">{o.label}</span>
                      <span className="shrink-0 text-[11px] text-subtle">{o.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Voucher path — shown prominently first whenever one is available. The
              Rotation lane is already free, so a voucher is pointless there. */}
          {hasVoucher && !isRotationChoice && (
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

          {/* Main action: free for the Rotation lane, otherwise the coin fee. */}
          <button
            onClick={pickCoins}
            disabled={(!canAfford && !isRotationChoice) || !hasOpenSlot || working !== null}
            className={
              "flex items-center justify-between rounded-2xl px-4 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 " +
              (hasVoucher && !isRotationChoice
                ? "border border-line text-ink hover:bg-panel active:scale-[0.99]"
                : "bg-brand text-brand-fg shadow-sm hover:brightness-105 active:brightness-95")
            }
          >
            <span className="inline-flex items-center gap-2">
              {isRotationChoice ? (
                <>
                  <InfinityIcon size={16} /> Add to Rotation
                </>
              ) : (
                <>
                  <CoinIcon size={16} /> Pay with coins
                </>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm">
              {isRotationChoice ? (
                <span className="rounded-full bg-brand-fg/15 px-2 py-0.5 text-xs uppercase tracking-wide">
                  Free
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CoinIcon size={14} /> {price.toLocaleString()}
                </span>
              )}
              <ArrowRight size={15} className="opacity-70" />
              <Gamepad2 size={15} className={hasVoucher && !isRotationChoice ? "text-muted" : ""} />
            </span>
          </button>

          {!canAfford && !isRotationChoice && (
            <p className="px-1 text-center text-xs text-danger">
              You need <CoinIcon size={11} /> {(price - coins).toLocaleString()} more coins
              {hasVoucher ? " — or use a voucher above." : "."}
            </p>
          )}
          <p className="px-1 pt-0.5 text-center text-[11px] text-subtle">
            {isRotationChoice ? (
              "Free to add — a Rotation game earns coins from a weekly check-in instead of a finish bounty."
            ) : (
              <>
                Finish it later to earn a bounty of <CoinIcon size={11} /> {reward.toLocaleString()}.
                {hasVoucher && " A voucher activation is free, so shelving it refunds nothing."}
              </>
            )}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
