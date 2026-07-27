import { useEffect } from "react";
import { Users, Newspaper, Mail, Tent, type LucideIcon } from "lucide-react";
import { useStore } from "../../store";
import { isCommunityView, saveCommunitySection, type CommunityView } from "../../lib/community";
import type { View } from "../Sidebar";
import { FriendsSection } from "./FriendsSection";
import { ActivitySection } from "./ActivitySection";
import { MessagesSection } from "./MessagesSection";
import { MarketSquare } from "../MarketSquare";

// One routed Community page hosting every social surface as a section — the
// AdminPage pattern: each section is its own View, rendered inside this shared
// shell, so deep links and the browser Back button keep working while the page
// stays put. Friends opens first; the Market Square keeps its own name (it's
// the community discovery surface, moved here from the utility nav).

const SECTIONS: { view: CommunityView; label: string; icon: LucideIcon }[] = [
  { view: "community", label: "Friends", icon: Users },
  { view: "community-activity", label: "Activity", icon: Newspaper },
  { view: "community-messages", label: "Messages", icon: Mail },
  { view: "community-discover", label: "Market Square", icon: Tent },
];

export function CommunityPage({
  view,
  onNavigate,
  dmTarget,
  onMessageUser,
}: {
  view: View;
  onNavigate: (v: View) => void;
  /** A conversation to open when the Messages section mounts (set by "Message"
   *  actions elsewhere; null lands on the conversation list). */
  dmTarget: { id: string; name: string } | null;
  onMessageUser: (id: string, name: string) => void;
}) {
  const friendRequestCount = useStore((s) => s.friendRequestCount);
  const unreadMessageCount = useStore((s) => s.unreadMessageCount);
  const openUserBazaar = useStore((s) => s.openUserBazaar);

  const active: CommunityView = isCommunityView(view) ? view : "community";

  // Remember the last-viewed section — the nav's Community entry reopens it,
  // while explicit links (notifications, "Message" actions) still force theirs.
  useEffect(() => {
    saveCommunitySection(active);
  }, [active]);

  // Per-section "needs attention" counts: incoming requests on Friends, unread
  // chats on Messages. Alerts stay on the bell — never here.
  const badgeCount = (v: CommunityView): number =>
    v === "community"
      ? friendRequestCount
      : v === "community-messages"
        ? unreadMessageCount
        : 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
        <Users size={18} className="text-accent" /> Community
      </h2>

      {/* Section bar — wraps on narrow screens so nothing clips on a phone. */}
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {SECTIONS.map((s) => {
          const isActive = active === s.view;
          const Icon = s.icon;
          const count = badgeCount(s.view);
          return (
            <button
              key={s.view}
              role="tab"
              aria-selected={isActive}
              onClick={() => onNavigate(s.view)}
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                (isActive
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-panel text-muted hover:text-ink")
              }
            >
              <Icon size={15} /> {s.label}
              {count > 0 && (
                <span
                  className={
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold " +
                    (isActive ? "bg-brand-fg text-brand" : "bg-brand text-brand-fg")
                  }
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active === "community" ? (
        <FriendsSection onVisit={(id) => void openUserBazaar(id)} onMessage={onMessageUser} />
      ) : active === "community-activity" ? (
        <ActivitySection onFindFriends={() => onNavigate("community")} />
      ) : active === "community-messages" ? (
        <MessagesSection compose={dmTarget} />
      ) : (
        <MarketSquare />
      )}
    </div>
  );
}
