import { Banknote, Library } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { gameHash } from "../lib/route";
import { StatusBadge } from "./StatusBadge";
import { FinishTagBadge } from "./FinishTagBadge";
import { formatPlaytime } from "../lib/playtime";
import {
  ownedPlatformSummary,
  ownershipLabel,
  totalCost,
  hasAnyCost,
  formatUsd,
} from "../lib/copies";
import { useViewing } from "../lib/viewContext";

/** A uniform, read-only summary card for the Master Ledger. Unlike the board's
 *  GameCard (which surfaces state-specific actions — Buy, time trackers, the ⋮
 *  menu), every card here is a clean, structurally identical read-only row: a
 *  status badge, the title, a fixed info block, console ownership, and money
 *  spent. Clicking it opens the game's own page to interact with or edit the
 *  game. Honours the visitor's hidden-spend preference. */
export function LedgerCard({ game }: { game: Game }) {
  const { hideSpend } = useViewing();
  const viewing = useStore((s) => s.viewing);

  const owned = ownedPlatformSummary(game.copies);
  const showSpend = !hideSpend && hasAnyCost(game.copies);

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
        aria-label={`Open ${game.title}`}
        title={`Open ${game.title}`}
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
        {/* Status plus, for finished games, how they concluded. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={game.status} />
          {game.status === "finished" && game.finishTag && <FinishTagBadge tag={game.finishTag} />}
        </div>

        <h3 className="font-display text-lg leading-tight text-ink">{game.title}</h3>

        {/* Fixed info block — the same fields for every game, so cards read
            uniformly. mt-auto pushes ownership + spend to a consistent bottom. */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Info label="Developer" value={(game.developers ?? []).join(", ")} />
          <Info label="Released" value={year(game.released)} />
          <Info label="Length" value={game.hours ? formatPlaytime(game.hours) : "—"} />
          <Info
            label="Hours played"
            value={game.playedHours ? formatPlaytime(game.playedHours) : "—"}
          />
          {/* No historical release-platform list here — ownership is personal
              inventory, and the "Owned on …" line below already names exactly
              the platforms this copy is owned on. */}
          <Info label="Genre" value={game.genres.join(", ")} />
        </dl>

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <div className="flex items-start gap-1.5 text-[11px] text-accent">
            <Library size={13} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">
              {owned.length > 0 ? `Owned on ${owned.map(ownershipLabel).join(" · ")}` : "Owned"}
            </span>
          </div>
          {showSpend && (
            <div className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <Banknote size={13} className="shrink-0 text-accent/70" />
              Spent {formatUsd(totalCost(game.copies))}
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

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}
