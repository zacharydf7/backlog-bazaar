import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Centered icon + title + body for an empty social surface (no friends yet,
 *  no conversations, no activity), with an optional call-to-action beneath.
 *  Shared by the Community sections and the Messages panes. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-brand/10 text-accent">
        <Icon size={22} />
      </span>
      <p className="font-display text-base text-ink">{title}</p>
      <p className="max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
