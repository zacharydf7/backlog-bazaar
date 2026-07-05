import { Layers } from "lucide-react";
import type { Game } from "../types";
import { stackPlatforms } from "../lib/gameStacks";
import { GameCard } from "./GameCard";
import { StackContext } from "./StackVersionPicker";

/** A collapsed deck for the "Stack by game" board view: the group's first
 *  (best-sorted) instance renders as a fully-functional card with ghost
 *  layers peeking out behind it, plus a count pill that fans the deck out.
 *  Purely visual — the stacked records stay independent underneath. The top
 *  card wears a platform tag for EVERY member of the deck, and the context
 *  provider lets its cold-start CTAs (Buy & Start, Import…) prompt for which
 *  folded version they should target. */
export function GameStackCard({
  games,
  onFanOut,
}: {
  games: Game[];
  onFanOut: () => void;
}) {
  const top = games[0];
  const platforms = stackPlatforms(games);
  return (
    <div className="relative h-full pt-2">
      {/* The deck: two offset ghost layers behind the top card. */}
      <div
        aria-hidden
        className="absolute inset-x-3 top-0 h-4 rounded-t-2xl border border-line bg-panel/60"
      />
      <div
        aria-hidden
        className="absolute inset-x-1.5 top-1 h-4 rounded-t-2xl border border-line bg-panel"
      />
      <div className="relative h-full">
        <StackContext.Provider value={games}>
          <GameCard game={top} stack={games} />
        </StackContext.Provider>
        <button
          type="button"
          onClick={onFanOut}
          title={`${games.length} copies of this game${platforms.length > 0 ? ` — ${platforms.join(", ")}` : ""}. Fan them out.`}
          aria-label={`Fan out ${games.length} stacked copies of ${top.title}`}
          className="absolute -top-2.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-brand/50 bg-surface px-2 py-0.5 text-[11px] font-semibold text-accent shadow-sm transition hover:bg-brand/10"
        >
          <Layers size={11} /> ×{games.length}
        </button>
      </div>
    </div>
  );
}

/** The re-stack pill shown on the FIRST card of a fanned-out deck. */
export function CollapseStackPill({
  count,
  onCollapse,
}: {
  count: number;
  onCollapse: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      title={`Re-stack these ${count} copies into one deck`}
      aria-label={`Re-stack ${count} fanned copies`}
      className="absolute -top-2.5 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-brand/50 bg-surface px-2 py-0.5 text-[11px] font-semibold text-accent shadow-sm transition hover:bg-brand/10"
    >
      <Layers size={11} /> Stack {count}
    </button>
  );
}
