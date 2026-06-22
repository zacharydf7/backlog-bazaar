import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Layers,
  Gamepad2,
  Clock,
  Banknote,
  Trophy,
  Store,
  Heart,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import type { Game, GameStatus } from "../types";
import { type GameUnit, familyStats, familyPlatformTags, familyName } from "../lib/families";
import { formatPlaytime } from "../lib/playtime";
import { formatUsd } from "../lib/copies";
import { EditGameModal } from "./EditGameModal";
import { useViewing } from "../lib/viewContext";

const STATUS_CHIP: Record<GameStatus, { label: string; icon: LucideIcon; cls: string }> = {
  playing: { label: "Now Playing", icon: Gamepad2, cls: "bg-accent/10 text-accent" },
  backlog: { label: "Bazaar", icon: Store, cls: "bg-brand/10 text-accent" },
  wishlist: { label: "Wishlist", icon: Heart, cls: "bg-panel text-muted" },
  finished: { label: "Finished", icon: Trophy, cls: "bg-success/15 text-success" },
};

function year(date?: string): string {
  if (!date) return "—";
  const y = new Date(date).getFullYear();
  return Number.isNaN(y) ? "—" : String(y);
}

/** A whole Game Family collapsed into one board card. Wears the board-relevant
 *  edition's cover art (unit.rep), tags every platform the family spans, and
 *  opens the per-edition detail view. All buy/finish/log actions live there. */
export function MasterCard({ unit }: { unit: GameUnit }) {
  const { members, rep } = unit;
  const { readOnly, hideSpend } = useViewing();
  const [editGame, setEditGame] = useState<Game | null>(null);

  const stats = familyStats(members);
  const platforms = familyPlatformTags(members);
  const title = familyName(members);

  return (
    <>
      {editGame &&
        createPortal(
          <EditGameModal game={editGame} onClose={() => setEditGame(null)} />,
          document.body,
        )}
      <div className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div
          className="relative h-36 cursor-pointer bg-panel"
          role="button"
          tabIndex={0}
          title={`View ${title} editions`}
          onClick={() => setEditGame(rep)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setEditGame(rep);
            }
          }}
        >
          {rep.image ? (
            <img src={rep.image} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl opacity-60">🎮</div>
          )}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white shadow">
            <Layers size={12} /> {stats.count} editions
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="font-display text-lg leading-tight text-ink">{title}</h3>
            {rep.developers && rep.developers.length > 0 && (
              <p className="mt-0.5 text-xs text-muted">{rep.developers.slice(0, 2).join(", ")}</p>
            )}
          </div>

          {/* Platform indicators: every platform the family spans. */}
          {platforms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[10px] text-muted"
                >
                  <Gamepad2 size={10} className="text-accent/70" /> {p}
                </span>
              ))}
            </div>
          )}

          {/* Family totals. */}
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-2">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-accent">
              <Layers size={12} /> Game Family · {stats.count} editions
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} className="text-accent/70" /> {formatPlaytime(stats.totalPlayed)}{" "}
                total
              </span>
              {!hideSpend && stats.totalCost > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Banknote size={12} className="text-accent/70" /> {formatUsd(stats.totalCost)} spent
                </span>
              )}
              {stats.finishedCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Trophy size={12} className="text-accent/70" /> {stats.finishedCount} cleared
                </span>
              )}
            </div>
          </div>

          {/* Each edition, with its own status — tap to open its detail tab. */}
          <div className="flex flex-col gap-1.5">
            {members.map((m) => {
              const chip = STATUS_CHIP[m.status];
              const Icon = chip.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setEditGame(m)}
                  className="flex items-center gap-2 rounded-lg border border-line bg-panel/50 px-2.5 py-2 text-left transition hover:border-brand/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{m.title}</div>
                    <div className="text-[11px] text-subtle">
                      {year(m.released)}
                      {m.playedHours ? ` · ${formatPlaytime(m.playedHours)} played` : ""}
                    </div>
                  </div>
                  <span
                    className={
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                      chip.cls
                    }
                  >
                    <Icon size={10} /> {chip.label}
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-subtle" />
                </button>
              );
            })}
          </div>

          <div className="mt-auto" />

          <button
            onClick={() => setEditGame(rep)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-panel px-3 py-2 text-sm font-medium text-ink transition hover:brightness-95"
          >
            <Layers size={15} className="text-accent" />{" "}
            {readOnly ? "View editions" : "View & manage editions"}
          </button>
        </div>
      </div>
    </>
  );
}
