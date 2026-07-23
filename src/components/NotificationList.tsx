import { useEffect } from "react";
import {
  Bell,
  CalendarCheck,
  Check,
  Hammer,
  Lightbulb,
  MessageCircle,
  Reply,
  RefreshCw,
  SmilePlus,
  Shield,
  ListChecks,
  UserCog,
  UserPlus,
  UserCheck,
  PartyPopper,
  Mail,
  Handshake,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import type { AppNotification } from "../types";
import { timeAgo } from "../lib/time";

const TYPE_ICON: Record<string, LucideIcon> = {
  feature_status: Hammer,
  feature_new: Lightbulb,
  feature_comment: MessageCircle,
  feature_reply: Reply,
  feature_reaction: SmilePlus,
  feature_response: Check,
  feature_changes: RefreshCw,
  admin_change: Shield,
  submission_approved: ListChecks,
  submission_rejected: ListChecks,
  role_granted: UserCog,
  role_revoked: UserCog,
  friend_request: UserPlus,
  friend_accepted: UserCheck,
  activity_cheer: PartyPopper,
  message: Mail,
  co_op_invite: Handshake,
  co_op_accepted: Handshake,
  co_op_declined: Handshake,
  co_op_dissolved: Handshake,
  co_op_half: Handshake,
  co_op_completed: Handshake,
  preorder_released: CalendarCheck,
  loan_requested: PiggyBank,
  loan_granted: PiggyBank,
  loan_declined: PiggyBank,
  loan_repaid: PiggyBank,
};

/** A fallback destination derived from a notification's type, for older
 *  notifications created before links were stored. */
export function linkForType(type: string): string | null {
  if (type === "submission_approved" || type === "submission_rejected") return "mysubmissions";
  if (type.startsWith("feature_")) return "features";
  if (type.startsWith("friend_") || type.startsWith("loan_") || type === "activity_cheer")
    return "social";
  if (type === "message") return "messages";
  return null;
}

/** The notifications list — the Alerts tab of the unified inbox. Fetches on mount,
 *  lazy-loads older rows as you scroll, and routes a row to its destination. */
export function NotificationList({ onNavigate }: { onNavigate?: (link: string) => void }) {
  const {
    notifications,
    notificationsLoadingMore,
    fetchNotifications,
    loadMoreNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useStore();

  const unread = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // Lazy-load older notifications as the list nears its bottom (the store guards
  // re-entrancy and the end of the list, so calling on every scroll tick is safe).
  function onListScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 96) void loadMoreNotifications();
  }

  function onRowClick(n: AppNotification) {
    void markNotificationRead(n.id);
    // Prefer the stored link; fall back to a destination derived from the type so
    // older notifications (created before links existed) still navigate. The handler
    // decides whether to switch tabs (social/messages) or close the inbox and route
    // to a page (features/mysubmissions).
    const link = n.link ?? linkForType(n.type);
    if (link) onNavigate?.(link);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {unread > 0 && (
        <div className="flex items-center justify-end border-b border-line px-3 py-2">
          <button
            onClick={() => markAllNotificationsRead()}
            className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-accent"
          >
            <Check size={13} /> Mark all read
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto" onScroll={onListScroll}>
        {notifications.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted">No notifications yet.</p>
        ) : (
          notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            return (
              <button
                key={n.id}
                onClick={() => onRowClick(n)}
                className={
                  "flex w-full items-start gap-2.5 border-b border-line px-3 py-2.5 text-left transition last:border-0 hover:bg-panel/60 " +
                  (n.readAt ? "" : "bg-brand/5")
                }
              >
                <span className="mt-0.5 shrink-0">
                  <Icon size={16} className="text-accent" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                    <span className="truncate text-sm font-medium text-ink">{n.title}</span>
                  </span>
                  {n.body && (
                    <span className="mt-0.5 block whitespace-pre-line text-xs text-muted">
                      {n.body}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-subtle">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            );
          })
        )}
        {notificationsLoadingMore && (
          <p className="px-3 py-2.5 text-center text-[11px] text-subtle">Loading…</p>
        )}
      </div>
    </div>
  );
}
