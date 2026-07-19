import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, ShoppingBag } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { toast } from "../lib/toast";
import {
  SHOP_KIND_META,
  SHOP_TIER_META,
  isShopItemVisible,
  shopAvailability,
  sortShopItems,
  type ShopItem,
  type ShopItemInput,
  type ShopItemKind,
  type ShopItemTier,
} from "../lib/shop";
import { FRAME_STYLES, STALL_STYLES } from "../lib/shopCosmetics";
import { SHOP_COIN_KEYS } from "../lib/coins";
import { BADGE_ICON_NAMES, TITLE_EFFECTS } from "../lib/badges";

// Admin stock management for the Curio Shop (shop.manage). Items are never
// deleted — retiring stock is active=false, so purchases and equips always
// resolve. New frame/stall LOOKS need a code change (the style registry);
// this editor only composes items from the registered style keys.

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand";

const EMPTY_DRAFT: ShopItemInput = {
  id: null,
  slug: "",
  kind: "title",
  name: "",
  description: "",
  price: 100,
  style: null,
  badgeIcon: "award",
  badgePrestige: 3,
  badgeEffect: null,
  tier: "standard",
  secret: false,
  setKey: null,
  availableFrom: null,
  availableUntil: null,
  active: true,
  sort: 0,
};

function styleOptions(kind: ShopItemKind): string[] {
  if (kind === "frame") return Object.keys(FRAME_STYLES);
  if (kind === "stall") return Object.keys(STALL_STYLES);
  if (kind === "coin") return SHOP_COIN_KEYS;
  return [];
}

