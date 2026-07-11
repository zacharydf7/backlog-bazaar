import { Banknote, Users } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { gameHash } from "../lib/route";
import { PlatformBadge } from "./PlatformBadge";
import { StatusBadge } from "./StatusBadge";
import { isInRotation } from "../lib/status";
import { FinishTagBadge } from "./FinishTagBadge";
import { formatPlaytime } from "../lib/playtime";
import {
  ownedPlatformSummary,
  ownershipLabel,
  totalCost,
  hasAnyCost,
  formatUsd,
} from "../lib/copies";
import { familyName, familyStats, familyPlatformTags } from "../lib/families";
import { useViewing } from "../lib/viewContext";
import { GameValueBadge } from "./ValueBadge";

/** A uniform, read-only summary card for the Master Ledger. Unlike the board's
 *  GameCard (which surfaces state-specific actions — Buy, time trackers, the ⋮
 *  menu), every card here is a clean, structurally identical read-only row: a
 *  status badge, the title, a fixed info block, console ownership, and money
 *  spent. Clicking it opens the game's own page to interact with or edit the
 *  game. Honours the visitor's hidden-spend preference. */
export function LedgerCard({ game, family }: { game: Game; family?: Game[] }) {
  const { hideSpend } = useViewing();
  const viewing = useStore((s) => s.viewing);

  // A linked family is ONE consolidated entry: `game` is the primary (its cover,
  // status, id), but the title, ownership, spend and hours roll up across every
  // edition so the card reads as a family, not just the primary (issue dacee1d9).
  const members = family && family.length > 1 ? family : null;
  const stats = members ? familyStats(members) : null;
  const title = members ? familyName(members) : game.title;
  const owned = members ? familyPlatformTags(members) : ownedPlatformSummary(game.copies);
  const spend = members ? stats!.totalCost : totalCost(game.copies);
  const playedHours = members ? stats!.totalPlayed : (game.playedHours ?? 0);
  const showSpend = !hideSpend && spend > 0;

  // The ledger merges overlapping-ownership groups into one synthetic display
  // row (combined copies, summed hours) — the merged row keeps the real master's
  // id, so navigating by id lands the page on the REAL record.
  const open = () => {
    window.location.hash = gameHash(game.id, viewing?.userId ?? null);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${title}`}
        title={`Open ${title}`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        }}
        className="flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      >
        {/* Cover art — flush to the card edges, same fixed height on every card so
            the layout stays uniform. */}
        <div className="h-32 w-full shrink-0 bg-panel">
          {game.image ? (
            <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl opacity-60">🎮</div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Status plus, for finished games, how they concluded. A family also
            wears a chip naming it and its edition count. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={game.status} rotation={isInRotation(game)} />
          {game.status === "finished" && game.finishTag && <FinishTagBadge tag={game.finishTag} />}
          {members && (
            <span
              title={`${title} — ${members.length} linked editions play as one`}
              className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
            >
              <Users size={10} /> Family · {members.length}
            </span>
          )}
        </div>

        <h3 className="font-display text-lg leading-tight text-ink">{title}</h3>

        {/* Fixed info block — the same fields for every game, so cards read
            uniformly. mt-auto pushes ownership + spend to a consistent bottom. */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Info label="Length" value={game.hours ? formatPlaytime(game.hours) : "—"} />
          <Info
            label="Hours played"
            value={playedHours ? formatPlaytime(playedHours) : "—"}
          />
          {/* No historical release-platform list here — ownership is personal
              inventory, and the platform badges below already name exactly
              the versions this copy is owned on. */}
        </dl>

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {/* One badge per owned version, formats included — the Ledger is the
              inventory view, and the badge matches the board cards' chips. */}
          {owned.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {owned.map((o) => (
                <PlatformBadge key={o.platform} label={ownershipLabel(o)} />
              ))}
            </div>
          )}
          {showSpend && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Banknote size={13} className="shrink-0 text-accent/70" />
                Spent {formatUsd(spend)}
              </span>
              {/* "Money Well Spent" (issue 6c60c213) — the same judgement the
                  board card wears; a family row judges the whole family. */}
              <GameValueBadge game={game} members={members ?? undefined} />
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="truncate text-sm text-ink" title={value || "—"}>
        {value || "—"}
      </dd>
    </div>
  );
}
