import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { useHistoryDismiss } from "../lib/useHistoryDismiss";
import { NotificationList } from "./NotificationList";

/** The notifications drawer: a right slide-out for alerts ONLY, toggled from
 *  the bell. The social surfaces that used to share this drawer — messages,
 *  friends, the activity feed — live on the routed Community page now, so the
 *  bell means exactly one thing: something happened that you haven't seen. */
export function NotificationsDrawer({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  /** Route a clicked notification's link (see App's openNotificationLink). */
  onNavigate: (link: string) => void;
}) {
  const markAllNotificationsRead = useStore((s) => s.markAllNotificationsRead);

  useScrollLock(true);
  useHistoryDismiss(true, onClose);

  // Clear the bell badge once the drawer closes — you've seen the alerts.
  // Mirrors the old inbox's leave-the-Alerts-tab behavior.
  useEffect(() => {
    return () => {
      void markAllNotificationsRead();
    };
  }, [markAllNotificationsRead]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        role="dialog"
        aria-label="Notifications"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="font-display text-lg text-ink">Notifications</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-subtle transition hover:bg-panel hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <NotificationList onNavigate={onNavigate} />
      </div>
    </div>,
    document.body,
  );
}
