import { Cloud, Handshake, Users, type LucideIcon } from "lucide-react";
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

/** A subtle chip flagging a copy that isn't plainly owned — available through a
 *  subscription (Game Pass, PS Plus…), borrowed, or a Player 2 seat on someone
 *  else's copy (issue 3eb956ff). Names the provider when one was recorded, else
 *  the acquisition itself. Kept a quiet muted pill (not an accent stamp) so it
 *  reads as a caveat on ownership, not an achievement. */
export function AcquisitionBadge({
  acquisition,
  provider,
  className = "",
}: {
  acquisition: ModifierAcquisition;
  provider?: string | null;
  className?: string;
}) {
  const Icon = ICON[acquisition];
  const text = provider?.trim() || acquisitionLabel(acquisition);
  return (
    <span
      title={tooltip(acquisition, provider)}
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-line bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted " +
        className
      }
    >
      <Icon size={11} className="shrink-0 text-accent/80" />
      {text}
    </span>
  );
}
