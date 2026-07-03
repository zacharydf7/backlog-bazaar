import { X } from "lucide-react";
import type { Game } from "../../types";
import { ViewingProvider } from "../../lib/viewContext";
import { useScrollLock } from "../../lib/useScrollLock";
import { useHistoryDismiss } from "../../lib/useHistoryDismiss";
import { ReadOnlyOverview } from "./OverviewTab";

/** A read-only peek at a single game, for places the routed game page can't
 *  serve: a game shared in chat lives in the SENDER's library (no store slice
 *  of ours resolves it), and navigating away would dump the reader out of
 *  their conversation. So the shared look-only Overview renders in a slim
 *  modal instead — same content as visiting the owner's Bazaar. */
export function GamePreviewModal({
  game,
  hideSpend,
  onClose,
}: {
  game: Game;
  hideSpend: boolean;
  onClose: () => void;
}) {
  useScrollLock(true);
  useHistoryDismiss(true, onClose); // Back closes the preview, not the chat

  return (
    <ViewingProvider value={{ readOnly: true, hideSpend }}>
      <div
        className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
        onClick={onClose}
      >
        <div
          className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-line p-4">
            <h2 className="min-w-0 truncate font-display text-xl text-ink">{game.title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 text-muted transition hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {game.image && (
              <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
                <img src={game.image} alt="" className="h-full w-full object-cover" />
              </div>
            )}
            <ReadOnlyOverview game={game} hideSpend={hideSpend} />
          </div>
        </div>
      </div>
    </ViewingProvider>
  );
}
