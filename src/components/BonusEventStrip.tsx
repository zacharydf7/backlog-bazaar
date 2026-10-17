import { CalendarDays, Coins, Lightbulb, PartyPopper } from "lucide-react";
import { useStore } from "../store";
import { useNow } from "../lib/useNow";
import { routeToHash } from "../lib/route";
import { boostLabels, eventIsLive, eventWhenLabel, hasBoost, targetLabel } from "../lib/bonusEvents";

/** The event banner on the Bazaar and Now Playing boards: events running now
 *  and any starting within the week that apply to you (the server filters
 *  both), each with what it boosts, for which games, when it ends or starts,
 *  and how to get ready, plus a way into the Calendar. Own boards only; coin
 *  boosts hide with the economy off, holiday notes don't. */
export function BonusEventStrip() {
  const events = useStore((s) => s.bonusEvents);
  const viewing = useStore((s) => s.viewing);
  const economyOn = useStore((s) => s.economyEnabled);
  const now = useNow(events.length > 0, 60_000);
  const shown = events.filter((e) => e.endsAt > now && (economyOn || !hasBoost(e)));
  if (viewing || shown.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-2">
      {shown.map((e) => {
        const live = eventIsLive(e, now);
        const boosted = hasBoost(e);
        const target = targetLabel(e);
        const capLeft = e.playerCap != null ? Math.max(0, e.playerCap - e.capUsed) : null;
        const startsLeft =
          e.startDiscountPct > 0 && e.discountLimit != null ? Math.max(0, e.discountLimit - e.discountUsed) : null;
        return (
          <div
            key={e.id}
            className={
              "rounded-xl p-3 " + (live ? "border-2 border-success bg-success/10" : "border border-accent/30 bg-accent/5")
            }
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                {live ? (
                  <PartyPopper size={15} className="text-success" />
                ) : (
                  <Coins size={15} className="text-accent" />
                )}
                {live ? (boosted ? "Coin event" : "Now on") : "Coming up"}: {e.name}
              </p>
              <span className="text-xs text-subtle">{eventWhenLabel(e, now)}</span>
            </div>
            {e.description && <p className="mt-1 text-xs text-muted">{e.description}</p>}
            {!live && e.prepTip && (
              <p className="mt-1 inline-flex items-start gap-1 text-xs font-medium text-ink">
                <Lightbulb size={13} className="mt-0.5 shrink-0 text-accent" /> Get ready: {e.prepTip}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
      <a
        href={routeToHash({ kind: "view", view: "calendar" })}
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        <CalendarDays size={13} /> See the calendar
      </a>
    </div>
  );
}
