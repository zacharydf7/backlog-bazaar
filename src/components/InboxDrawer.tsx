import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Bell, Mail, Users, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { NotificationList } from "./NotificationList";
import { MessagesPanel } from "./MessagesPanel";
import { SocialPanel } from "./SocialPanel";

export type InboxTab = "alerts" | "messages" | "friends";

/** The unified inbox: one right-side slide-out hosting Alerts (notifications),
 *  Messages (the chat inbox), and Friends (activity feed + directory) as tabs.
 *  Replaces the three separate top-bar buttons/panels so the mobile header has room
 *  for the wordmark. Toggled from the single top-bar inbox button. */
export function InboxDrawer({
  onClose,
  onVisit,
  onNotificationNavigate,
  initialTab = "alerts",
  initialCompose = null,
}: {
  onClose: () => void;
  onVisit: (userId: string) => void;
  onNotificationNavigate: (link: string) => void;
  initialTab?: InboxTab;
  initialCompose?: { id: string; name: string } | null;
}) {
  const [tab, setTab] = useState<InboxTab>(initialTab);
  // A compose target for the Messages tab, set when "Message" is tapped on a friend.
  const [compose, setCompose] = useState<{ id: string; name: string } | null>(initialCompose);

  // Per-tab unread/pending counts drive the sub-badges.
  const unreadAlerts = useStore((s) => s.notifications.filter((n) => !n.readAt).length);
  const unreadMessages = useStore((s) => s.unreadMessageCount);
  const friendRequests = useStore((s) => s.friendRequestCount);
  const markAllNotificationsRead = useStore((s) => s.markAllNotificationsRead);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // Clear the alert badge once you've viewed the Alerts tab — on leaving it (tab
  // switch) or closing the drawer while it's open. Mirrors the old bell's behavior.
  useEffect(() => {
    if (tab !== "alerts") return;
    return () => {
      void markAllNotificationsRead();
    };
  }, [tab, markAllNotificationsRead]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label="Inbox"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-display text-lg text-ink">Inbox</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top-level tabs. */}
        <div className="flex border-b border-line px-2">
          <TabButton
            icon={Bell}
            label="Alerts"
            active={tab === "alerts"}
            badge={unreadAlerts}
            onClick={() => setTab("alerts")}
          />
          <TabButton
            icon={Mail}
            label="Messages"
            active={tab === "messages"}
            badge={unreadMessages}
            onClick={() => setTab("messages")}
          />
          <TabButton
            icon={Users}
            label="Friends"
            active={tab === "friends"}
            badge={friendRequests}
            onClick={() => setTab("friends")}
          />
        </div>

        {/* Only the active tab is mounted, so arriving on Messages via a friend's
            "Message" button starts the panel in the right thread. */}
        {tab === "alerts" && <NotificationList onNavigate={onNotificationNavigate} />}
        {tab === "messages" && (
          <MessagesPanel key={compose ? compose.id : "list"} initialCompose={compose} />
        )}
        {tab === "friends" && (
          <SocialPanel
            onVisit={onVisit}
            onMessage={(id, name) => {
              setCompose({ id, name });
              setTab("messages");
            }}
            onClose={onClose}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  badge = 0,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={
        "relative flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-2.5 text-sm font-medium transition " +
        (active ? "border-brand text-accent" : "border-transparent text-muted hover:text-ink")
      }
    >
      <Icon size={16} /> {label}
      {badge > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}
