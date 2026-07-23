import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw } from "lucide-react";
import type { Game } from "../../types";
import { useStore } from "../../store";
import { fetchHltbTimes, type HltbTimes } from "../../lib/gamedata";
import { parsePlaytime, formatPlaytime, formatLength } from "../../lib/playtime";
import { lengthActivationFee } from "../../lib/economy";
import { effectiveLength, hasPersonalLength, lengthChangeSettlement } from "../../lib/personalLength";
import { useScrollLock } from "../../lib/useScrollLock";
import { useHistoryDismiss } from "../../lib/useHistoryDismiss";
import { CoinIcon } from "../CoinIcon";

const PLAYSTYLES = [
  { key: "main", title: "Mainline it", desc: "Just the main story" },
  { key: "mainExtra", title: "Full playthrough", desc: "Main + extras" },
  { key: "completionist", title: "Complete it", desc: "100% / completionist" },
] as const;

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand/25";

/** Owner-only "how are you playing this?" control (issue: personal length). Lets
 *  the player set their OWN length estimate for a game — overriding the shared
 *  catalog length in the economy without ever touching the catalog — via the same
 *  HowLongToBeat playstyle chips as the Add flow, plus a manual field. For a game
 *  you're already playing it previews and settles the coin consequence: a longer
 *  estimate collects the extra activation fee (deferring what you can't afford to
 *  the finish bounty), a shorter one refunds it. */
export function PersonalLengthModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const { economy, economyEnabled, coins, setPersonalLength } = useStore();

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  const [hltb, setHltb] = useState<HltbTimes | null>(null);
  const [loadingLength, setLoadingLength] = useState(false);
  // The draft length string, seeded from the game's current effective length.
  const [draft, setDraft] = useState(() => formatLength(effectiveLength(game)));
  const [saving, setSaving] = useState(false);

  // Pull HowLongToBeat times so the playstyle chips can offer real estimates.
  useEffect(() => {
    let active = true;
    setLoadingLength(true);
    fetchHltbTimes(game.title)
      .then((t) => active && setHltb(t ?? null))
      .catch(() => {})
      .finally(() => active && setLoadingLength(false));
    return () => {
      active = false;
    };
  }, [game.title]);

  const parsed = parsePlaytime(draft);
  const catalogLength = game.hours;

  // Whether changing the length re-settles coins right now — a game you're
  // actively playing on the live economy (mirrors the store/RPC guard).
  const settles =
    game.status === "playing" &&
    economyEnabled &&
    game.startedEconomyOff !== true &&
    game.ongoing !== true;

  // Preview the coin settlement using the SAME length-fee computation the store
  // and server RPC use, so what's shown is exactly what will be charged/refunded.
  const preview = useMemo(() => {
    if (parsed == null) return null;
    return lengthChangeSettlement({
      priceAt: (h) => lengthActivationFee(economy.price, h),
      currentEffective: effectiveLength(game),
      newEffective: parsed ?? game.hours,
      coins,
      owed: game.lengthPremiumOwed ?? 0,
      settles,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, game, economy.price, coins, settles]);

  const unchanged = parsed != null && parsed === (effectiveLength(game) ?? null);

  async function save(hours: number | null) {
    setSaving(true);
    try {
      await setPersonalLength(game.id, hours);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-display text-lg text-ink">How are you playing it?</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">
            Set your own length for <span className="font-medium text-ink">{game.title}</span>. This
            adjusts only your coins — the shared catalog length stays as it is.
          </p>

          {/* Playstyle chips — only when HowLongToBeat returned times. */}
          {loadingLength && !hltb && (
            <p className="text-xs text-accent">Finding HowLongToBeat estimates…</p>
          )}
          {hltb && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PLAYSTYLES.map((ps) => {
                const value = hltb[ps.key];
                if (!value) return null;
                const active = parsed != null && Math.abs(parsed - value) < 0.001;
                return (
                  <button
                    key={ps.key}
                    type="button"
                    onClick={() => setDraft(formatLength(value))}
                    className={
                      "rounded-xl border px-3 py-2 text-left transition " +
                      (active ? "border-brand bg-brand/10" : "border-line bg-panel hover:border-brand/50")
                    }
                  >
                    <div className="text-sm font-medium text-ink">{ps.title}</div>
                    <div className="text-xs text-subtle">{ps.desc}</div>
                    <div className="mt-1 font-display text-lg text-accent">{formatPlaytime(value)}</div>
                  </button>
                );
              })}
            </div>
          )}

          <label className="text-sm text-muted">
            Your length
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. 32h or 1h 30m"
              className={inputClass}
            />
          </label>

          {parsed == null && draft.trim() !== "" && (
            <p className="text-xs text-danger">Enter a length like “32h” or “1h 30m”.</p>
          )}

          {/* The coin consequence, for a game you're actively playing. */}
          {preview && settles && preview.priceDelta !== 0 && !unchanged && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-2.5 text-xs text-muted">
              {preview.priceDelta > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    Activation top-up:{" "}
                    <span className="inline-flex items-center gap-0.5 text-accent">
                      <CoinIcon size={12} /> {preview.priceDelta}
                    </span>
                  </span>
                  <div className="mt-1">
                    {preview.deferred > 0 ? (
                      <>
                        <span className="inline-flex items-center gap-0.5">
                          <CoinIcon size={11} /> {preview.chargeNow}
                        </span>{" "}
                        charged now, and{" "}
                        <span className="inline-flex items-center gap-0.5">
                          <CoinIcon size={11} /> {preview.deferred}
                        </span>{" "}
                        deferred — taken off your finish bounty instead. It won&apos;t block if you
                        can&apos;t cover it all now.
                      </>
                    ) : (
                      <>
                        Charged from your balance now, since a longer game costs more to have
                        activated.
                      </>
                    )}
                  </div>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-ink">
                  Refund:{" "}
                  <span className="inline-flex items-center gap-0.5 text-success">
                    <CoinIcon size={12} /> {preview.refund > 0 ? preview.refund : 0}
                  </span>
                  {preview.refund === 0 && (
                    <span className="font-normal text-muted"> — clears part of your deferred fee</span>
                  )}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Revert to following the shared catalog length. */}
            {hasPersonalLength(game) ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:text-accent disabled:opacity-50"
              >
                <RotateCcw size={13} /> Use catalog length
                {catalogLength ? ` (${formatPlaytime(catalogLength)})` : ""}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-panel px-3 py-1.5 text-sm text-ink transition hover:brightness-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || parsed == null || unchanged}
                onClick={() => parsed != null && void save(parsed)}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save length
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
