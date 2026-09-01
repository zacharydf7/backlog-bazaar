import { Cloud, CloudOff, Handshake, Users, type LucideIcon } from "lucide-react";
import type { ModifierAcquisition } from "../types";
import { acquisitionLabel } from "../lib/copies";

/** Icon per "modifier" acquisition (owned gets none — it's the default). */
const ICON: Record<ModifierAcquisition, LucideIcon> = {
  subscription: Cloud,
  borrowed: Handshake,
  player2: Users,
};

/** The hover explanation per modifier, with the provider woven in. */
function tooltip(acquisition: ModifierAcquisition, provider?: string | null): string {
  const p = provider?.trim();
  switch (acquisition) {
    case "subscription":
      return `Subscription copy${p ? ` · ${p}` : ""} — not permanently yours`;
    case "borrowed":
      return `Borrowed${p ? ` · ${p}` : ""}`;
    case "player2":
      return `Player 2${p ? ` · ${p}` : ""} — playing on someone else's copy (never counts toward your spend)`;
  }
}

/** The chip text when access to the game is gone (every base copy lapsed) —
 *  says what happened per acquisition, naming the service when known. */
function lapsedText(acquisition: ModifierAcquisition, provider?: string | null): string {
  const p = provider?.trim();
  switch (acquisition) {
    case "subscription":
      return p ? `No longer on ${p}` : "Left the subscription";
    case "borrowed":
      return "Returned — no longer on loan";
    case "player2":
      return "Player 2 seat closed";
  }
}

/** A subtle chip flagging a copy that isn't plainly owned — available through a
 *  subscription (Game Pass, PS Plus…), borrowed, or a Player 2 seat on someone
 *  else's copy (issue 3eb956ff). Names the provider when one was recorded, else
 *  the acquisition itself. Kept a quiet muted pill (not an accent stamp) so it
 *  reads as a caveat on ownership, not an achievement. With `lapsed` (access
 *  gone — see accessLost) it flips to the danger-tinted "no longer available"
 *  reading instead. */
export function AcquisitionBadge({
  acquisition,
  provider,
  lapsed = false,
  className = "",
}: {
  acquisition: ModifierAcquisition;
  provider?: string | null;
  lapsed?: boolean;
  className?: string;
}) {
  const Icon = lapsed ? CloudOff : ICON[acquisition];
  const text = lapsed
    ? lapsedText(acquisition, provider)
    : provider?.trim() || acquisitionLabel(acquisition);
  return (
    <span
      title={
        lapsed
          ? `${lapsedText(acquisition, provider)} — locked from starting until you mark it regained`
          : tooltip(acquisition, provider)
      }
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed px-1.5 py-0.5 text-[10px] font-medium " +
        (lapsed ? "border-danger/40 bg-panel text-danger " : "border-line bg-panel text-muted ") +
        className
      }
    >
      <Icon size={11} className={"shrink-0 " + (lapsed ? "text-danger/80" : "text-accent/80")} />
      {text}
    </span>
  );
}
