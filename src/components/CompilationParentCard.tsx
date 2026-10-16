import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  Clock,
  MoreVertical,
  Package,
  Play,
  Trash2,
} from "lucide-react";
import { useStore } from "../store";
import type { Game } from "../types";
import {
  compilationSummary,
  compilationTray,
  type CollapsedCompilation,
} from "../lib/compilationGrouping";
import { formatUsd, ownedPlatformSummary } from "../lib/copies";
import { compilationCopiesOf } from "../lib/compilations";
import { effectiveLength } from "../lib/personalLength";
import { compilationHash, gameHash } from "../lib/route";
import { formatPlaytime } from "../lib/playtime";
import { ConfirmDialog } from "./ConfirmDialog";
import { CompilationPlayPicker } from "./CompilationPlayPicker";
import { FinishTagBadge } from "./FinishTagBadge";
import { GamePriorityBadge } from "./GamePriorityBadge";
import { PlatformBadge } from "./PlatformBadge";
import { useViewing } from "../lib/viewContext";

/** A compilation's board card — ONE card standing in for the bundle's games on
 *  this board (issue 86fc0b4b). The same bundle shows a card on every board it
 *  has games on, each with a tray of just that board's games; its playing games
 *  keep their own cards on Now Playing. It aggregates money spent and time
 *  played (including hours carried over from before an expansion) but is not a
 *  games row, so it never logs playtime or moves coins itself: Play a Game hands
 *  the chosen game to that game's own activation dialog. */
