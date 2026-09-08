import type { Badge } from "../types";
import type { ShopItem } from "../lib/shop";
import type { CosmeticLook } from "../lib/cosmeticsPreview";
import { resolveStallStyle } from "../lib/shopCosmetics";
import { type CoinVariant, isCoinVariant } from "../lib/coins";
import { Avatar } from "./Avatar";
import { CoinIcon } from "./CoinIcon";
import { TitleBadge } from "./TitleBadge";
import { StallOrnament } from "./CosmeticOrnaments";

export interface PreviewIdentity {
  name: string;
  avatar: string | null;
  defaultCoin: CoinVariant;
}

export function CosmeticThumbnail({
  item,
  badges,
  identity,
}: {
  item: ShopItem;
  badges: Badge[];
  identity: PreviewIdentity;
}) {
  const badge = badges.find((candidate) => candidate.id === item.badgeId);
  const stall = item.kind === "stall" ? resolveStallStyle(item.style) : null;
  return (
    <div
      className={`relative flex h-24 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-panel px-3 ${stall?.cardClassName ?? ""}`}
    >
      {stall && <StallOrnament styleKey={item.style} />}
      <div className="relative z-10 flex min-w-0 max-w-full items-center gap-2">
        {item.kind === "title" ? (
          badge ? (
            <TitleBadge badge={badge} />
          ) : (
            <span className="text-xs text-muted">
              Title preview unavailable
            </span>
          )
        ) : item.kind === "coin" ? (
          <CoinIcon
            size={48}
            variant={
              isCoinVariant(item.style) ? item.style : identity.defaultCoin
            }
          />
        ) : (
          <Avatar
            name={identity.name}
            url={identity.avatar}
            size={42}
            frame={item.kind === "frame" ? item.style : null}
          />
        )}
        {item.kind === "stall" && (
          <span className="truncate text-sm font-medium text-ink">
            {identity.name}&apos;s stall
          </span>
        )}
      </div>
    </div>
  );
}

export function CosmeticLookPreview({
  look,
  items,
  badges,
  identity,
  compact = false,
}: {
  look: CosmeticLook;
  items: ShopItem[];
  badges: Badge[];
  identity: PreviewIdentity;
  compact?: boolean;
}) {
  const style = (id: string | null) =>
    items.find((item) => item.id === id)?.style ?? null;
  const stallKey = style(look.stall);
  const stall = resolveStallStyle(stallKey);
  const title = badges.find((badge) => badge.id === look.title);
  const coin = style(look.coin);
  return (
    <div
      data-testid={compact ? "compact-look-preview" : "look-preview"}
      className={`relative overflow-hidden rounded-2xl border border-line bg-panel ${compact ? "p-4" : "px-5 py-8"} ${stall?.cardClassName ?? ""}`}
    >
      {stall && (
        <StallOrnament styleKey={stallKey} scale={compact ? "card" : "hero"} />
      )}
      <div
        className={`relative z-10 flex min-w-0 gap-3 ${compact ? "items-center" : "flex-col items-center text-center"}`}
      >
        <Avatar
          name={identity.name}
          url={identity.avatar}
          size={compact ? 36 : 72}
          frame={style(look.frame)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="break-words font-display text-xl text-ink">
            {identity.name}
          </p>
          {title && (
            <div className="min-w-0">
              <TitleBadge badge={title} />
            </div>
          )}
          <span
            className={`inline-flex items-center gap-1.5 text-xs text-muted ${compact ? "" : "justify-center"}`}
          >
            <CoinIcon
              size={18}
              variant={isCoinVariant(coin) ? coin : identity.defaultCoin}
            />{" "}
            Your Bazaar
          </span>
        </div>
      </div>
    </div>
  );
}
