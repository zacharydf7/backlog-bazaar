export type CosmeticOwnershipSource = "purchase" | "achievement" | "event";

/** Real acquisition sources; preview sessions without receipts retain Owned. */
export function cosmeticOwnershipLabel(source: CosmeticOwnershipSource | undefined, active: boolean): string {
  const label = source === "achievement" ? "Earned · achievement"
    : source === "event" ? "Earned · event"
    : source === "purchase" ? "Purchased" : "Owned";
  return active ? label : `${label} · off sale`;
}
