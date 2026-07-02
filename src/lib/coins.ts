// Coin skins. The Backlog Bazaar coin comes in several faces (the art lives as
// standalone SVGs in /public/coins, shared by the favicon, the CoinIcon
// component, and /coins/preview.html). An admin picks the app-wide default
// (stored in app_config.default_coin); this module is the source of truth for
// the list of valid skins. Set up so a per-user "coin skin" picker can layer on
// later.

export type CoinVariant = "mint" | "b" | "bb" | "chest" | "stall";

export const COIN_VARIANTS: { id: CoinVariant; label: string }[] = [
  { id: "mint", label: "Minted B" },
  { id: "b", label: "Classic B" },
  { id: "bb", label: "Double B" },
  { id: "chest", label: "Treasure Chest" },
  { id: "stall", label: "Bazaar Stall" },
];

/** The fallback coin face when none is configured. The Minted B is the
 *  redesign-era default: a path-drawn slab-serif monogram (no font
 *  dependency) on a reeded-edge coin. */
export const DEFAULT_COIN: CoinVariant = "mint";

/** Narrow an unknown value (e.g. a DB column) to a known coin variant. */
export function isCoinVariant(v: unknown): v is CoinVariant {
  return typeof v === "string" && COIN_VARIANTS.some((c) => c.id === v);
}

/** A known variant, or the default if the value isn't recognised. */
export function coerceCoinVariant(v: unknown): CoinVariant {
  return isCoinVariant(v) ? v : DEFAULT_COIN;
}

/** Public path to a coin face's SVG. */
export function coinSrc(variant: CoinVariant): string {
  return `/coins/${variant}.svg`;
}
