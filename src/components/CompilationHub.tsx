import { useState } from "react";
import { Package, X, Trash2, Banknote, CheckCircle2, Pencil } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { totalCost, formatUsd } from "../lib/copies";
import { StatusBadge } from "./StatusBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import { useViewing } from "../lib/viewContext";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";

/** The "Compilation Hub" — a secondary modal opened from a child card's badge.
 *  Shows the container's total spend and a checklist of every bundled game with
 *  its status and assigned cost. The owner can delete the whole compilation here
 *  (the only way to remove its games — they can't be deleted individually). Reads
 *  live from the store so statuses/costs stay current. */
export function CompilationHub({
  game,
  onClose,
  onEdit,
}: {
  game: Game;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const { compilations, games, deleteCompilation } = useStore();
  const { readOnly, hideSpend } = useViewing();
  const [confirming, setConfirming] = useState(false);

  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the hub instead of leaving the page

  const compilation = compilations.find((c) => c.id === game.compilationId) ?? null;
  // Fall back to the denormalized name (e.g. while the container isn't loaded).
  const title = compilation?.title ?? game.compilationName ?? "Compilation";
  const children = games
    .filter((g) => g.compilationId === game.compilationId)
    .sort((a, b) => a.title.localeCompare(b.title));
  const finished = children.filter((g) => g.status === "finished").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8">
      {confirming && compilation && (
        <ConfirmDialog
          title="Delete this compilation?"
          tone="danger"
          confirmLabel="Delete everything"
          body={
            <>
              This permanently deletes{" "}
              <span className="font-medium text-ink">{title}</span> and all{" "}
              <span className="font-medium text-ink">{children.length}</span> game
              {children.length === 1 ? "" : "s"} inside it. This can&apos;t be undone.
            </>
          }
          onConfirm={() => {
            void deleteCompilation(compilation.id);
            setConfirming(false);
            onClose();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}

      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex min-w-0 items-center gap-2 font-display text-xl text-ink">
            <Package size={18} className="shrink-0 text-accent" />
            <span className="truncate" title={title}>
              {title}
            </span>
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
            <span className="inline-flex items-center gap-1.5 text-accent">
              <Package size={14} /> {children.length} game{children.length === 1 ? "" : "s"} ·{" "}
              {finished} finished
            </span>
            {!hideSpend && compilation && (
              <span className="inline-flex items-center gap-1.5 font-medium text-accent">
                <Banknote size={14} /> {formatUsd(compilation.totalCost)} spent
              </span>
            )}
          </div>

          {/* Checklist of every bundled game. */}
          <ul className="flex flex-col gap-1">
            {children.map((c) => {
              const done = c.status === "finished";
              const cost = totalCost(c.copies);
              return (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-line bg-panel/50 px-2.5 py-2"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {/* A finished game is checked off; unfinished ones get a blank
                        spacer (not a hollow circle, which read as a radio button). */}
                    {done ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink" title={c.title}>
                        {c.title}
                      </span>
                      <div className="mt-0.5">
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                  </div>
                  {!hideSpend && (
                    <span className="mt-0.5 shrink-0 text-xs text-muted">
                      {cost > 0 ? formatUsd(cost) : "—"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {!readOnly && compilation && (
            <div className="flex flex-wrap items-center gap-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-ink transition hover:border-brand/50"
                >
                  <Pencil size={14} className="text-accent" /> Edit compilation
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm text-muted transition hover:border-danger/40 hover:text-danger"
              >
                <Trash2 size={14} /> Delete compilation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
