import { Coins } from "lucide-react";
import { useStore } from "../store";
import { useNow } from "../lib/useNow";
import { boostLabels, eventIsLive, eventWhenLabel, targetLabel } from "../lib/bonusEvents";

/** The Bazaar board's coin event banner: events running now and any starting
 *  within the week that apply to you (the server filters both), each with
 *  what it boosts, for which games, and when it ends or starts. Own board
 *  only, and hidden with the economy off. */
export function BonusEventStrip() {
  const events = useStore((s) => s.bonusEvents);
  const viewing = useStore((s) => s.viewing);
  const economyOn = useStore((s) => s.economyEnabled);
  const now = useNow(events.length > 0, 60_000);
  const shown = events.filter((e) => e.endsAt > now);
  if (viewing || !economyOn || shown.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {shown.map((e) => {
        const live = eventIsLive(e, now);
        const target = targetLabel(e);
        const capLeft = e.playerCap != null ? Math.max(0, e.playerCap - e.capUsed) : null;
        const startsLeft =
          e.startDiscountPct > 0 && e.discountLimit != null ? Math.max(0, e.discountLimit - e.discountUsed) : null;
        return (
          <div
            key={e.id}
            className={
              "rounded-xl border p-3 " + (live ? "border-brand/50 bg-brand/10" : "border-accent/30 bg-accent/5")
            }
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Coins size={15} className="text-accent" />
                {live ? "Coin event" : "Coming up"}: {e.name}
              </p>
              <span className="text-xs text-subtle">{eventWhenLabel(e, now)}</span>
            </div>
            {e.description && <p className="mt-1 text-xs text-muted">{e.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {boostLabels(e).map((b) => (
                <span key={b} className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink">
                  {b}
                </span>
              ))}
              {target && (
                <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">For {target}</span>
              )}
              {live && startsLeft != null && (
                <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                  {startsLeft > 0
                    ? `${startsLeft} of ${e.discountLimit} discounted ${e.discountLimit === 1 ? "start" : "starts"} left`
                    : "Discounted starts used"}
                </span>
              )}
              {capLeft != null && (
                <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                  {capLeft > 0 ? `Up to ${capLeft} bonus coins left` : "Bonus cap reached"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