/** ms epoch ↔ the yyyy-mm-dd value a date input speaks (local midnight). */
function toDateInput(ts: number | null): string {
  if (ts === null) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInput(v: string): number | null {
  if (!v) return null;
  const t = Date.parse(v + "T00:00:00");
  return Number.isFinite(t) ? t : null;
}

export function ShopManager() {
  const shopItems = useStore((s) => s.shopItems);
  const fetchShop = useStore((s) => s.fetchShop);
  const adminSaveShopItem = useStore((s) => s.adminSaveShopItem);

  const [draft, setDraft] = useState<ShopItemInput | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchShop();
  }, [fetchShop]);

  const items = useMemo(() => sortShopItems(shopItems), [shopItems]);

  const edit = (item: ShopItem) =>
    setDraft({
      id: item.id,
      slug: item.slug,
      kind: item.kind,
      name: item.name,
      description: item.description ?? "",
      price: item.price,
      style: item.style,
      badgeIcon: null, // blank = keep the badge's current icon
      badgePrestige: null, // blank = keep the badge's current prestige
      badgeEffect: null, // blank = keep the badge's current effect
      tier: item.tier,
      secret: item.secret,
      setKey: item.setKey,
      availableFrom: item.availableFrom,
      availableUntil: item.availableUntil,
      active: item.active,
      sort: item.sort,
    });

  const save = async () => {
    if (!draft || saving) return;
    if (!draft.name.trim() || (!draft.id && !draft.slug.trim())) {
      toast("A slug and a name are required.");
      return;
    }
    if (draft.kind !== "title" && !draft.style) {
      toast("Pick a visual style for this item.");
      return;
    }
    setSaving(true);
    const id = await adminSaveShopItem(draft);
    setSaving(false);
    if (id) {
      toast(draft.id ? "Item updated." : "Item added to the shelf.", ShoppingBag);
      setDraft(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <ShoppingBag size={16} className="text-accent" /> Curio Shop stock
          </h3>
          <p className="text-xs text-muted">
            Prices, seasonal windows and shelf status. Items are never deleted — retire stock by
            marking it inactive. New frame/stall looks require a code change first.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
        >
          <Plus size={15} /> New item
        </button>
      </div>

      {draft && (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand/40 bg-surface p-4">
          <p className="text-sm font-medium text-ink">
            {draft.id ? `Editing “${draft.name}”` : "New item"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!draft.id && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Kind
                <select
                  className={fieldClass}
                  value={draft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as ShopItemKind;
                    setDraft({ ...draft, kind, style: styleOptions(kind)[0] ?? null });
                  }}
                >
                  <option value="title">Title</option>
                  <option value="frame">Avatar frame</option>
                  <option value="stall">Stall decoration</option>
                  <option value="coin">Coin skin</option>
                </select>
              </label>
            )}
            {!draft.id && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Slug (permanent)
                <input
                  className={fieldClass}
                  value={draft.slug}
                  onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                  placeholder="frame-midnight"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted">
              Name
              <input
                className={fieldClass}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Price (coins)
              <input
                type="number"
                min={0}
                className={fieldClass}
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            {draft.kind === "title" ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Badge icon
                  <select
                    className={fieldClass}
                    value={draft.badgeIcon ?? ""}
                    onChange={(e) => setDraft({ ...draft, badgeIcon: e.target.value || null })}
                  >
                    {draft.id && <option value="">(keep current)</option>}
                    {BADGE_ICON_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Badge prestige
                  <input
                    type="number"
                    min={0}
                    className={fieldClass}
                    value={draft.badgePrestige ?? ""}
                    placeholder={draft.id ? "(keep current)" : undefined}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        badgePrestige: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Chip effect (animated)
                  <select
                    className={fieldClass}
                    value={draft.badgeEffect ?? ""}
                    onChange={(e) => setDraft({ ...draft, badgeEffect: e.target.value || null })}
                  >
                    <option value="">{draft.id ? "(keep current)" : "(none)"}</option>
                    {Object.entries(TITLE_EFFECTS).map(([k, fx]) => (
                      <option key={k} value={k}>
                        {fx.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Visual style
                <select
                  className={fieldClass}
                  value={draft.style ?? ""}
                  onChange={(e) => setDraft({ ...draft, style: e.target.value || null })}
                >
                  {styleOptions(draft.kind).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted">
              Tier
              <select
                className={fieldClass}
                value={draft.tier}
                onChange={(e) => setDraft({ ...draft, tier: e.target.value as ShopItemTier })}
              >
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              On sale from (blank = always)
              <input
                type="date"
                className={fieldClass}
                value={toDateInput(draft.availableFrom)}
                onChange={(e) => setDraft({ ...draft, availableFrom: fromDateInput(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Off the shelf after (exclusive)
              <input
                type="date"
                className={fieldClass}
                value={toDateInput(draft.availableUntil)}
                onChange={(e) => setDraft({ ...draft, availableUntil: fromDateInput(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Sort
              <input
                type="number"
                className={fieldClass}
                value={draft.sort}
                onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Description
            <textarea
              rows={2}
              className={fieldClass}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <label className="inline-flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                On the shelf (uncheck to retire)
              </label>
              <label
                className="inline-flex items-center gap-2 text-sm text-ink"
                title="Needs an on-sale date — without one the item shows normally."
              >
                <input
                  type="checkbox"
                  checked={draft.secret}
                  onChange={(e) => setDraft({ ...draft, secret: e.target.checked })}
                />
                Surprise drop — hidden until the on-sale date
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            Loading the stock list…
          </p>
        )}
        {items.map((item) => {
          const now = Date.now();
          const availability = shopAvailability(item, now);
          const tierChip = SHOP_TIER_META[item.tier].chipClassName;
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-panel px-3 py-2 text-sm"
            >
              <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-subtle">
                {SHOP_KIND_META[item.kind].label}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">
                {item.name} <span className="text-xs text-subtle">({item.slug})</span>
              </span>
              {tierChip && (
                <span
                  className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + tierChip}
                >
                  {SHOP_TIER_META[item.tier].label}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <CoinIcon size={13} /> {item.price}
              </span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  (availability === "available"
                    ? "bg-success/15 text-success"
                    : "bg-panel text-subtle border border-line")
                }
              >
                {availability}
              </span>
              {!isShopItemVisible(item, now) && (
                <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                  hidden
                </span>
              )}
              <button
                type="button"
                onClick={() => edit(item)}
                title="Edit"
                className="rounded-lg border border-line bg-surface p-1.5 text-muted hover:text-ink"
              >
                <Pencil size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
