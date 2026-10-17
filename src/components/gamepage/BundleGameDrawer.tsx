import { ExternalLink, Gamepad2 } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { gameHash } from "../../lib/route";
import { optionsWithCurrent, sortTerms } from "../../lib/taxonomy";
import { GameActions } from "../GameActions";
import { PriorityCard, YourLengthCard } from "./OverviewTab";
import { PlayedField } from "./JourneyTab";
import { ReviewTab } from "./ReviewTab";

/** One bundled game's drawer on the compilation page (issue 86fc0b4b): manage
 *  the game without leaving its bundle. Every control is the game page's own,
 *  so nothing here is a second implementation — the status moves through the
 *  same economy actions as its card (Buy & Start, Finish, Shelve…, with their
 *  fees and bounties), then priority, your length, logged time (GameActions'
 *  own logger while in play), and your score and review. All immediate-write against this game's record; the bundle's
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
        <OriginalPlatformCard game={game} />
      </div>
      {/* In play, GameActions already logs time right above — a second hours
          editor beside it reads as a duplicate. Corrections stay on its page. */}
      {game.status !== "wishlist" && game.status !== "playing" && <PlayedField game={game} />}
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

/** The game's original console (issue 86fc0b4b): a label that tells same-named
 *  versions in one bundle apart. Display only — boards, filters and stats go by
 *  the bundle's own copies. Immediate-write. */
function OriginalPlatformCard({ game }: { game: Game }) {
  const platformList = useStore((s) => s.platformList);
  const setOriginalPlatform = useStore((s) => s.setOriginalPlatform);
  const current = game.originalPlatform ?? null;
  const options = optionsWithCurrent(sortTerms(platformList), current);
  return (
    <div className="rounded-xl border border-line bg-panel/30 p-3">
      <label
        htmlFor={`origin-${game.id}`}
        className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-subtle"
      >
        <Gamepad2 size={12} className="text-accent/70" /> Original platform
      </label>
      <select
        id={`origin-${game.id}`}
        value={current ?? ""}
        onChange={(e) => void setOriginalPlatform(game.id, e.target.value || null)}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
      >
        <option value="">Not set</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-[11px] text-subtle">
        The console it first came out on — tells versions with the same name apart.
      </p>
    </div>
  );
}
