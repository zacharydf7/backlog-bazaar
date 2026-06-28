import { useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, Library } from "lucide-react";
import type { Game } from "../types";
import { StatusBadge } from "./StatusBadge";
import { EditGameModal } from "./EditGameModal";
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
 *  spent. Clicking it opens the standard Game Hub (the detail modal) to interact
 *  with or edit the game. Honours the visitor's hidden-spend preference. */
export function LedgerCard({ game }: { game: Game }) {
  const { hideSpend } = useViewing();
  const [open, setOpen] = useState(false);

  const owned = ownedPlatformSummary(game.copies);
  const showSpend = !hideSpend && hasAnyCost(game.copies);

  return (
    <>
      {open &&
        createPortal(
          <EditGameModal game={game} onClose={() => setOpen(false)} />,
          document.body,
        )}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${game.title}`}
        title={`Open ${game.title}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-full cursor-pointer flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div>
          <StatusBadge status={game.status} />
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
          <Info label="Genre" value={game.genres.join(", ")} />
          <Info label="Platforms" value={(game.platforms ?? []).join(", ")} />
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
