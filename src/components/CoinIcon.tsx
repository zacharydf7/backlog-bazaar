// The Backlog Bazaar coin — a chunky, glossy treasure-coin mark shown wherever
// in-app coins appear (the wallet, prices, payouts…) and as the browser tab
// icon. The art lives as standalone SVGs in /public/coins so the favicon,
// this component, and the comparison page at /coins/preview.html all share one
// source. Several faces exist so a "coin skin" picker can be offered later.

/** Available coin faces. `file` is the SVG under /public/coins. */
export type CoinVariant = "b" | "bb" | "chest" | "stall";

export const COIN_VARIANTS: { id: CoinVariant; label: string }[] = [
  { id: "b", label: "Classic B" },
  { id: "bb", label: "Double B" },
  { id: "chest", label: "Treasure Chest" },
  { id: "stall", label: "Bazaar Stall" },
];

/** The coin face used throughout the app until per-user skins land. */
export const DEFAULT_COIN: CoinVariant = "bb";

export function CoinIcon({
  size = 16,
  variant = DEFAULT_COIN,
  className = "",
}: {
  size?: number;
  variant?: CoinVariant;
  className?: string;
}) {
  return (
    <img
      src={`/coins/${variant}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={"inline-block shrink-0 align-[-0.15em] " + className}
    />
  );
}
