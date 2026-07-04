import { Cloud, Handshake, type LucideIcon } from "lucide-react";
import { acquisitionLabel } from "../lib/copies";

/** Icon per "modifier" acquisition (owned gets none — it's the default). */
const ICON: Record<"subscription" | "borrowed", LucideIcon> = {
  subscription: Cloud,
  borrowed: Handshake,
};

/** A subtle chip flagging a copy that isn't plainly owned — available through a
 *  subscription (Game Pass, PS Plus…) or borrowed. Names the provider when one
 *  was recorded, else the acquisition itself. Kept a quiet muted pill (not an
 *  accent stamp) so it reads as a caveat on ownership, not an achievement. */
export function AcquisitionBadge({
  acquisition,
  provider,
  className = "",
}: {
  acquisition: "subscription" | "borrowed";
  provider?: string | null;
  className?: string;
}) {
  const Icon = ICON[acquisition];
  const text = provider?.trim() || acquisitionLabel(acquisition);
  return (
    <span
      title={
        acquisition === "subscription"
          ? `Subscription copy${provider ? ` · ${provider}` : ""} — not permanently yours`
          : `Borrowed${provider ? ` · ${provider}` : ""}`
      }
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
