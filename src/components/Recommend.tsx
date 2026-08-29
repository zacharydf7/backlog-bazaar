// Tastemaker Recommendations (issue c48e8f6d) — sender-side modal ("Recommend
// to a friend" from a card's ⋮ menu) and the receiver-side card chip. The
// inbox lives in the Community page's Recommendations section. Soft-launched
// behind the recs.use permission; callers gate visibility with can("recs.use").

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Gift, Send, X } from "lucide-react";
import type { Game } from "../types";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import {
  recipientBlockReason,
  recommendationForGame,
  type RecRecipientOption,
} from "../lib/recommendations";

/** Pick a friend (server-filtered options with per-friend eligibility), write
 *  an optional pitch, send. The server re-verifies everything on submit. */
export function RecommendModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { fetchRecRecipientOptions, sendRecommendation, recDiscountPct, recBountyPct } =
    useStore();
  useScrollLock(true);
  const [options, setOptions] = useState<RecRecipientOption[] | null>(null);
  const [receiverId, setReceiverId] = useState("");
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchRecRecipientOptions(game.id).then((opts) => {
      if (!live) return;
      setOptions(opts);
      // Preselect the first friend who can actually receive it.
      setReceiverId((cur) => cur || (opts.find((o) => !recipientBlockReason(o))?.id ?? ""));
    });
    return () => {
      live = false;
    };
  }, [fetchRecRecipientOptions, game.id]);

  const receiver = options?.find((o) => o.id === receiverId);
  const error =
    options == null
      ? null // still loading — submit stays disabled via `receiver == null`
      : options.length === 0
        ? null // the empty state below covers it
        : receiver == null
          ? "Pick a friend."
          : recipientBlockReason(receiver);

  async function submit() {
    if (error || busy || !receiver) return;
    setBusy(true);
    const ok = await sendRecommendation(game.id, receiver.id, pitch);
    setBusy(false);
    if (ok) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="inline-flex min-w-0 items-center gap-2 font-display text-lg text-ink">
            <Gift size={16} className="shrink-0 text-accent" />
            <span className="truncate">Recommend {game.title}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted transition hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">
            They&apos;ll get it in their Recommendations inbox. If they add it, their copy
            starts <span className="font-medium text-ink">{recDiscountPct}% off</span> — and
            the moment they pay that discounted fee, you earn a Tastemaker Bounty of{" "}
            <span className="font-medium text-ink">{recBountyPct}%</span> of it.
          </p>

          {options != null && options.length === 0 ? (
            <p className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-muted">
              No friends can receive this right now — they may already own it, or aren&apos;t
              in the recommendations preview yet.
            </p>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-subtle">
                Recommend to
              </span>
              <select
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                disabled={options == null}
                className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-brand/60 disabled:opacity-60"
              >
                {options == null ? (
                  <option value="">Loading friends…</option>
                ) : (
                  options.map((o) => {
                    const blocked = recipientBlockReason(o);
                    return (
                      <option key={o.id} value={o.id} disabled={blocked != null}>
                        {o.displayName}
                        {blocked ? ` — ${blocked.toLowerCase()}` : ""}
                      </option>
                    );
                  })
                )}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-subtle">
              Why should they play it? <span className="normal-case">(optional)</span>
            </span>
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              rows={4}
              placeholder="Make your pitch — as long as you like."
              className="w-full resize-y rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink outline-none placeholder:text-subtle focus:border-brand/60"
            />
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={() => void submit()}
            disabled={!!error || busy || receiver == null}
            className={
              "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition " +
              (error || busy || receiver == null
                ? "cursor-not-allowed bg-panel text-subtle"
                : "bg-brand text-brand-fg hover:brightness-105")
            }
          >
            <Send size={15} /> Send recommendation
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Receiver-side chip: this copy came from a friend's recommendation and its
 *  first activation is discounted. Self-hiding (the SponsorChip pattern) —
 *  reads the store, renders nothing without a live matching rec. */
export function RecChip({ game }: { game: Game }) {
  const recommendations = useStore((s) => s.recommendations);
  const userId = useStore((s) => s.userId);
  const recDiscountPct = useStore((s) => s.recDiscountPct);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const rec = recommendationForGame(recommendations, userId, game);
  if (!rec || game.status !== "backlog") return null;
  const who = rec.senderName ?? "a friend";
  return (
    <span
      title={
        economyEnabled
          ? `Recommended by ${who} — starts ${recDiscountPct}% off`
          : `Recommended by ${who}`
      }
      className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
    >
      <Gift size={10} /> {economyEnabled ? `${who} · ${recDiscountPct}% off` : who}
    </span>
  );
}
