import { useEffect, useRef, useState } from "react";
import { Bell, Check, X, Hammer, Lightbulb, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import type { AppNotification } from "../types";
import { timeAgo } from "../lib/time";

const TYPE_ICON: Record<string, LucideIcon> = {
  feature_status: Hammer,
  feature_new: Lightbulb,
};

const iconButton =
  "rounded-xl border border-line bg-surface p-2.5 text-muted transition hover:bg-panel hover:text-ink";

export function NotificationBell({ onNavigate }: { onNavigate?: (link: string) => void }) {
  const {
    notifications,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotification,
  } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    if (!open) return;
    void fetchNotifications();
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, fetchNotifications]);

  function onRowClick(n: AppNotification) {
    void markNotificationRead(n.id);
    if (n.link) {
      onNavigate?.(n.link);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label="Notifications"
        className={iconButton + " relative"}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,90vw)] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <span className="inline-flex items-center gap-2 font-display text-base text-ink">
              <Bell size={15} className="text-accent" /> Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={() => markAllNotificationsRead()}
                className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-accent"
              >
                <Check size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">No notifications yet.</p>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Bell;
                return (
                  <div
                    key={n.id}
                    className={
                      "group flex items-start gap-2.5 border-b border-line px-3 py-2.5 last:border-0 " +
                      (n.readAt ? "" : "bg-brand/5")
                    }
                  >
                    <button
                      onClick={() => onRowClick(n)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    >
                      <span className="mt-0.5 shrink-0">
                        <Icon size={16} className="text-accent" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {!n.readAt && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                          )}
                          <span className="truncate text-sm font-medium text-ink">{n.title}</span>
                        </span>
                        {n.body && <span className="mt-0.5 block text-xs text-muted">{n.body}</span>}
                        <span className="mt-0.5 block text-[11px] text-subtle">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => dismissNotification(n.id)}
                      title="Dismiss"
                      aria-label="Dismiss"
                      className="shrink-0 rounded-md p-1 text-subtle transition hover:bg-panel hover:text-ink opacity-100 hover-device:opacity-0 hover-device:group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
