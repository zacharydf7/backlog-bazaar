import { useState } from "react";
import { Crown, X } from "lucide-react";
import type { Game } from "../types";
import type { UnifiedFamily } from "../lib/familyGrouping";
import { useStore } from "../store";
import { gameOwnedPlatforms } from "../lib/bazaarView";
import { formatPlaytime } from "../lib/playtime";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

const statusLabel: Record<Game["status"], string> = {
  backlog: "In Bazaar",
  playing: "Now Playing",
  finished: "Finished",
  wishlist: "Wishlist",
};

/** "Change Primary Edition" — reassign which member fronts the unified family
 *  card. Picking a new primary hands the family's living playthrough over to
 *  it (hours, note, journey milestones, a live Now Playing run — see
 *  set_family_primary); the summary below the roster spells out exactly what
 *  will move before the user commits. */
export function ChangePrimaryModal({
  family,
  onClose,
}: {
  family: UnifiedFamily;
  onClose: () => void;
}) {
  const setFamilyPrimary = useStore((s) => s.setFamilyPrimary);
  const [pick, setPick] = useState(family.primary.id);
  const [saving, setSaving] = useState(false);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const from = family.primary;
  const target = family.members.find((m) => m.id === pick);
  const changed = target != null && target.id !== from.id;

  // Mirrors the handoff rules (applyPrimaryHandoff / set_family_primary), so
  // the summary promises exactly what the migration will do.
  const migrate =
    changed &&
    from.status !== "finished" &&
    !(from.status === "playing" && target.status === "playing");
  const runMoves = migrate && from.status === "playing";

  const confirm = async () => {
    if (!changed || saving) return;
    setSaving(true);
    await setFamilyPrimary(family.familyId, pick);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Crown size={18} className="text-accent" /> Change Primary Edition
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto p-4">
          <p className="text-xs text-subtle">
            The primary edition is the one the{" "}
            <span className="font-medium text-ink">{family.name}</span> Family card renders — its
            board, box art and buttons — and the record all logged playtime, notes and milestones
            route to.
          </p>

          <ul className="flex flex-col gap-1" role="radiogroup" aria-label="Pick the primary edition">
            {family.members.map((m) => {
              const isCurrent = m.id === from.id;
              const selected = m.id === pick;
              const platforms = gameOwnedPlatforms(m);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPick(m.id)}
                    className={
                      "flex w-full items-center gap-3 rounded-xl border p-2 text-left transition " +
                      (selected
                        ? "border-brand bg-brand/5"
                        : "border-line bg-panel/50 hover:border-brand/40")
                    }
                  >
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
                      {m.image ? (
                        <img src={m.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm opacity-60">
                          🎮
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-sm text-ink" title={m.title}>
                          {m.title}
                        </span>
                        {isCurrent && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                            <Crown size={10} /> Primary
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-subtle">
                        <span className="text-muted">{statusLabel[m.status]}</span>
                        {(m.playedHours ?? 0) > 0 && (
                          <span>{formatPlaytime(m.playedHours ?? 0)} logged</span>
                        )}
                        {platforms.length > 0 && (
                          <span className="truncate" title={platforms.join(" · ")}>
                            {platforms.join(" · ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* What the handoff will do — promised up front, matching the RPC. */}
          {changed && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-2.5 text-xs text-muted">
              {migrate ? (
                <>
                  <span className="font-medium text-ink">{from.title}</span>&apos;s logged hours,
                  progress note and journey milestones move to{" "}
                  <span className="font-medium text-ink">{target.title}</span> so the playthrough
                  stays intact.
                  {runMoves && (
                    <>
                      {" "}
                      The live Now Playing run — its lane, activation fee and finish bounty —
                      transfers too; {from.title} steps back out of play.
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className="font-medium text-ink">{from.title}</span>
                  {from.status === "finished"
                    ? "'s concluded playthrough stays archived on its own record — only the designation changes."
                    : " keeps its own run — only the designation changes."}
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-panel px-3 py-2 text-sm text-ink transition hover:brightness-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={!changed || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
            >
              <Crown size={14} /> Make primary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
