import { createContext, useContext, useState } from "react";
import { Layers, X } from "lucide-react";
import type { Game } from "../types";
import { ownedPlatformSummary } from "../lib/copies";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { PlatformBadge } from "./PlatformBadge";

/** The members of a collapsed stack, provided by GameStackCard around its top
 *  card. GameActions reads this to intercept the cold-start CTAs (Buy & Start,
 *  Add to Rotation, Import with Charter): with 2+ versions folded behind one
 *  card, the action must first ask WHICH version it targets. null everywhere
 *  else — plain cards act on themselves directly. */
export const StackContext = createContext<Game[] | null>(null);

/** The stack members behind the current card when a version choice is needed
 *  (2+ folded versions), else null. */
export function useStackVersions(): Game[] | null {
  const games = useContext(StackContext);
  return games && games.length > 1 ? games : null;
}

/** "Which version?" — the prompt shown when an economy CTA is tapped on a
 *  collapsed stack. Each row is one folded instance with its platform tags;
 *  picking one routes the pending action to that instance. */
export function StackVersionPicker({
  games,
  title,
  onPick,
  onClose,
}: {
  games: Game[];
  /** What the pick is for, e.g. "Buy & Start" — shown in the header. */
  title: string;
  onPick: (game: Game) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Layers size={18} className="text-accent" /> Which version?
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-4">
          <p className="text-xs text-subtle">
            You have {games.length} versions of this game stacked —{" "}
            <span className="font-medium text-ink">{title}</span> applies to one of them.
          </p>
          <ul className="flex flex-col gap-1">
            {games.map((g) => {
              const tags = ownedPlatformSummary(g.copies ?? []);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      onPick(g);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel/50 p-2 text-left transition hover:border-brand/40 disabled:opacity-60"
                  >
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
                      {g.image ? (
                        <img src={g.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm opacity-60">
                          🎮
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink" title={g.title}>
                        {g.title}
                      </span>
                      {tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {tags.map((o) => (
                            <PlatformBadge key={o.platform} label={o.platform} formats={o.formats} />
                          ))}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
