export interface CosmeticEvent {
  key: string;
  name: string;
  item_id: string;
  starts_at: string;
  ends_at: string;
  afterward_price: number;
  enabled: boolean;
  activated_at: string | null;
}

export function eventWindowLabel(event: CosmeticEvent): string {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
  return `${format(event.starts_at)} until ${format(event.ends_at)} (end exclusive)`;
}

export function eventPhase(
  event: CosmeticEvent,
  now = Date.now(),
): "upcoming" | "earning" | "ended" {
  return now < Date.parse(event.starts_at)
    ? "upcoming"
    : now < Date.parse(event.ends_at)
      ? "earning"
      : "ended";
}
