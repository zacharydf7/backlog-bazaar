import { useStore } from "../store";
import { coinSrc, DEFAULT_COIN, isCoinVariant, type CoinVariant } from "../lib/coins";
import { useViewing } from "../lib/viewContext";

// The Backlog Bazaar coin — a chunky, glossy treasure-coin mark shown wherever
// in-app coins appear (the wallet, prices, payouts…) and as the browser tab
// icon. Resolution order: an explicit `variant` (admin pickers, shop previews)
// → whose coins these are: another player's (`ownerCoin`, else a visited
// library's) wear THEIR mint, or the app default when they wear none, never
// yours; your own wear your equipped Curio Shop coin skin → the admin-chosen
// app default (app_config.default_coin) → the built-in face. `mine` marks your
// own coins shown inside someone else's library (your balance as you back
// their game).
export function CoinIcon({
  size = 16,
  variant,
  ownerCoin,
  mine = false,
  className = "",
}: {
  size?: number;
  variant?: CoinVariant;
  /** Another player's coin skin key (null = they wear none); omit for yours. */
  ownerCoin?: string | null;
  mine?: boolean;
  className?: string;
}) {
  const appDefault = useStore((s) => s.defaultCoin);
  const mySkin = useStore((s) => s.coinSkin);
  const viewing = useViewing();
  const owner = mine ? undefined : ownerCoin !== undefined ? ownerCoin : viewing.ownerCoin;
  const worn = owner === undefined ? mySkin : isCoinVariant(owner) ? owner : null;
  const v = variant ?? worn ?? appDefault ?? DEFAULT_COIN;
  return (
    <img
      src={coinSrc(v)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={"inline-block shrink-0 align-[-0.15em] " + className}
    />
  );
}
