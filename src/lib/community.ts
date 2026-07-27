// The Community page: one routed destination bundling the social surfaces —
// Friends, the activity feed, Messages, and the Market Square. Each section is
// its own View id (the AdminPage pattern), so deep links, refresh, and the
// browser Back button all work per-section. Pure helpers here so they're
// unit-testable without the DOM.

import type { View } from "../components/Sidebar";

/** The Community page's sections, each a routed view. Order = tab order. */
export const COMMUNITY_VIEWS = [
  "community",
  "community-activity",
  "community-messages",
  "community-discover",
] as const;

export type CommunityView = (typeof COMMUNITY_VIEWS)[number];

const COMMUNITY_SET = new Set<string>(COMMUNITY_VIEWS);

/** True when a view is one of the Community page's sections. */
export function isCommunityView(v: View): v is CommunityView {
  return COMMUNITY_SET.has(v);
}
