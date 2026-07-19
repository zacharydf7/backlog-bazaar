// Pure helpers for the badges/titles system. The badge *catalog* lives in the DB
// (so adding a badge is data, not code); this module only handles client-side
// display: turning a stored icon name into a component, ordering badges, and
// resolving which one a user shows as their title. Kept pure so it's unit-tested
// without React/Supabase.

import {
  Award,
  FlaskConical,
  Star,
  Crown,
  Bug,
  Sparkles,
  Trophy,
  Heart,
  Shield,
  Zap,
  Gem,
  Medal,
  Moon,
  Rocket,
  Target,
  Clock,
  Coins,
  Library,
  FlagOff,
  Milestone,
  ThumbsUp,
  ListOrdered,
  type LucideIcon,
} from "lucide-react";
import type { Badge } from "../types";

/** Map a badge's stored icon name (kebab-case, matching lucide) to a component.
 *  To support a new icon for a future badge, add one line here; any unknown name
 *  falls back to a generic award icon, so a badge added in the DB never crashes
 *  the UI even if its icon hasn't been wired up yet. */
const ICONS: Record<string, LucideIcon> = {
  award: Award,
  "flask-conical": FlaskConical,
  star: Star,
  crown: Crown,
  bug: Bug,
  sparkles: Sparkles,
  trophy: Trophy,
  heart: Heart,
  shield: Shield,
  zap: Zap,
  gem: Gem,
  medal: Medal,
  rocket: Rocket,
  // Achievement-family icons (the achievements catalog shares this registry —
  // both stores keep lucide names in the DB):
  target: Target,
  clock: Clock,
  coins: Coins,
  library: Library,
  "flag-off": FlagOff,
  milestone: Milestone,
  // Likes/Tastemaker (a thumbs-up, NOT a heart — the heart is the Wishlist's).
  "thumbs-up": ThumbsUp,
  // Custom lists / the Curator family (a ranked list).
  "list-ordered": ListOrdered,
  // Curio Shop title badges (e.g. Night Owl).
  moon: Moon,
};

export const DEFAULT_BADGE_ICON: LucideIcon = Award;

export function resolveBadgeIcon(name: string): LucideIcon {
  return ICONS[name] ?? DEFAULT_BADGE_ICON;
}

/** Badges ordered for display: rarest (highest prestige) first, then by name. */
export function sortBadges(badges: Badge[]): Badge[] {
  return [...badges].sort((a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name));
}

/** The badge a user displays as their title, given their holdings and chosen id.
 *  Returns null when nothing is selected or the selected badge isn't (any longer)
 *  held — so a revoked title never lingers. */
export function resolveTitle(badges: Badge[], selectedId: string | null): Badge | null {
  if (!selectedId) return null;
  return badges.find((b) => b.id === selectedId) ?? null;
}

/** Chip classes by prestige tier — theme tokens only, so every theme works.
 *  Higher tiers read as fancier/rarer. */
export function badgePrestigeClass(prestige: number): string {
  if (prestige >= 10) return "border-brand/40 bg-brand/10 text-accent";
  if (prestige >= 5) return "border-line bg-panel text-ink";
  return "border-line bg-surface text-muted";
}

/** Chip classes for a badge, kind-aware: Curio Shop titles get their own
 *  accent-toned dashed treatment so BOUGHT flair is always distinguishable from
 *  EARNED prestige, no matter how the prestige numbers compare. */
export function badgeChipClass(badge: Pick<Badge, "kind" | "prestige">): string {
  if (badge.kind === "shop") return "border-dashed border-accent/50 bg-accent/10 text-accent";
  return badgePrestigeClass(badge.prestige);
}
