import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  Hammer,
  Lightbulb,
  MessageCircle,
  Reply,
  SmilePlus,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import type { AppNotification } from "../types";
import { timeAgo } from "../lib/time";
import { useScrollLock } from "../lib/useScrollLock";

const TYPE_ICON: Record<string, LucideIcon> = {
  feature_status: Hammer,
  feature_new: Lightbulb,
  feature_comment: MessageCircle,
  feature_reply: Reply,
  feature_reaction: SmilePlus,
  feature_response: Check,
};

const iconButton =
  "rounded-xl border border-line bg-surface p-2.5 text-muted transition hover:bg-panel hover:text-ink";

export function NotificationBell({ onNavigate }: { onNavigate?: (link: string) => void }) {
  const { notifications, fetchNotifications, markNotificationRead, markAllNotificationsRead } =
    useStore();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 352,
  });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const unread = notifications.filter((n) => !n.readAt).length;
  // Show only the most recent handful so the panel never scrolls forever.
  const MAX_SHOWN = 10;
  const recent = notifications.slice(0, MAX_SHOWN);
  const hiddenCount = notifications.length - recent.length;

  useScrollLock(open, { mobileOnly: true });

  // The panel is `position: fixed`, anchored under the bell and clamped to the
  // viewport — so it's always fully on-screen no matter where the bell wraps to
  // on a narrow header.
  useEffect(() => {
    if (!open) return;
    void fetchNotifications();
    function place() {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      // Use the document's client width so the scrollbar gutter doesn't push the
      // panel off the right edge.
      const vw = document.documentElement.clientWidth;
      const margin = 12;
      const width = Math.min(352, vw - margin * 2);
      const left = Math.max(margin, Math.min(b.right - width, vw - width - margin));
      setPos({ top: b.bottom + 8, left, width });
    }
    place();
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
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
        ref={btnRef}
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
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        >
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
              recent.map((n) => {
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
                );
              })
            )}
            {hiddenCount > 0 && (
              <p className="px-3 py-2.5 text-center text-[11px] text-subtle">
                Showing your {MAX_SHOWN} most recent · {hiddenCount} older hidden
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
