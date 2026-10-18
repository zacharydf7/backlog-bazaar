// Expansion runs (src/lib/dlc.ts): an unplayed story expansion's own Bazaar
// card with its Buy & Start, and the clear / stop controls on the game's card
// while it runs. The server prices and pays every run; the amounts here are
// its preview.
import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, CheckCheck, Clock, Gamepad2, Lock, Package, PartyPopper, Undo2 } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import type { BazaarExpansion } from "../lib/bazaarExpansions";
import { gameHash } from "../lib/route";
import { useCoverOf } from "../lib/useCoverOf";
import {
  expansionLoggedHours,
  expansionPayout,
  type ExpansionQuote,
  type GameDlc,
} from "../lib/dlc";
import { formatPlaytime } from "../lib/playtime";
import { eventFinishBonus, eventStartPrice, times } from "../lib/bonusEvents";
import { ConfirmDialog } from "./ConfirmDialog";
import { CoinIcon } from "./CoinIcon";

/** The expansion run in progress on a game, if any (not gated on the
 *  preview: a run that started must always be able to end). */
export function useActiveExpansion(gameId: string): GameDlc | undefined {
  return useStore((s) => s.gameDlc.find((d) => d.gameId === gameId && d.runStatus === "playing"));
}

/** An unplayed expansion's own Bazaar card (owner, 2026-10-18): its name, its
 *  game, the game's cover, and Buy & Start into the DLC lane, or locked until
 *  the game is finished. The cover opens the game's page, where its DLC lives. */
