import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Gamepad2, Ticket, Lock, ArrowRight, Target, Handshake, BadgePercent, type LucideIcon } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { computeFormula } from "../lib/economy";
import { applyBountyRate, computeFinishReward, computeFamilyDiscountPrice } from "../lib/pricing";
import { recDiscountedPrice, recommendationForGame } from "../lib/recommendations";
import { isReplayFinish, isFamilyDiscounted } from "../lib/families";
import { canStartGame, canEnterLane, type SlotChoice } from "../lib/slots";
import { canRedeemVoucher } from "../lib/vouchers";
import { activePactForCard } from "../lib/coopPacts";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { CoinIcon } from "./CoinIcon";

/** One destination option in the buy picker. */
interface DestOption {
  choice: SlotChoice;
  icon: LucideIcon;
  label: string;
  sub: string;
}

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
  const { coins, vouchers, economy, games, compilations, generalSlots, completionistSlots, replayBonusPct, buyGame, redeemVoucher, economyEnabled, recommendations, recDiscountPct, userId, coOpPacts, bountyRate, previewStartPrice } =
    useStore();
  const [working, setWorking] = useState<"coins" | "voucher" | null>(null);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // Priced off the game's own acquisition date — must match GameActions and
  // store.buyGame so the fee shown is the fee paid. Economy off: no fee, no
  // bounty, no voucher path — a plain "Start playing" confirm (slots and story
  // locks still apply, and the store sends a forced-zero price).
  const fullPrice = computeFormula(game, economy.price);
  // Family Discount: an already active/cleared family drops the fee to the
  // Replay-Bonus percentage (cost mirrors payout) — same math as store.buyGame.
  const familyDiscount = isFamilyDiscounted(games, game);
  // Tastemaker (issue c48e8f6d): a friend's recommendation discounts the fee —
  // stacks after the family discount, matching store.buyGame exactly.
  const activeRec = recommendationForGame(recommendations, userId, game);
  const preRecPrice = familyDiscount
    ? computeFamilyDiscountPrice(fullPrice, replayBonusPct)
    : fullPrice;
  const price = activeRec ? recDiscountedPrice(preRecPrice, recDiscountPct) : preRecPrice;
  // A running coin event's start discount, which the server applies to
  // `price` when you start (asked for here so the fee shown is the fee paid).
  const [eventPrice, setEventPrice] = useState<{ price: number; eventName: string } | null>(null);
  useEffect(() => {
    if (!economyEnabled || price <= 0) return;
    let alive = true;
    void previewStartPrice(game.id, price).then((r) => {
      if (alive) setEventPrice(r);
    });
    return () => {
      alive = false;
    };
  }, [game.id, price, economyEnabled, previewStartPrice]);
  const payPrice = eventPrice?.price ?? price;
  // The running event behind the discount (matched by name, which is all the
  // preview returns), for its % and how many discounted starts remain.
  const bonusEvents = useStore((s) => s.bonusEvents);
  const discountEvent = eventPrice
    ? bonusEvents.find((e) => e.name === eventPrice.eventName && e.startDiscountPct > 0)
    : undefined;
  const startsLeftAfter =
    discountEvent?.discountLimit != null
      ? Math.max(0, discountEvent.discountLimit - discountEvent.discountUsed - 1)
      : null;
  const bounty = computeFormula(game, economy.bounty);
  const reward = applyBountyRate(
    computeFinishReward(isReplayFinish(games, game), bounty, replayBonusPct),
    bountyRate,
  );
  const canAfford = !economyEnabled || coins >= payPrice;
  const hasVoucher = economyEnabled && canRedeemVoucher(vouchers, game.status);

  // The destinations this game can land in: the Focus lane (the default — finish it),
  // and the Completionist lane (commit to a 100% run) when it has room. A card bound
  // to a live Co-op Pact lands in the uncapped Co-op lane instead of Focus, so a full
  // Focus lane never blocks it (store.buyGame + apply_purchase route it there).
  const hasOpenFocus = canStartGame(game, games, generalSlots);
  const pactBound = activePactForCard(coOpPacts, game.id) != null;
  const completionistHasRoom =
    !game.ongoing && canEnterLane(game, games, "completionist", completionistSlots);
  const options: DestOption[] = [];
  if (pactBound)
    options.push({ choice: { kind: "general" }, icon: Handshake, label: "Co-op", sub: "play together" });
  else if (hasOpenFocus)
    options.push({ choice: { kind: "general" }, icon: Gamepad2, label: "Focus", sub: "finish it" });
  if (completionistHasRoom)
    options.push({ choice: { kind: "completionist" }, icon: Target, label: "Completionist", sub: "go for 100%" });

  const [choice, setChoice] = useState<SlotChoice>(() =>
    pactBound || hasOpenFocus ? { kind: "general" } : { kind: "completionist" },
  );
  const hasOpenSlot = options.length > 0;
  // Show the picker whenever there's a choice — or when the only destination
  // isn't plain Focus, so a game never lands somewhere unexpected unannounced.
  const showPicker = options.length > 1 || (options.length === 1 && (pactBound || !hasOpenFocus));
  // Vouchers activate into Focus only — disable when the Completionist run is chosen.
  const voucherUsable = hasVoucher && choice.kind !== "completionist" && hasOpenFocus;

  async function pickCoins() {
    if (working || !canAfford || !hasOpenSlot) return;
    setWorking("coins");
    if (eventPrice) await buyGame(game.id, choice, { eventPrice: eventPrice.price });
    else await buyGame(game.id, choice);
    onClose();
  }
  async function pickVoucher() {
    if (working || !voucherUsable) return;
    setWorking("voucher");
    await redeemVoucher(game.id, { kind: "general" });
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
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl border border-line bg-surface shadow-2xl"
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
            {economyEnabled
              ? "Move it from the Bazaar into a Now Playing slot. Choose how to cover the activation fee."
              : "Move it from the Bazaar into a Now Playing slot."}
          </p>
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5 pt-2">
          {/* A coin event discount, impossible to miss: what you pay, what you
              save, and that the finish still pays in full. */}
          {economyEnabled && eventPrice && (
            <div className="rounded-2xl border-2 border-success bg-success/10 px-4 py-3" role="status">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                  <BadgePercent size={17} /> {eventPrice.eventName}
                </span>
                <span className="rounded-full bg-success px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-surface">
                  {discountEvent ? `${discountEvent.startDiscountPct}% off` : "Discounted"}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink">
                Pay <CoinIcon size={13} /> <strong>{payPrice.toLocaleString()}</strong> instead of{" "}
                <s className="opacity-60">{price.toLocaleString()}</s>. You save{" "}
                <strong>{(price - payPrice).toLocaleString()}</strong> coins.
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Finishing still pays the full bounty.
                {startsLeftAfter != null &&
                  ` After this, ${startsLeftAfter} discounted ${startsLeftAfter === 1 ? "start" : "starts"} left.`}
              </p>
            </div>
          )}
          {!hasOpenSlot && (
            <p className="inline-flex items-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-xs text-danger">
              <Lock size={13} /> No open Now Playing slot — finish or shelve a game, or raise your
              lane size in Account settings.
            </p>
          )}

          {/* Destination picker: where it lands (Focus to finish, Completionist for a
              100% run, or Co-op for a pact card) — see showPicker. */}
          {showPicker && (
            <div className="rounded-xl border border-line p-2">
              <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wide text-subtle">
                {!hasOpenFocus && !pactBound ? "Focus is full — start in" : "Start in"}
              </div>
              <div className="flex flex-col gap-1">
                {options.map((o) => {
                  const Icon = o.icon;
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

          {/* Voucher path — shown prominently first whenever one is available.
              Vouchers activate into Focus only. */}
          {hasVoucher && (
            <button
              onClick={pickVoucher}
              disabled={!voucherUsable || working !== null}
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

          {/* Standard coin payment — or a plain free start in economy-off mode. */}
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
              {economyEnabled ? (
                <>
                  <CoinIcon size={16} /> Pay with coins
                  {familyDiscount && (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
                      Family Discount
                    </span>
                  )}
                  {eventPrice && (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
                      {eventPrice.eventName}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Gamepad2 size={16} /> Start playing
                </>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm">
              {economyEnabled && (
                <span className="inline-flex items-center gap-1">
                  <CoinIcon size={14} />{" "}
                  {familyDiscount || eventPrice ? (
                    <>
                      <s className="font-normal opacity-60">
                        {(familyDiscount ? fullPrice : price).toLocaleString()}
                      </s>{" "}
                      <span className="text-success">{payPrice.toLocaleString()}</span>
                    </>
                  ) : (
                    price.toLocaleString()
                  )}
                </span>
              )}
              <ArrowRight size={15} className="opacity-70" />
              <Gamepad2 size={15} className={hasVoucher ? "text-muted" : ""} />
            </span>
          </button>

          {economyEnabled && !canAfford && (
            <p className="px-1 text-center text-xs text-danger">
              You need <CoinIcon size={11} /> {(payPrice - coins).toLocaleString()} more coins
              {hasVoucher ? " — or use a voucher above." : "."}
            </p>
          )}
          {economyEnabled && (
            <p className="px-1 pt-0.5 text-center text-[11px] text-subtle">
              Finish it later to earn a bounty of <CoinIcon size={11} /> {reward.toLocaleString()}.
              {hasVoucher && " A voucher activation is free, so shelving it refunds nothing."}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
