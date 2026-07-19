import { useEffect, useMemo, useState } from "react";
import { Gem, Sparkles, Store } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { Avatar } from "./Avatar";
import { TitleBadge } from "./TitleBadge";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  SHOP_KIND_META,
  SHOP_TIER_META,
  availabilityLabel,
  groupShopItems,
  isAvailableNow,
  isShopItemVisible,
  shopSetProgress,
  type ShopItem,
} from "../lib/shop";
import { resolveStallStyle } from "../lib/shopCosmetics";
import { StallOrnament } from "./CosmeticOrnaments";
import { isCoinVariant } from "../lib/coins";
import type { Badge } from "../types";

/** The Curio Shop storefront: permanent cosmetics bought with coins — titles,
 *  avatar frames and stall decorations — plus seasonal window stock. Purchasing
 *  and equipping are server-validated; this page is the browsing/preview layer. */
export function ShopPage() {
  const cloud = useStore((s) => s.cloud);
  const coins = useStore((s) => s.coins);
  const shopItems = useStore((s) => s.shopItems);
  const shopSets = useStore((s) => s.shopSets);
  const shopOpen = useStore((s) => s.shopOpen);
  const purchasedIds = useStore((s) => s.shopPurchasedIds);
  const fetchShop = useStore((s) => s.fetchShop);
  const fetchBadges = useStore((s) => s.fetchBadges);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const can = useStore((s) => s.can);

  // Title items grant a badge; the public badge catalog supplies the icon &
  // prestige for a faithful chip preview before you own it.
  const [badgeById, setBadgeById] = useState<Map<string, Badge>>(new Map());

  useEffect(() => {
    if (!cloud) return;
    void fetchShop();
    void fetchBadges().then((all) => setBadgeById(new Map(all.map((b) => [b.id, b]))));
  }, [cloud, fetchShop, fetchBadges]);

  // Surprise drops stay off the shelf until their window opens — no teaser.
  const visible = useMemo(() => {
    const now = Date.now();
    return shopItems.filter((i) => isShopItemVisible(i, now));
  }, [shopItems]);
  const groups = useMemo(() => groupShopItems(visible), [visible]);
  // Collections with at least one visible member — a fully hidden pre-season
  // set never leaks through its banner.
  const collections = useMemo(
    () =>
      shopSets
        .map((set) => ({ set, progress: shopSetProgress(visible, purchasedIds, set.key) }))
        .filter((c) => c.progress.total > 0),
    [shopSets, visible, purchasedIds],
  );

  if (!cloud) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <p className="font-display text-xl text-ink">The Curio Shop lives in the cloud</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Sign in to spend your hard-earned coins on titles, avatar frames and stall decorations.
        </p>
      </div>
    );
  }

  if (!shopOpen) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <Store size={28} className="mx-auto mb-3 text-accent" />
        <p className="font-display text-xl text-ink">The Curio Shop is closed</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          The shopkeeper is rearranging the shelves. Everything you already own stays yours and
          stays equipped — check back soon for the re-opening.
        </p>
        {can("shop.manage") && (
          <p className="mx-auto mt-3 max-w-md text-xs text-subtle">
            (You can re-open it from the admin Shop tab.)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
            <Store size={22} className="text-accent" /> Curio Shop
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Cosmetic treasures for your coin surplus — yours forever once bought. Seasonal stock
            comes and goes; keep an eye on the shelf.
          </p>
        </div>
        {economyEnabled && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-sm font-medium text-ink">
            <CoinIcon size={16} /> {coins}
          </span>
        )}
      </div>

      {!economyEnabled && (
        <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
          Your coin economy is off, so the shop is browse-only — anything you already own stays
          equipped. Turn coins back on in Account settings to spend your frozen balance.
        </p>
      )}

      {collections.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {collections.map(({ set, progress }) => {
            const reward = set.badgeId ? badgeById.get(set.badgeId) : undefined;
            const done = progress.owned === progress.total;
            return (
              <section
                key={set.key}
                className="flex flex-col gap-1.5 rounded-2xl border border-[#e0a82e]/40 bg-surface p-4"
              >
                <p className="flex flex-wrap items-center justify-between gap-2 font-medium text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles size={14} className="text-accent" /> {set.name} collection
                  </span>
                  <span className={"text-xs " + (done ? "text-success" : "text-muted")}>
                    {done ? "Complete!" : `${progress.owned} / ${progress.total} collected`}
                  </span>
                </p>
                {set.description && <p className="text-xs text-muted">{set.description}</p>}
                {reward && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    Reward: <TitleBadge badge={reward} size="xs" />
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-muted">
          Setting out the wares…
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.kind} className="flex flex-col gap-3">
            <div>
              <h2 className="font-display text-lg text-ink">{SHOP_KIND_META[g.kind].label}</h2>
              <p className="text-xs text-muted">{SHOP_KIND_META[g.kind].blurb}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((item) => (
                <ShopItemCard key={item.id} item={item} badgeById={badgeById} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ShopItemCard({ item, badgeById }: { item: ShopItem; badgeById: Map<string, Badge> }) {
  const coins = useStore((s) => s.coins);
  const owned = useStore((s) => s.shopPurchasedIds.includes(item.id));
  const buyShopItem = useStore((s) => s.buyShopItem);
  const economyEnabled = useStore((s) => s.economyEnabled);
  const [confirming, setConfirming] = useState(false);
  const [buying, setBuying] = useState(false);

  const now = Date.now();
  // Browse-only while the economy is off (the server refuses buys too).
  const available = economyEnabled && isAvailableNow(item, now);
  const windowLabel = availabilityLabel(item, now);
  const affordable = coins >= item.price;

  const tierChip = SHOP_TIER_META[item.tier].chipClassName;

  return (
    <div
      className={
        "flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-sm " +
        (tierChip ? "border-[#e0a82e]/40" : "border-line")
      }
    >
      <ShopItemPreview item={item} badgeById={badgeById} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-2 font-medium text-ink">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="truncate">{item.name}</span>
            {tierChip && (
              <span
                className={
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                  tierChip
                }
              >
                <Gem size={10} /> {SHOP_TIER_META[item.tier].label}
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-sm">
            <CoinIcon size={14} /> {item.price}
          </span>
        </p>
        {item.description && <p className="mt-0.5 text-xs text-muted">{item.description}</p>}
        {windowLabel && (
          <p className="mt-1 inline-flex rounded-full bg-panel px-2 py-0.5 text-[11px] font-medium text-accent">
            {windowLabel}
          </p>
        )}
      </div>

      {owned ? (
        <OwnedActions item={item} />
      ) : (
        <button
          type="button"
          disabled={!available || !affordable || buying}
          onClick={() => setConfirming(true)}
          className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {!economyEnabled
            ? "Economy off"
            : !available
              ? "Not available"
              : affordable
                ? "Buy"
                : "Not enough coins"}
        </button>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Buy ${item.name}?`}
          body={
            <span className="inline-flex flex-wrap items-center gap-1">
              This costs <CoinIcon size={14} /> {item.price} and is yours forever.
            </span>
          }
          confirmLabel="Buy it"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            setBuying(true);
            void buyShopItem(item.id).finally(() => setBuying(false));
          }}
        />
      )}
    </div>
  );
}

/** Owned-state controls: equip/unequip for frames & stalls, set-as-title for
 *  titles (which ride the existing selected-title system). */
function OwnedActions({ item }: { item: ShopItem }) {
  const equippedFrameId = useStore((s) => s.equippedFrameId);
  const equippedStallId = useStore((s) => s.equippedStallId);
  const equippedCoinId = useStore((s) => s.equippedCoinId);
  const selectedTitleId = useStore((s) => s.selectedTitleId);
  const equipCosmetic = useStore((s) => s.equipCosmetic);
  const setSelectedTitle = useStore((s) => s.setSelectedTitle);

  const equipped =
    item.kind === "title"
      ? item.badgeId !== null && selectedTitleId === item.badgeId
      : item.kind === "frame"
        ? equippedFrameId === item.id
        : item.kind === "stall"
          ? equippedStallId === item.id
          : equippedCoinId === item.id;

  const toggle = () => {
    if (item.kind === "title") {
      void setSelectedTitle(equipped ? null : item.badgeId);
    } else {
      void equipCosmetic(item.kind, equipped ? null : item.id);
    }
  };

  const label =
    item.kind === "title"
      ? equipped
        ? "✓ Your title — remove"
        : "Set as title"
      : equipped
        ? "✓ Equipped — remove"
        : "Equip";

  // A title whose badge link is broken (shouldn't happen) gets no toggle.
  if (item.kind === "title" && !item.badgeId) {
    return (
      <span className="rounded-xl bg-panel px-3 py-2 text-center text-sm text-muted">Owned</span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        "rounded-xl px-3 py-2 text-sm font-medium transition " +
        (equipped
          ? "bg-panel text-ink hover:opacity-80"
          : "border border-line bg-surface text-ink hover:bg-panel")
      }
    >
      {label}
    </button>
  );
}

/** A faithful little preview per kind: the actual chip / your framed avatar / a
 *  miniature stall card wearing the decoration. */
function ShopItemPreview({ item, badgeById }: { item: ShopItem; badgeById: Map<string, Badge> }) {
  const avatarUrl = useStore((s) => s.avatarUrl);
  const displayName = useStore((s) => s.displayName);

  if (item.kind === "title") {
    const badge: Badge = (item.badgeId ? badgeById.get(item.badgeId) : undefined) ?? {
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      icon: "award",
      prestige: 3,
      kind: "shop",
      effect: null,
    };
    return (
      <div className="flex h-16 items-center justify-center rounded-xl bg-panel">
        <TitleBadge badge={badge} />
      </div>
    );
  }

  if (item.kind === "frame") {
    return (
      <div className="flex h-16 items-center justify-center rounded-xl bg-panel">
        <Avatar url={avatarUrl} name={displayName ?? "You"} size={44} frame={item.style} />
      </div>
    );
  }

  if (item.kind === "coin") {
    return (
      <div className="flex h-16 items-center justify-center gap-2 rounded-xl bg-panel">
        <CoinIcon size={40} variant={isCoinVariant(item.style) ? item.style : undefined} />
      </div>
    );
  }

  const stall = resolveStallStyle(item.style);
  return (
    <div
      className={
        "flex h-16 items-center justify-center gap-2 rounded-xl border bg-panel px-3 " +
        (stall ? stall.cardClassName : "border-line")
      }
    >
      <Avatar url={avatarUrl} name={displayName ?? "You"} size={28} />
      <span className="truncate text-sm font-medium text-ink">{displayName ?? "Your stall"}</span>
      {stall && <StallOrnament styleKey={item.style} />}
    </div>
  );
}