export function ExpansionBazaarCard({ expansion }: { expansion: BazaarExpansion }) {
  const { dlc, game, quote, lockedReason } = expansion;
  const coins = useStore((s) => s.coins);
  const showEconomy = useStore((s) => s.economyEnabled);
  const cover = useCoverOf()(game);
  const [starting, setStarting] = useState(false);
  const [markingPlayed, setMarkingPlayed] = useState(false);
  const markExpansionPlayed = useStore((s) => s.markExpansionPlayed);
  const charges = showEconomy && quote.paying;
  // A running coin event: its start discount (start_expansion) and its bounty
  // boost on the clear (finish_expansion).
  const perk = useStore((s) => s.bonusPerks[game.id]);
  const boost = perk?.bounty;
  const eventStart = charges ? eventStartPrice(quote.price, perk) : null;
  const price = eventStart?.price ?? quote.price;
  const short = charges && coins < price;
  const open = () => {
    window.location.hash = gameHash(game.id);
  };
  return (
    <div className="group flex h-full min-h-[22rem] flex-col rounded-xl border-[1.5px] border-edge bg-surface shadow-stamp transition duration-200 hover:-translate-y-0.5 hover:shadow-[4px_5px_0_0_var(--shadow-ink)]">
      <div className="relative h-36 rounded-t-[10.5px] border-b-[1.5px] border-edge bg-panel">
        <button type="button" onClick={open} title={`Open ${game.title}`} className="h-full w-full">
          {cover ? (
            <img src={cover} alt={game.title} className="h-full w-full rounded-t-[10.5px] object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl opacity-60">🎮</div>
          )}
        </button>
        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
          <Package size={10} /> Expansion
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg font-semibold leading-tight text-ink">{dlc.name}</h3>
          <p className="text-xs text-muted">{game.title} expansion</p>
        </div>
        {dlc.hours != null && (
          <p className="inline-flex items-center gap-1 text-xs text-muted">
            <Clock size={12} /> {formatPlaytime(dlc.hours)}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2">
          {lockedReason ? (
            <>
              <button
                type="button"
                disabled
                title={lockedReason}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent"
              >
                <Lock size={14} /> Story-locked
              </button>
              <p className="text-center text-[11px] text-subtle">{lockedReason}</p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStarting(true)}
                disabled={short}
                className={
                  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition " +
                  (short
                    ? "cursor-not-allowed bg-panel text-subtle"
                    : "bg-brand text-brand-fg shadow-stamp-sm hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none")
                }
              >
                {short ? (
                  <>
                    Need <CoinIcon size={14} /> {price - coins} more
                  </>
                ) : charges ? (
                  <>
                    Buy &amp; Start · <CoinIcon size={14} />{" "}
                    {eventStart ? (
                      <>
                        <s className="font-normal opacity-60">{quote.price}</s> {price}
                      </>
                    ) : (
                      price
                    )}
                  </>
                ) : (
                  <>
                    <Gamepad2 size={14} /> Start playing
                  </>
                )}
              </button>
              {charges && (
                <p className="inline-flex items-center justify-center gap-1 text-center text-[11px] text-subtle">
                  Clear bounty <CoinIcon size={12} /> {quote.bounty}
                </p>
              )}
              {charges && boost && (
                <p className="inline-flex items-center justify-center gap-1 text-center text-[11px] font-semibold text-success">
                  <PartyPopper size={12} className="shrink-0" /> {boost.event}: bounty {times(boost.factor)} if you
                  clear it while it runs
                </p>
              )}
            </>
          )}
          {/* Played it before you tracked it here: off the Bazaar, no coins
              (like a game's Move to Finished). */}
          <button
            type="button"
            onClick={() => setMarkingPlayed(true)}
            title={`Played ${dlc.name} before? Mark it played, with no coins either way`}
            className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
          >
            <CheckCheck size={13} /> Already played it
          </button>
        </div>
      </div>
      {markingPlayed &&
        createPortal(
          <ConfirmDialog
            title={`Mark ${dlc.name} as played?`}
            body={
              <>
                It leaves your Bazaar and shows as played on{" "}
                <span className="font-medium text-ink">{game.title}</span>&apos;s page. No coins are spent or
                earned. Changed your mind? Mark it unplayed there.
              </>
            }
            confirmLabel="Mark as played"
            onConfirm={() => {
              setMarkingPlayed(false);
              void markExpansionPlayed(dlc.id, true);
            }}
            onCancel={() => setMarkingPlayed(false)}
          />,
          document.body,
        )}
      {starting && (
        <StartDialog
          dlc={dlc}
          quote={quote}
          price={price}
          title={game.title}
          showEconomy={showEconomy}
          onClose={() => setStarting(false)}
        />
      )}
    </div>
  );
}

function StartDialog({
  dlc,
  quote,
  price,
  title,
  showEconomy,
  onClose,
}: {
  dlc: GameDlc;
  quote: ExpansionQuote;
  /** What starting costs now, after any event discount. */
  price: number;
  title: string;
  showEconomy: boolean;
  onClose: () => void;
}) {
  const startExpansion = useStore((s) => s.startExpansion);
  const minHours = useStore((s) => s.expansionConfig.minHours);
  return createPortal(
    <ConfirmDialog
      title={`Play ${dlc.name}?`}
      body={
        <>
          Pull <span className="font-medium text-ink">{title}</span> back into Now Playing for its expansion.
          {showEconomy &&
            (quote.paying ? (
              <>
                {" "}
                Starting costs <CoinIcon size={12} /> {price}. Clearing it pays <CoinIcon size={12} />{" "}
                {quote.bounty} once you&apos;ve logged {formatPlaytime(quote.gateHours)} of it.
              </>
            ) : (
              <>
                {" "}
                {dlc.hours == null ? "It has no length set" : `It's under ${formatPlaytime(minHours)}`}, so it&apos;s
                free and tracked without coins.
              </>
            ))}
        </>
      }
      confirmLabel="Play expansion"
      onConfirm={() => {
        void startExpansion(dlc.id);
        onClose();
      }}
      onCancel={onClose}
    />,
    document.body,
  );
}

/** While an expansion runs: its progress toward the full bounty, the clear
 *  (in place of Mark Finished) and a stop that refunds the start price. */
export function ExpansionRunActions({
  game,
  dlc,
  showEconomy,
  withSessionStopped,
}: {
  game: Game;
  dlc: GameDlc;
  showEconomy: boolean;
  withSessionStopped: (fn: () => void) => void;
}) {
  const finishExpansion = useStore((s) => s.finishExpansion);
  const cancelExpansion = useStore((s) => s.cancelExpansion);
  // The quote frozen when the run started is what the clear pays, if the run
  // can pay at all (not one started while the economy was off).
  const quote = dlc.runPaying ? dlc.runQuote : null;
  const logged = expansionLoggedHours(dlc, game.playedHours);
  const payout = showEconomy && quote ? expansionPayout(quote, dlc.runPrice ?? 0, logged) : 0;
  const refund = showEconomy ? (dlc.runPrice ?? 0) : 0;
  const gateHours = dlc.runQuote?.gateHours ?? 0;
  const short = showEconomy && quote != null && quote.paying && logged < quote.gateHours;
  // A running coin event boosts only a full clear, on the full bounty.
  const perk = useStore((s) => s.bonusPerks[game.id]);
  const eventBonus = showEconomy && quote ? eventFinishBonus(quote.bounty, perk) : 0;

  return (
    <>
      <p className="inline-flex flex-wrap items-center justify-center gap-1 text-center text-xs text-muted">
        <BookOpen size={13} className="shrink-0 text-accent" /> Playing the{" "}
        <span className="font-medium text-ink">{dlc.name}</span> expansion
        {gateHours > 0 && (
          <>
            {" "}
            · {formatPlaytime(logged)} of {formatPlaytime(gateHours)} logged
          </>
        )}
      </p>
      <button
        onClick={() => withSessionStopped(() => void finishExpansion(dlc.id))}
        title={
          short && quote
            ? `Log ${formatPlaytime(quote.gateHours - logged)} more of ${dlc.name} for the full bounty`
            : `Clear ${dlc.name}`
        }
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-success bg-success/10 px-3 py-2 text-sm font-semibold text-success shadow-stamp-sm transition hover:bg-success/20 active:translate-x-px active:translate-y-px active:shadow-none"
      >
        <Check size={15} /> Clear expansion
        {payout > 0 && (
          <>
            {" "}
            · <CoinIcon size={15} /> {payout}
          </>
        )}
      </button>
      {eventBonus > 0 && (
        <p className="-mt-1 inline-flex items-center justify-center gap-1 text-center text-xs font-semibold text-success">
          <PartyPopper size={13} className="shrink-0" /> {perk?.bounty?.event}: +<CoinIcon size={12} /> {eventBonus}{" "}
          on {short ? "a full clear" : "clear"}
        </p>
      )}
      {short && quote && (
        <p className="-mt-1 inline-flex items-center justify-center gap-1 text-center text-[11px] text-subtle">
          Full bounty <CoinIcon size={11} /> {quote.bounty} after {formatPlaytime(quote.gateHours)} logged
        </p>
      )}
      <button
        onClick={() => withSessionStopped(() => void cancelExpansion(dlc.id))}
        title={`Stop the expansion and send ${game.title} back to Finished`}
        className="inline-flex items-center justify-center gap-1.5 text-xs text-subtle transition hover:text-ink"
      >
        <Undo2 size={13} /> Stop expansion
        {refund > 0 && (
          <span className="inline-flex items-center gap-1">
            · +<CoinIcon size={12} /> {refund}
          </span>
        )}
      </button>
    </>
  );
}
