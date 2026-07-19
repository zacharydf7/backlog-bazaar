// Coin skins. The Backlog Bazaar coin comes in several faces (the art lives as
// standalone SVGs in /public/coins, shared by the favicon, the CoinIcon
// component, and /coins/preview.html). An admin picks the app-wide default
// (stored in app_config.default_coin); this module is the source of truth for
// the list of valid skins. Set up so a per-user "coin skin" picker can layer on
// later.

export type CoinVariant =
  | "mint"
  | "b"
  | "bb"
  | "chest"
  | "stall"
  | "rose-gold"
  | "obsidian"
  | "radiant"
  | "jack-o-lantern"
  | "peppermint"
  | "arcade-token"
  | "pixel"
  | "trophy";

/** The free faces — the admin's app-wide default picker draws from this list. */
export const COIN_VARIANTS: { id: CoinVariant; label: string }[] = [
  { id: "mint", label: "Minted B" },
  { id: "b", label: "Classic B" },
  { id: "bb", label: "Double B" },
  { id: "chest", label: "Treasure Chest" },
  { id: "stall", label: "Bazaar Stall" },
];

/** Curio Shop coin skins: per-user mints bought in the shop (shop_items.style
 *  holds one of these ids). Kept out of the free list above; a new skin needs
 *  its SVG in /public/coins plus an entry here (the style-registry posture). */
export const SHOP_COIN_VARIANTS: { id: CoinVariant; label: string }[] = [
  { id: "rose-gold", label: "Rose Gold Mint" },
  { id: "obsidian", label: "Obsidian Mint" },
  { id: "radiant", label: "Radiant Mint" },
  { id: "jack-o-lantern", label: "Jack-o'-Coin" },
  { id: "peppermint", label: "Peppermint Mint" },
  { id: "arcade-token", label: "Arcade Token" },
  { id: "pixel", label: "Pixel Mint" },
  { id: "trophy", label: "Trophy Mint" },
];

/** The shop skins' style keys, for the admin stock editor's dropdown. */
export const SHOP_COIN_KEYS: string[] = SHOP_COIN_VARIANTS.map((c) => c.id);

/** The fallback coin face when none is configured. The Minted B is the
 *  redesign-era default: a path-drawn slab-serif monogram (no font
 *  dependency) on a reeded-edge coin. */
export const DEFAULT_COIN: CoinVariant = "mint";

/** Narrow an unknown value (e.g. a DB column) to a known coin variant. */
export function isCoinVariant(v: unknown): v is CoinVariant {
  return (
    typeof v === "string" &&
    (COIN_VARIANTS.some((c) => c.id === v) || SHOP_COIN_VARIANTS.some((c) => c.id === v))
  );
}

/** A known variant, or the default if the value isn't recognised. */
export function coerceCoinVariant(v: unknown): CoinVariant {
  return isCoinVariant(v) ? v : DEFAULT_COIN;
}

/** Public path to a coin face's SVG. */
export function coinSrc(variant: CoinVariant): string {
  return `/coins/${variant}.svg`;
}
