import { useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, ChevronDown, ChevronRight, ChevronUp, Clock, Layers, Trophy } from "lucide-react";
import type { FocusedFamily } from "../lib/familyGrouping";
import { useStore } from "../store";
import { gameHash } from "../lib/route";
import { formatUsd } from "../lib/copies";
import { formatPlaytime } from "../lib/playtime";
import { GameActions, ReadOnlyFooter } from "./GameActions";
import { StatusBadge } from "./StatusBadge";
import { FamilyHub } from "./FamilyHub";
import { useViewing } from "../lib/viewContext";

/** The focused Game Family board card — ONE card standing in for every linked
 *  edition, on the board of the most-active member. Unlike the collapsed
 *  compilation rollup it is fully actionable: the representative edition's own
 *  GameActions render inline (time logger, progress note, Mark Finished, Buy &
 *  Start…), so the everyday flow needs zero extra clicks. The other editions
 *  wait behind a "View N other editions" expander; the Family hub (rename /
 *  link / unlink / cover / split) opens from the family chip. */
export function FamilyFocusCard({ family }: { family: FocusedFamily }) {
  const { readOnly, hideSpend } = useViewing();
  const viewing = useStore((s) => s.viewing);
  const [othersOpen, setOthersOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);

  const { representative: rep, members, name, cover, stats } = family;
  const others = members.filter((m) => m.id !== rep.id);

  // Every edition opens its own game page — a plain hash navigation.
  const openMember = (id: string) => {
    window.location.hash = gameHash(id, viewing?.userId ?? null);
  };
  const openRep = () => openMember(rep.id);

  return (
    <>
      {hubOpen &&
        createPortal(<FamilyHub game={rep} onClose={() => setHubOpen(false)} />, document.body)}

      <div className="group flex h-full min-h-[22rem] flex-col overflow-hidden rounded-xl border-[1.5px] border-edge bg-surface shadow-stamp transition duration-200 hover:-translate-y-0.5 hover:shadow-[4px_5px_0_0_var(--shadow-ink)]">
        <div
          className="relative h-36 cursor-pointer border-b-[1.5px] border-edge bg-panel"
          role="button"
          tabIndex={0}
          title={`Open ${rep.title}`}
          onClick={openRep}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openRep();
            }
          }}
        >
          {cover ? (
            <img src={cover} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl opacity-60">🎮</div>
          )}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
            <Layers size={10} /> {members.length} editions
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="font-display text-lg font-semibold leading-tight text-ink">{name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {readOnly ? (
                <span
                  title="A Game Family — linked editions of one title"
                  className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                >
                  <Layers size={10} /> Game Family · {members.length} editions
                </span>
              ) : (
                <button
                  onClick={() => setHubOpen(true)}
                  title="Manage this Game Family"
                  className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent transition hover:bg-accent/15"
                >
                  <Layers size={10} /> Game Family · {members.length} editions
                </button>
              )}
            </div>
          </div>

          {/* Aggregates across the whole family — the reason it's linked. */}
          <div className="flex flex-wrap gap-1">
            {stats.totalPlayed > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
                <Clock size={11} className="shrink-0 text-accent/70" />
                {formatPlaytime(stats.totalPlayed)} total
              </span>
            )}
            {!hideSpend && stats.totalCost > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
                <Banknote size={11} className="shrink-0 text-accent/70" />
                {formatUsd(stats.totalCost)} spent
              </span>
            )}
            {stats.finishedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
                <Trophy size={11} className="shrink-0 text-accent/70" />
                {stats.finishedCount} cleared
              </span>
            )}
          </div>

          {/* The active edition, fully expanded: its own footer (logger, note,
              Mark Finished, Buy & Start, story lock…) renders inline. */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={openRep}
              title={`Open ${rep.title}`}
              className="min-w-0 truncate text-left text-sm text-muted transition hover:text-accent"
            >
              {rep.title}
            </button>
            <StatusBadge status={rep.status} />
          </div>
          <div className="border-t-2 border-dashed border-line pt-3">
            {readOnly ? <ReadOnlyFooter game={rep} /> : <GameActions game={rep} />}
          </div>

          {/* The other editions, tucked away until asked for. */}
          <div className="mt-auto flex flex-col gap-1 pt-1">
            <button
              onClick={() => setOthersOpen((o) => !o)}
              aria-expanded={othersOpen}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-muted transition hover:text-ink"
            >
              {othersOpen ? (
                <>
                  <ChevronUp size={14} /> Hide other editions
                </>
              ) : (
                <>
                  <ChevronDown size={14} /> View {others.length} other edition
                  {others.length === 1 ? "" : "s"}
                </>
              )}
            </button>
            {othersOpen &&
              others.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMember(m.id)}
                  title={`Open ${m.title}`}
                  className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel/50 px-2.5 py-2.5 text-left transition hover:border-brand/40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={m.title}>
                    {m.title}
                  </span>
                  {m.released && (
                    <span className="shrink-0 font-mono text-[11px] text-subtle">
                      {m.released.slice(0, 4)}
                    </span>
                  )}
                  <StatusBadge status={m.status} />
                  <ChevronRight size={14} className="shrink-0 text-subtle" />
                </button>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
