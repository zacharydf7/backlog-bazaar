import { useStore } from "../store";
import { coinSrc, DEFAULT_COIN, type CoinVariant } from "../lib/coins";

// The Backlog Bazaar coin — a chunky, glossy treasure-coin mark shown wherever
// in-app coins appear (the wallet, prices, payouts…) and as the browser tab
// icon. Resolution order: an explicit `variant` (admin pickers, shop previews,
// another player's mint on their profile) → your equipped Curio Shop coin skin
// (your mint colours every coin YOU see) → the admin-chosen app default
// (app_config.default_coin) → the built-in face.
export function CoinIcon({
  size = 16,
  variant,
  className = "",
}: {
  size?: number;
  variant?: CoinVariant;
  className?: string;
}) {
  const appDefault = useStore((s) => s.defaultCoin);
  const mySkin = useStore((s) => s.coinSkin);
  const v = variant ?? mySkin ?? appDefault ?? DEFAULT_COIN;
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
