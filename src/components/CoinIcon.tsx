import { useStore } from "../store";
import { coinSrc, DEFAULT_COIN, type CoinVariant } from "../lib/coins";

// The Backlog Bazaar coin — a chunky, glossy treasure-coin mark shown wherever
// in-app coins appear (the wallet, prices, payouts…) and as the browser tab
// icon. With no `variant` it follows the admin-chosen app default (app_config
// .default_coin, in the store); pass an explicit `variant` to force a face
// (e.g. the admin picker previewing each option).
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
  const v = variant ?? appDefault ?? DEFAULT_COIN;
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
