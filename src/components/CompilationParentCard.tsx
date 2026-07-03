import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  Calendar,
  Clock,
  Expand,
  Gamepad2,
  MoreVertical,
  Package,
  Trash2,
} from "lucide-react";
import { useStore } from "../store";
import type { CollapsedCompilation } from "../lib/compilationGrouping";
import { formatUsd, ownedPlatformSummary, ownershipLabel } from "../lib/copies";
import { compilationCopiesOf } from "../lib/compilations";
import { formatPlaytime } from "../lib/playtime";
import { CompilationHub } from "./CompilationHub";
import { ConfirmDialog } from "./ConfirmDialog";
import { useViewing } from "../lib/viewContext";

/** The collapsed compilation's board card — ONE rollup card standing in for all
 *  of the bundle's child cards. Purely a data view: it aggregates money spent and
 *  time played (including hours carried over from before an expansion) and sits
 *  on the board of its least-completed child. It is not a games row, so there is
 *  no playtime input and no buy/finish economy here — Expand brings the child
 *  cards back for all of that. */
export function CompilationParentCard({ collapsed }: { collapsed: CollapsedCompilation }) {
  const setCompilationExpanded = useStore((s) => s.setCompilationExpanded);
  const { readOnly, hideSpend } = useViewing();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteCompilation = useStore((s) => s.deleteCompilation);
  const menuRef = useRef<HTMLDivElement>(null);

  const { compilation, children, board, totalPlayedHours, finishedCount, image } = collapsed;
  const ownedCopySummary = ownedPlatformSummary(compilationCopiesOf(compilation));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const expand = () => void setCompilationExpanded(compilation.id, true);
  const openHub = () => {
    setMenuOpen(false);
    setHubOpen(true);
  };

  return (
    <>
      {hubOpen &&
        children[0] &&
        createPortal(
          <CompilationHub game={children[0]} onClose={() => setHubOpen(false)} />,
          document.body,
        )}
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

      <div className="group flex h-full min-h-[22rem] flex-col overflow-hidden rounded-xl border-[1.5px] border-edge bg-surface shadow-stamp transition duration-200 hover:-translate-y-0.5 hover:shadow-[4px_5px_0_0_var(--shadow-ink)]">
        <div
          className="relative h-36 cursor-pointer border-b-[1.5px] border-edge bg-panel"
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
                    onClick={() => {
                      setMenuOpen(false);
                      expand();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition hover:bg-panel"
                  >
                    <Expand size={15} className="text-accent" /> Expand compilation
                  </button>
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
              <span
                title="A collapsed compilation — expand it to see each game's card"
                className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-1.5 py-0.5 text-[10px] font-medium text-accent"
              >
                <Package size={10} /> Compilation · {children.length} game
                {children.length === 1 ? "" : "s"} · {finishedCount} finished
              </span>
            </div>
          </div>

          {/* The rollup the collapsed card exists for: aggregated time and spend
              across every game inside (playtime is logged on the child cards),
              plus the platforms the bundle is owned on and its release year. */}
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
              <span
                key={o.platform}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted"
              >
                <Gamepad2 size={11} className="shrink-0 text-accent/70" />
                {ownershipLabel(o)}
              </span>
            ))}
          </div>

          <div className="mt-auto border-t-2 border-dashed border-line pt-3">
            <div className="flex flex-col gap-2">
              {/* Completion progress toward the card moving itself to Finished
                  (it sits in the lane of its least-completed game). */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel">
                  <div
                    className={
                      "h-full rounded-full transition-all " +
                      (board === "finished" ? "bg-success" : "bg-accent")
                    }
                    style={{
                      width: `${children.length ? Math.round((finishedCount / children.length) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="shrink-0 font-mono text-[11px] text-subtle">
                  {finishedCount}/{children.length}
                </span>
              </div>
              {!readOnly && (
                <button
                  onClick={expand}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none"
                >
                  <Expand size={14} /> Expand
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
