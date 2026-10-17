import { useState } from "react";
import { CheckCircle2, Clock, Gamepad2, Lock, Play, Repeat, X } from "lucide-react";
import type { Compilation, Game } from "../types";
import { useStore } from "../store";
import { playOptionFor } from "../lib/compilationPlay";
import { effectiveLength } from "../lib/personalLength";
import { formatPlaytime } from "../lib/playtime";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { ActivationModal } from "./ActivationModal";
import { GamePriorityBadge } from "./GamePriorityBadge";
import { TitleWithOrigin } from "./TitleWithOrigin";

/** "Which game are you starting?" — opened by a bundle card's Play a Game
 *  (issue 86fc0b4b). Lists the bundle's Bazaar games with their priority and
 *  length; picking one hands it to the same activation dialog its own card
 *  would open (fee, lane choice, vouchers), or straight into Rotation for a
 *  live-service game. One game per pick: each start is its own purchase and
 *  takes its own lane slot. Games already playing or finished are summarized
 *  below for context. */
export function CompilationPlayPicker({
  compilation,
  children,
  onClose,
}: {
  compilation: Compilation;
  /** Every child, in the bundle's order. */
  children: Game[];
  onClose: () => void;
}) {
  const games = useStore((s) => s.games);
  const enterRotation = useStore((s) => s.enterRotation);
  const [activating, setActivating] = useState<Game | null>(null);
  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // The picked game's activation dialog replaces the list; closing it (bought
  // or backed out) closes the whole flow.
  if (activating) return <ActivationModal game={activating} onClose={onClose} />;

  const bazaar = children.filter((g) => g.status === "backlog");
  const playing = children.filter((g) => g.status === "playing");
  const finished = children.filter((g) => g.status === "finished");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Play a game from ${compilation.title}`}
        className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
              <Play size={18} className="text-accent" /> Play a game
            </h2>
            <p className="mt-0.5 truncate text-xs text-subtle">{compilation.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
          {bazaar.length === 0 ? (
            <p className="text-sm text-muted">Every game in this bundle has been started.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {bazaar.map((g) => {
                const option = playOptionFor(g, games);
                const length = effectiveLength(g);
                const blocked = option.kind === "blocked";
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      disabled={blocked}
                      title={blocked ? option.reason : undefined}
                      onClick={() => {
                        if (option.kind === "rotation") {
                          void enterRotation(g.id);
                          onClose();
                        } else if (option.kind === "start") {
                          setActivating(g);
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel/50 p-2 text-left transition enabled:hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
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
                        <span className="block truncate text-sm text-ink">
                          <TitleWithOrigin game={g} />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {g.priority && <GamePriorityBadge priority={g.priority} />}
                          {length != null && (
                            <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-muted">
                              <Clock size={10} className="text-accent/70" />
                              {formatPlaytime(length)}
                            </span>
                          )}
                        </span>
                        {blocked && (
                          <span className="mt-1 flex items-center gap-1 text-[11px] text-subtle">
                            <Lock size={11} /> {option.reason}
                          </span>
                        )}
                      </div>
                      {!blocked && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
                          {option.kind === "rotation" ? (
                            <>
                              <Repeat size={13} /> Rotation
                            </>
                          ) : (
                            <>
                              <Gamepad2 size={13} /> Start
                            </>
                          )}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {(playing.length > 0 || finished.length > 0) && (
            <div className="flex flex-col gap-1 border-t border-dashed border-line pt-3 text-xs text-muted">
              {playing.length > 0 && (
                <p>
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <Gamepad2 size={12} className="text-accent" /> Now Playing:
                  </span>{" "}
                  {playing.map((g) => g.title).join(", ")}
                </p>
              )}
              {finished.length > 0 && (
                <p>
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <CheckCircle2 size={12} className="text-success" /> Finished:
                  </span>{" "}
                  {finished.map((g) => g.title).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
