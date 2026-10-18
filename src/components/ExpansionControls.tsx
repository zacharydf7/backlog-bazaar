// Expansion runs on a game card (DLC preview, src/lib/dlc.ts): "Play" buttons
// on a finished game for each story expansion not yet played, and the clear /
// stop controls while one runs. The server prices and pays every run; the
// amounts here are its preview.
import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, Undo2 } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import {
  expansionFormulas,
  expansionLoggedHours,
  expansionPayout,
  expansionQuote,
  type ExpansionQuote,
  type GameDlc,
} from "../lib/dlc";
import { formatPlaytime } from "../lib/playtime";
import { ConfirmDialog } from "./ConfirmDialog";
import { CoinIcon } from "./CoinIcon";

/** The expansion run in progress on a game, if any (not gated on the
 *  preview: a run that started must always be able to end). */
export function useActiveExpansion(gameId: string): GameDlc | undefined {
  return useStore((s) => s.gameDlc.find((d) => d.gameId === gameId && d.runStatus === "playing"));
}

function useExpansionQuote(dlc: GameDlc): ExpansionQuote {
  const economy = useStore((s) => s.economy);
  const cfg = useStore((s) => s.expansionConfig);
  const gatePct = useStore((s) => s.bountyGatePct);
  return expansionQuote(dlc, expansionFormulas(economy, cfg), cfg.minHours, gatePct);
}

/** "Play <expansion>" on a finished game, one per story expansion not yet
 *  played, each confirming what it costs and pays. */
export function ExpansionStartActions({
  game,
  showEconomy,
  replayHasRoom,
}: {
  game: Game;
  showEconomy: boolean;
  replayHasRoom: boolean;
}) {
  const all = useStore((s) => s.gameDlc);
  const [picked, setPicked] = useState<GameDlc | null>(null);
  const ready = all.filter((d) => d.gameId === game.id && d.kind === "expansion" && d.runStatus === "owned");
  return (
    <>
      {ready.map((d) => (
        <button
          key={d.id}
          onClick={() => setPicked(d)}
          disabled={!replayHasRoom}
          title={
            replayHasRoom
              ? `Play the ${d.name} expansion`
              : "Your Replay lane is full — free a slot, or raise its size in Account settings"
          }
          className="inline-flex items-center gap-1.5 text-xs text-subtle transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-subtle"
        >
          <BookOpen size={13} /> Play {d.name}
        </button>
      ))}
      {picked && (
        <StartDialog dlc={picked} title={game.title} showEconomy={showEconomy} onClose={() => setPicked(null)} />
      )}
    </>
  );
}

function StartDialog({
  dlc,
  title,
  showEconomy,
  onClose,
}: {
  dlc: GameDlc;
  title: string;
  showEconomy: boolean;
  onClose: () => void;
}) {
  const startExpansion = useStore((s) => s.startExpansion);
  const minHours = useStore((s) => s.expansionConfig.minHours);
  const quote = useExpansionQuote(dlc);
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
                Starting costs <CoinIcon size={12} /> {quote.price}. Clearing it pays <CoinIcon size={12} />{" "}
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
