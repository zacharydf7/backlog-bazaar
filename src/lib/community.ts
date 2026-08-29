// The Community page: one routed destination bundling the social surfaces —
// Friends, the activity feed, Messages, and the Market Square. Each section is
// its own View id (the AdminPage pattern), so deep links, refresh, and the
// browser Back button all work per-section. Pure helpers here so they're
// unit-testable without the DOM.

import type { View } from "../components/Sidebar";

/** The Community page's sections, each a routed view. Order = tab order.
 *  community-recs is the Tastemaker Recommendations inbox (issue c48e8f6d). */
export const COMMUNITY_VIEWS = [
  "community",
  "community-activity",
  "community-messages",
  "community-recs",
  "community-discover",
] as const;

export type CommunityView = (typeof COMMUNITY_VIEWS)[number];

const COMMUNITY_SET = new Set<string>(COMMUNITY_VIEWS);

/** True when a view is one of the Community page's sections. */
export function isCommunityView(v: View): v is CommunityView {
  return COMMUNITY_SET.has(v);
}

const SECTION_PREF_KEY = "bb:community-section";

/** The section the Community nav entry opens: the one last viewed, so ordinary
 *  navigation remembers where you were. Explicit links (a notification, a
 *  "Message" action) bypass this and force their own section. Falls back to
 *  Friends when nothing's stored, the value is unrecognized, or localStorage
 *  is unavailable. */
export function loadCommunitySection(): CommunityView {
  try {
    const v = localStorage.getItem(SECTION_PREF_KEY);
    return v && COMMUNITY_SET.has(v) ? (v as CommunityView) : "community";
  } catch {
    return "community";
  }
}

/** Remember the last-viewed Community section for next time. */
export function saveCommunitySection(v: CommunityView): void {
  try {
    localStorage.setItem(SECTION_PREF_KEY, v);
  } catch {
    /* ignore */
  }
}