export function CompilationParentCard({ collapsed }: { collapsed: CollapsedCompilation }) {
  const { readOnly, hideSpend } = useViewing();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picking, setPicking] = useState(false);
  const deleteCompilation = useStore((s) => s.deleteCompilation);
  const menuRef = useRef<HTMLDivElement>(null);

  const { compilation, children, board, totalPlayedHours, finishedCount, playingCount, image } =
    collapsed;
  const ownedCopySummary = ownedPlatformSummary(compilationCopiesOf(compilation));
  const tray = compilationTray(collapsed);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // The card's click-through: the bundle's own page (routed, like a game card
  // opening its game page) rather than the old hub modal.
  const openHub = () => {
    setMenuOpen(false);
    window.location.hash = compilationHash(compilation.id);
  };

  return (
    <>
      {confirmDelete &&
        createPortal(
          <ConfirmDialog
            title="Delete this compilation?"
            tone="danger"
            confirmLabel="Delete everything"
            body={
              <>
                This permanently deletes{" "}
                <span className="font-medium text-ink">{compilation.title}</span> and all{" "}
                <span className="font-medium text-ink">{children.length}</span> game
                {children.length === 1 ? "" : "s"} inside it. This can&apos;t be undone.
              </>
            }
            onConfirm={() => {
              setConfirmDelete(false);
              void deleteCompilation(compilation.id);
            }}
            onCancel={() => setConfirmDelete(false)}
          />,
          document.body,
        )}
      {picking &&
        createPortal(
          <CompilationPlayPicker
            compilation={compilation}
            children={children}
            onClose={() => setPicking(false)}
          />,
          document.body,
        )}

      <div className="group flex h-full min-h-[22rem] flex-col overflow-hidden rounded-xl border-[1.5px] border-edge bg-surface shadow-stamp transition duration-200 hover:-translate-y-0.5 hover:shadow-[4px_5px_0_0_var(--shadow-ink)]">
        <div className="relative h-36 border-b-[1.5px] border-edge bg-panel">
          {/* The "Open …" title/click covers only this image region, NOT the
              whole cell — otherwise the ⋯ menu (a sibling below) inherits this
              tooltip on every menu option (same fix as GameCard). */}
          <div
            className="h-full w-full cursor-pointer"
            role="button"
            tabIndex={0}
            title={`Open ${compilation.title}`}
            onClick={openHub}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openHub();
              }
            }}
          >
            {image ? (
              <img src={image} alt={compilation.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl opacity-60">📦</div>
            )}
          </div>
          {!readOnly && (
            <div
              className="absolute right-2 top-2"
              ref={menuRef}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setMenuOpen((o) => !o)}
                title="More options"
                aria-label="More options"
                className={
                  "grid h-6 w-6 place-items-center rounded-full bg-black/50 text-white/80 transition hover:bg-black/70 hover:text-white " +
                  (menuOpen
                    ? "opacity-100"
                    : "opacity-100 hover-device:opacity-0 hover-device:group-hover:opacity-100")
                }
              >
                <MoreVertical size={14} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-lg border border-edge bg-surface p-1 text-left shadow-stamp">
                  <button
                    onClick={openHub}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                  >
                    <Package size={15} className="text-accent" /> Open compilation
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-panel hover:text-danger"
                  >
                    <Trash2 size={15} /> Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="font-display text-lg font-semibold leading-tight text-ink">
              {compilation.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                <Package size={10} /> {compilationSummary(collapsed)}
              </span>
            </div>
          </div>

          {/* The bundle-wide rollup: time and spend across every game inside
              (playtime is logged on each game's own page), plus the platforms
              the bundle is owned on. */}
          <div className="flex flex-wrap gap-1">
            <span className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
              <Clock size={11} className="shrink-0 text-accent/70" />
              {formatPlaytime(totalPlayedHours)} played
            </span>
            {!hideSpend && compilation.totalCost > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted">
                <Banknote size={11} className="shrink-0 text-accent/70" />
                {formatUsd(compilation.totalCost)} spent
              </span>
            )}
            {ownedCopySummary.map((o) => (
              <PlatformBadge key={o.platform} label={o.platform} formats={o.formats} />
            ))}
          </div>

          {/* The tray: just this board's games, each opening its own page. */}
          <ul className="flex flex-col gap-1" aria-label={`Games on this board from ${compilation.title}`}>
            {tray.shown.map((g) => (
              <li key={g.id}>
                <TrayRow game={g} board={board} />
              </li>
            ))}
            {tray.more > 0 && (
              <li>
                <button
                  type="button"
                  onClick={openHub}
                  className="px-2 text-[11px] text-subtle transition hover:text-accent"
                >
                  +{tray.more} more
                </button>
              </li>
            )}
          </ul>

          <div className="mt-auto border-t-2 border-dashed border-line pt-3">
            <div className="flex flex-col gap-2">
              <BundleProgress
                finished={finishedCount}
                playing={playingCount}
                total={children.length}
              />
              {!readOnly && board === "backlog" && (
                <button
                  onClick={() => setPicking(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
                >
                  <Play size={14} /> Play a Game
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Progress across a whole bundle — finished games solid, games in play in the
 *  accent ink — shared by the board card and the compilation page. */
export function BundleProgress({
  finished,
  playing,
  total,
}: {
  finished: number;
  playing: number;
  total: number;
}) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-panel"
        title={`${finished} finished · ${playing} playing`}
      >
        <div className="h-full bg-success transition-all" style={{ width: `${pct(finished)}%` }} />
        <div className="h-full bg-accent transition-all" style={{ width: `${pct(playing)}%` }} />
      </div>
      <span className="shrink-0 font-mono text-[11px] text-subtle">
        {finished}/{total}
      </span>
    </div>
  );
}

/** One tray line: the game's title plus what matters on this board — priority
 *  and length in the Bazaar, the finish badge and hours on Finished. */
function TrayRow({ game, board }: { game: Game; board: CollapsedCompilation["board"] }) {
  const length = effectiveLength(game);
  return (
    <button
      type="button"
      onClick={() => {
        window.location.hash = gameHash(game.id);
      }}
      title={`Open ${game.title}`}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition hover:bg-panel"
    >
      <span className="min-w-0 truncate text-xs text-ink">{game.title}</span>
      <span className="flex shrink-0 items-center gap-1">
        {board === "finished" ? (
          <>
            {game.finishTag && <FinishTagBadge tag={game.finishTag} />}
            {(game.playedHours ?? 0) > 0 && (
              <span className="font-mono text-[10px] text-muted">
                {formatPlaytime(game.playedHours!)}
              </span>
            )}
          </>
        ) : (
          <>
            {board === "backlog" && game.priority && <GamePriorityBadge priority={game.priority} />}
            {length != null && (
              <span className="font-mono text-[10px] text-muted">{formatPlaytime(length)}</span>
            )}
          </>
        )}
      </span>
    </button>
  );
}
