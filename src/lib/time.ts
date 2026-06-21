/** A compact "time since" label for notification rows: "just now", "5m", "3h",
 *  "2d", then an absolute date for anything older than a week. */
export function timeAgo(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < 45_000) return "just now";

  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
