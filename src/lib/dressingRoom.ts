// My Cosmetics as a dressing room (2026-10-17): tapping something you own
// wears it right away (no try-on/Apply step), with Undo. These helpers decide
// what an outfit becomes when a piece goes on, which equipped pieces you no
// longer hold, and what each slot tab lists. Pure, so they're unit-tested
// without React/Supabase; the save itself is wardrobeApi.apply.

import {
  COSMETIC_SLOTS,
  itemSelection,
  wardrobeItems,
  type CosmeticLook,
  type CosmeticsSession,
} from "./cosmeticsPreview";
import type { ShopItem, ShopItemKind } from "./shop";

/** Is this equipped piece still yours? Default (null) always is. */
function holds(session: CosmeticsSession, slot: ShopItemKind, id: string | null): boolean {
  if (id === null) return true;
  if (slot === "title") return session.heldBadgeIds.includes(id);
  return session.ownedIds.includes(id) && session.items.some((i) => i.id === id && i.kind === slot);
}

/** Slots whose equipped piece you no longer hold (a retired or revoked
 *  piece). The server refuses any outfit that includes one. */
export function unheldSlots(session: CosmeticsSession, look: CosmeticLook): ShopItemKind[] {
  return COSMETIC_SLOTS.filter((slot) => !holds(session, slot, look[slot]));
}

/** The outfit after changes go on: the changed slots take their new pieces,
 *  and any other slot holding a piece you no longer own goes back to default
 *  (the server would refuse the outfit otherwise). `cleared` names those, so
 *  the player is told. */
export function wearOutfit(
  session: CosmeticsSession,
  current: CosmeticLook,
  changes: Partial<CosmeticLook>,
): { next: CosmeticLook; cleared: ShopItemKind[] } {
  const next = { ...current, ...changes };
  const cleared = COSMETIC_SLOTS.filter((slot) => !holds(session, slot, next[slot]));
  for (const slot of cleared) next[slot] = null;
  return { next, cleared };
}

/** The name of the piece in a slot, "None" for default, or a placeholder for
 *  a piece that's gone. */
export function pieceName(session: CosmeticsSession, slot: ShopItemKind, id: string | null): string {
  if (id === null) return "None";
  const name =
    slot === "title"
      ? session.badges.find((b) => b.id === id)?.name
      : session.items.find((i) => i.id === id)?.name;
  return name ?? "Unavailable piece";
}

/** Everything you own for one slot, filtered by search and collection. */
export function slotItems(
  session: CosmeticsSession,
  slot: ShopItemKind,
  filters: { query?: string; collection?: string } = {},
): ShopItem[] {
  const q = (filters.query ?? "").trim().toLowerCase();
  return wardrobeItems(session).filter(
    (item) =>
      item.kind === slot &&
      (!filters.collection || item.setKey === filters.collection) &&
      (!q || `${item.name} ${item.description ?? ""}`.toLowerCase().includes(q)),
  );
}

/** How many pieces you own per slot (for the tab labels). */
export function slotCounts(session: CosmeticsSession): Record<ShopItemKind, number> {
  const counts = { title: 0, frame: 0, stall: 0, coin: 0 } as Record<ShopItemKind, number>;
  for (const item of wardrobeItems(session)) counts[item.kind] += 1;
  return counts;
}

/** Is this piece the one being worn in its slot? */
export function isWorn(look: CosmeticLook, item: ShopItem): boolean {
  return look[item.kind] === itemSelection(item);
}

const SLOT_NOUN: Record<ShopItemKind, string> = { title: "title", frame: "frame", stall: "stall", coin: "coin" };

/** The toast after a change: what went on, plus any slot left empty because
 *  its piece is no longer yours: the one you had on, or (`from: "look"`) the
 *  one a saved look asked for. */
export function wearMessage(wearing: string, cleared: ShopItemKind[], from: "worn" | "look" = "worn"): string {
  if (cleared.length === 0) return wearing;
  const list = cleared.map((s) => SLOT_NOUN[s]).join(" and ");
  return from === "look"
    ? `${wearing}. Its ${list} is no longer yours, so that slot is empty.`
    : `${wearing}. Your old ${list} is no longer yours, so it came off.`;
}
