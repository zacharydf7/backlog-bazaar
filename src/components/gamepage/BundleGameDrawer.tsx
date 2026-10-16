import { ExternalLink } from "lucide-react";
import type { Game } from "../../types";
import { gameHash } from "../../lib/route";
import { GameActions } from "../GameActions";
import { PriorityCard, YourLengthCard } from "./OverviewTab";
import { PlayedField } from "./JourneyTab";
import { ReviewTab } from "./ReviewTab";

/** One bundled game's drawer on the compilation page (issue 86fc0b4b): manage
 *  the game without leaving its bundle. Every control is the game page's own,
 *  so nothing here is a second implementation — the status moves through the
 *  same economy actions as its card (Buy & Start, Finish, Shelve…, with their
 *  fees and bounties), then priority, your length, logged time, and your score
 *  and review. All immediate-write against this game's record; the bundle's
 *  totals are derived from the records, so they follow along. */
export function BundleGameDrawer({ game }: { game: Game }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line p-3">
      <div className="rounded-xl border border-line bg-surface p-3">
        <GameActions game={game} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PriorityCard game={game} />
        <YourLengthCard game={game} />
      </div>
      {game.status !== "wishlist" && <PlayedField game={game} />}
      <ReviewTab game={game} />
      <button
        type="button"
        onClick={() => {
          window.location.hash = gameHash(game.id);
        }}
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-muted transition hover:border-brand/50 hover:text-ink"
      >
        <ExternalLink size={13} className="text-accent" /> Open {game.title}&apos;s page
      </button>
    </div>
  );
}
