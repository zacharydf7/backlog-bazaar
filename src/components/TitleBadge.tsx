import type { Badge } from "../types";
import { resolveBadgeIcon, badgePrestigeClass } from "../lib/badges";

/** A small, theme-aware prestige chip (icon + name). Used wherever a player's
 *  title/badges appear: profile header, Market Square, trophy case, admin UI. */
export function TitleBadge({ badge, size = "sm" }: { badge: Badge; size?: "xs" | "sm" }) {
  const Icon = resolveBadgeIcon(badge.icon);
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  const iconSize = size === "xs" ? 10 : 12;
  return (
    <span
      title={badge.description ?? badge.name}
      className={
        "inline-flex items-center gap-1 rounded-full border font-medium " +
        pad +
        " " +
        badgePrestigeClass(badge.prestige)
      }
    >
      <Icon size={iconSize} className="shrink-0" />
      <span className="truncate">{badge.name}</span>
    </span>
  );
}
