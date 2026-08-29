// The Community page's Recommendations section (Tastemaker, issue c48e8f6d):
// the inbox of games friends recommended (add or decline each card) plus the
// status of everything you've sent. Soft-launched — the tab only renders for
// recs.use holders (CommunityPage filters it).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Gift, Send, ThumbsDown, Plus } from "lucide-react";
import { useStore } from "../../store";
import { AddGameModal } from "../AddGameModal";
import { formatPlaytime } from "../../lib/playtime";
import {
  incomingRecommendations,
  recommendationToAddMeta,
  recStatusLabel,
  sentRecommendations,
  type GameRecommendation,
} from "../../lib/recommendations";

export function RecsSection() {
  const {
    userId,
    recommendations,
    recDiscountPct,
    economyEnabled,
    fetchRecommendations,
    fetchPendingRecCount,
    declineRecommendation,
    markRecommendationImported,
  } = useStore();
  // The card being imported — its Add modal is open, pre-picked.
  const [importing, setImporting] = useState<GameRecommendation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fresh on open: a rec may have arrived (or been resolved) since boot.
  useEffect(() => {
    void fetchRecommendations();
    void fetchPendingRecCount();
  }, [fetchRecommendations, fetchPendingRecCount]);

  const incoming = incomingRecommendations(recommendations, userId);
  const sent = sentRecommendations(recommendations, userId);

  return (
    <div className="flex flex-col gap-6">
      {/* Inbox */}
      <section className="flex flex-col gap-2.5">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Gift size={15} className="text-accent" /> From your friends
        </h3>
        {incoming.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-muted">
            No recommendations waiting. When a friend pitches you a game, it lands here
            {economyEnabled ? ` — and adding it starts ${recDiscountPct}% off.` : "."}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {incoming.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 sm:flex-row"
              >
                {/* Box art */}
                <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg bg-panel sm:h-24 sm:w-40">
                  {r.gameImage ? (
                    <img
                      src={r.gameImage}
                      alt={r.gameTitle}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl opacity-60">
                      🎮
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base leading-tight text-ink">
                      {r.gameTitle}
                    </span>
                    {r.hours != null && r.hours > 0 && (
                      <span className="text-[11px] text-subtle">~{formatPlaytime(r.hours)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    {r.senderAvatar ? (
                      <img
                        src={r.senderAvatar}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-panel text-[10px]">
                        {(r.senderName ?? "?").slice(0, 1)}
                      </span>
                    )}
                    <span className="truncate">
                      Recommended by{" "}
                      <span className="font-medium text-ink">{r.senderName ?? "a friend"}</span>
                    </span>
                  </div>
                  {r.pitch && (
                    <p className="whitespace-pre-wrap border-l-2 border-accent/40 pl-2 text-sm italic text-muted">
                      {r.pitch}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => setImporting(r)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105"
                    >
                      <Plus size={14} /> Add to library
                      {economyEnabled && (
                        <span className="text-[11px] font-normal opacity-90">
                          · starts {recDiscountPct}% off
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setBusyId(r.id);
                        void declineRecommendation(r.id).finally(() => setBusyId(null));
                      }}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm text-muted transition hover:text-danger disabled:opacity-60"
                    >
                      <ThumbsDown size={14} /> Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sent */}
      <section className="flex flex-col gap-2.5">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Send size={15} className="text-accent" /> Your recommendations
        </h3>
        {sent.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-muted">
            Nothing sent yet — open the ⋮ menu on any game you own and pick{" "}
            <span className="font-medium text-ink">Recommend to a friend</span>.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sent.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.gameTitle}</span>
                <span className="truncate text-xs text-muted">
                  to {r.receiverName ?? "a friend"}
                </span>
                <span
                  className={
                    "rounded-full border px-1.5 py-0.5 text-[10px] font-medium " +
                    (r.status === "activated"
                      ? "border-success/40 bg-success/10 text-success"
                      : r.status === "declined"
                        ? "border-line bg-panel text-subtle"
                        : "border-accent/40 bg-accent/10 text-accent")
                  }
                >
                  {recStatusLabel(r)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {importing &&
        createPortal(
          <AddGameModal
            initialPick={recommendationToAddMeta(importing)}
            onClose={() => setImporting(null)}
            // Link the created card back to the recommendation: drives the
            // card's tag and the exact-row match at activation. Best-effort —
            // identity matching in apply_purchase covers a missed link.
            onAdded={(gameId) => void markRecommendationImported(importing.id, gameId)}
          />,
          document.body,
        )}
    </div>
  );
}
