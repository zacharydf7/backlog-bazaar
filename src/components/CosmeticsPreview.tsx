import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  Package,
  Palette,
  Plus,
  Search,
  Shield,
  ShoppingBag,
} from "lucide-react";
import { useStore } from "../store";
import { jsonToBadges, supabase } from "../lib/supabase";
import { DEFAULT_COIN } from "../lib/coins";
import {
  coerceShopItems,
  coerceShopSets,
  SHOP_KIND_META,
  availabilityLabel,
  isAvailableNow,
  shopAvailability,
  shopSetProgress,
  sortShopItems,
  type ShopItem,
  type ShopItemKind,
  type ShopSet,
} from "../lib/shop";
import {
  COSMETIC_SLOTS,
  SLOT_LABELS,
  customerShelf,
  itemSelection,
  lookIsOwned,
  ownsCosmetic,
  previewPurchase,
  wardrobeItems,
  type CosmeticLook,
  type CosmeticsSession,
} from "../lib/cosmeticsPreview";
import {
  CosmeticLookPreview,
  CosmeticThumbnail,
  type PreviewIdentity,
} from "./CosmeticPreviewCard";
import {
  CollectionDraftEditor,
  CosmeticsDraftEditor,
  previewButton,
  previewInput,
  previewPrimary,
} from "./CosmeticsDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { TitleBadge } from "./TitleBadge";

/** The permission gate mounts before any catalog reads, and resets on account changes.
 * No write RPCs or persistent browser storage are used by this review surface. */
export function CosmeticsPreview({ onClose }: { onClose: () => void }) {
  const allowed = useStore((state) => state.can("shop.manage"));
  const userId = useStore((state) => state.userId);
  if (!allowed)
    return (
      <p className="text-sm text-muted">
        Shop management permission is required.
      </p>
    );
  return <PreviewLoader key={userId ?? "local"} onClose={onClose} />;
}

function PreviewLoader({ onClose }: { onClose: () => void }) {
  const [initial, setInitial] = useState<CosmeticsSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [identity] = useState<PreviewIdentity>(() => {
    const state = useStore.getState();
    return {
      name: state.displayName || "Your stall",
      avatar: state.avatarUrl,
      defaultCoin: state.defaultCoin ?? DEFAULT_COIN,
    };
  });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      const state = useStore.getState();
      const snapshot: CosmeticsSession = {
        items: state.shopItems,
        sets: state.shopSets,
        badges: state.myBadges,
        ownedIds: state.shopPurchasedIds,
        heldBadgeIds: state.myBadges.map((badge) => badge.id),
        balance: state.coins,
        look: {
          title: state.selectedTitleId,
          frame: state.equippedFrameId,
          stall: state.equippedStallId,
          coin: state.equippedCoinId,
        },
      };
      try {
        if (state.cloud) {
          if (!supabase || !state.userId)
            throw new Error("Sign in again to load the preview.");
          const results = await Promise.all([
            supabase.from("shop_items").select("*").order("sort"),
            supabase.from("shop_sets").select("*"),
            supabase.from("badges").select("*"),
            supabase
              .from("shop_purchases")
              .select("item_id")
              .eq("user_id", state.userId),
            supabase
              .from("user_badges")
              .select("badge_id")
              .eq("user_id", state.userId)
              .is("revoked_at", null),
          ]);
          for (const result of results)
            if (result.error) throw new Error(result.error.message);
          snapshot.items = coerceShopItems(results[0].data);
          snapshot.sets = coerceShopSets(results[1].data);
          snapshot.badges = jsonToBadges(results[2].data);
          snapshot.ownedIds = (results[3].data ?? []).map((row) => row.item_id);
          snapshot.heldBadgeIds = (results[4].data ?? []).map(
            (row) => row.badge_id,
          );
        }
        if (!cancelled) setInitial(snapshot);
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load the cosmetics preview.",
          );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  if (error)
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
        <div className="flex gap-2">
          <button
            className={previewButton}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry preview
          </button>
          <button className={previewButton} onClick={onClose}>
            Back to stock management
          </button>
        </div>
      </div>
    );
  if (!initial)
    return (
      <p role="status" className="py-12 text-center text-sm text-muted">
        Unpacking the cosmetics preview…
      </p>
    );
  return (
    <PreviewWorkspace initial={initial} identity={identity} onClose={onClose} />
  );
}

type PreviewTab = "wardrobe" | "shop" | "catalog" | "collections";
const TABS = [
  { key: "wardrobe" as const, label: "My Cosmetics", icon: Palette },
  { key: "shop" as const, label: "Shop preview", icon: ShoppingBag },
  { key: "catalog" as const, label: "Catalog drafts", icon: Package },
  { key: "collections" as const, label: "Collections", icon: Copy },
];

function PreviewWorkspace({
  initial,
  identity,
  onClose,
}: {
  initial: CosmeticsSession;
  identity: PreviewIdentity;
  onClose: () => void;
}) {
  const [session, setSession] = useState(initial);
  const [look, setLook] = useState<CosmeticLook>(initial.look);
  const [tab, setTab] = useState<PreviewTab>("wardrobe");
  const [kind, setKind] = useState<ShopItemKind | "all">("all");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("");
  const [status, setStatus] = useState("all");
  const [now, setNow] = useState(Date.now);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [editingSet, setEditingSet] = useState<ShopSet | null>(null);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState("");
  // Availability is refreshed even if the preview stays open through a launch.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const navigate = (next: PreviewTab) => {
    setTab(next);
    setKind("all");
    setQuery("");
    setCollection("");
    setStatus("all");
    setEditing(null);
    setEditingSet(null);
  };
  const wardrobe = wardrobeItems(session);
  const source =
    tab === "wardrobe"
      ? wardrobe
      : tab === "shop"
        ? customerShelf(session.items, now)
        : session.items;
  const filtered = sortShopItems(
    source.filter(
      (item) =>
        (kind === "all" || item.kind === kind) &&
        (!collection || item.setKey === collection) &&
        (status === "all" || shopAvailability(item, now) === status) &&
        `${item.name} ${item.description ?? ""} ${item.slug}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    ),
  );
  const changed = COSMETIC_SLOTS.some(
    (slot) => look[slot] !== session.look[slot],
  );
  const wearable = lookIsOwned(session, look);
  const choose = (item: ShopItem) => {
    setLook((current) => ({ ...current, [item.kind]: itemSelection(item) }));
    if (tab === "catalog") navigate("shop");
    setNotice(`Trying on ${item.name}.`);
  };
  const emptyItem = (): ShopItem => ({
    id: `preview:${crypto.randomUUID()}`,
    slug: "",
    name: "",
    description: "",
    kind: "frame",
    price: 100,
    style: "bronze-ring",
    badgeId: null,
    tier: "standard",
    secret: false,
    setKey: null,
    availableFrom: null,
    availableUntil: null,
    active: false,
    sort: 0,
  });

  return (
    <section
      aria-label="Cosmetics admin preview"
      className="flex min-w-0 flex-col gap-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <Shield size={14} /> Admin preview
          </p>
          <h1 className="mt-1 font-display text-2xl text-ink">
            Make the Bazaar your own
          </h1>
          <p className="mt-2 text-sm text-muted">
            Try the new wardrobe, shop, and catalog tools. Purchases, outfits,
            and drafts stay in this session; leaving or refreshing discards
            them. Your public profile and the live shop stay as they are.
          </p>
        </div>
        <button className={previewButton} onClick={() => setLeaving(true)}>
          Exit preview
        </button>
      </div>

      <nav
        aria-label="Cosmetics preview sections"
        className="flex flex-wrap gap-2"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            className={tab === key ? previewPrimary : previewButton}
            onClick={() => navigate(key)}
          >
            <span className="inline-flex items-center gap-2">
              <Icon size={15} />
              {label}
            </span>
          </button>
        ))}
      </nav>
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-xs text-accent"
      >
        {notice || "Preview ready. Nothing here is published."}
      </p>

      {editing ? (
        <CosmeticsDraftEditor
          key={editing.id}
          initial={editing}
          items={session.items}
          sets={session.sets}
          badges={session.badges}
          identity={identity}
          onCancel={() => setEditing(null)}
          onSave={(item, badge) => {
            setSession((current) => ({
              ...current,
              items: [
                ...current.items.filter(
                  (candidate) => candidate.id !== item.id,
                ),
                item,
              ],
              badges: badge
                ? [
                    ...current.badges.filter(
                      (candidate) => candidate.id !== badge.id,
                    ),
                    badge,
                  ]
                : current.badges,
            }));
            setEditing(null);
            setNotice(`${item.name} saved to this preview only.`);
          }}
        />
      ) : editingSet ? (
        <CollectionDraftEditor
          key={editingSet.key}
          initial={editingSet}
          sets={session.sets}
          items={session.items}
          badges={session.badges}
          onCancel={() => setEditingSet(null)}
          onSave={(set, members) => {
            setSession((current) => ({
              ...current,
              sets: [
                ...current.sets.filter(
                  (candidate) => candidate.key !== set.key,
                ),
                set,
              ],
              items: current.items.map((item) => ({
                ...item,
                setKey: members.includes(item.id)
                  ? set.key
                  : item.setKey === set.key
                    ? null
                    : item.setKey,
              })),
            }));
            setEditingSet(null);
            setNotice(`${set.name} saved to this preview only.`);
          }}
        />
      ) : (
        <>
          {(tab === "wardrobe" || tab === "shop") && (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <CosmeticLookPreview
                  look={look}
                  items={session.items}
                  badges={session.badges}
                  identity={identity}
                />
                <p className="mt-2 text-center text-xs text-muted">
                  Profile preview · only visible here
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-display text-lg text-ink">Your look</h2>
                <div className="grid grid-cols-2 gap-2">
                  {COSMETIC_SLOTS.map((slot) => {
                    const name =
                      slot === "title"
                        ? session.badges.find(
                            (badge) => badge.id === look.title,
                          )?.name
                        : session.items.find((item) => item.id === look[slot])
                            ?.name;
                    return (
                      <div
                        key={slot}
                        className="min-w-0 rounded-xl border border-line p-2"
                      >
                        <button
                          className="w-full min-w-0 text-left"
                          onClick={() => {
                            setTab("wardrobe");
                            setKind(slot);
                            setCollection("");
                            setQuery("");
                          }}
                        >
                          <span className="block text-xs text-muted">
                            {SLOT_LABELS[slot]}
                          </span>
                          <span className="block truncate py-1 text-sm font-medium text-ink">
                            {name ?? "Default"}
                          </span>
                        </button>
                        <button
                          aria-label={`Use default ${slot}`}
                          disabled={look[slot] === null}
                          className="min-h-9 text-xs text-accent disabled:text-subtle"
                          onClick={() => setLook({ ...look, [slot]: null })}
                        >
                          Use default
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={previewPrimary}
                    disabled={!changed || !wearable}
                    onClick={() => {
                      setSession({ ...session, look: { ...look } });
                      setNotice(
                        "Look applied in this preview. Your public profile is unchanged.",
                      );
                    }}
                  >
                    Apply preview look
                  </button>
                  <button
                    className={previewButton}
                    disabled={!changed}
                    onClick={() => {
                      setLook({ ...session.look });
                      setNotice("Returned to your applied preview look.");
                    }}
                  >
                    Undo try-on
                  </button>
                </div>
                {!wearable && (
                  <p className="text-xs text-muted">
                    This look includes an unowned piece. Use a preview purchase
                    or the full test inventory below to try applying it.
                  </p>
                )}
              </div>
            </div>
          )}

          {(tab === "wardrobe" || tab === "shop") && changed && (
            <div className="sticky top-2 z-20 flex min-w-0 flex-col gap-2 rounded-2xl border border-brand/40 bg-surface p-2 shadow-lg sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <CosmeticLookPreview
                  compact
                  look={look}
                  items={session.items}
                  badges={session.badges}
                  identity={identity}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={previewPrimary}
                  disabled={!wearable}
                  onClick={() => {
                    setSession({ ...session, look: { ...look } });
                    setNotice(
                      "Look applied in this preview. Your public profile is unchanged.",
                    );
                  }}
                >
                  Apply this look
                </button>
                <button
                  className={previewButton}
                  onClick={() => setLook({ ...session.look })}
                >
                  Undo
                </button>
              </div>
            </div>
          )}
          {tab === "collections" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl text-ink">
                    Collections that belong together
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Group pieces, choose a reward, and inspect the full
                    requirement—including hidden stock.
                  </p>
                </div>
                <button
                  className={previewPrimary}
                  onClick={() =>
                    setEditingSet({
                      key: "",
                      name: "",
                      description: "",
                      badgeId: null,
                    })
                  }
                >
                  New collection
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {session.sets.map((set) => {
                  const members = session.items.filter(
                    (item) => item.setKey === set.key,
                  );
                  const progress = shopSetProgress(
                    session.items,
                    session.ownedIds,
                    set.key,
                  );
                  const reward = session.badges.find(
                    (badge) => badge.id === set.badgeId,
                  );
                  return (
                    <article
                      key={set.key}
                      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
                    >
                      <h3 className="break-words font-display text-lg text-ink">
                        {set.name}
                      </h3>
                      <p className="break-words text-sm text-muted">
                        {set.description}
                      </p>
                      <p className="text-xs text-muted">
                        {members.length} pieces · {progress.owned}/
                        {progress.total} active pieces owned in preview
                      </p>
                      {reward && (
                        <div className="min-w-0 text-xs text-muted">
                          Reward: <TitleBadge badge={reward} />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={previewButton}
                          onClick={() => {
                            navigate("catalog");
                            setCollection(set.key);
                          }}
                        >
                          View pieces
                        </button>
                        <button
                          className={previewButton}
                          onClick={() => setEditingSet(set)}
                        >
                          Edit collection
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {session.sets.length === 0 && (
                <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
                  Create a collection to bring matching pieces together.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl text-ink">
                    {tab === "wardrobe"
                      ? "Your collection"
                      : tab === "shop"
                        ? "Find your next favorite"
                        : "Visual catalog"}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {tab === "wardrobe"
                      ? `${wardrobe.length} owned pieces, including earned titles. Available even when the shop is closed.`
                      : tab === "shop"
                        ? "A preview of the open shop. Try a piece on before spending preview coins."
                        : "Browse every piece, including retired and surprise stock. Edits are private drafts."}
                  </p>
                </div>
                {tab === "catalog" && (
                  <button
                    className={previewPrimary}
                    onClick={() => setEditing(emptyItem())}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Plus size={16} /> New cosmetic
                    </span>
                  </button>
                )}
                {tab === "shop" && (
                  <span className="rounded-full bg-panel px-3 py-2 text-sm text-ink">
                    {session.balance} preview coins
                  </span>
                )}
              </div>
              {tab === "shop" &&
                session.sets.some((set) =>
                  customerShelf(session.items, now).some(
                    (item) => item.setKey === set.key,
                  ),
                ) && (
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label="Browse collections"
                  >
                    {session.sets
                      .filter((set) =>
                        customerShelf(session.items, now).some(
                          (item) => item.setKey === set.key,
                        ),
                      )
                      .map((set) => (
                        <button
                          key={set.key}
                          className={previewButton}
                          onClick={() => setCollection(set.key)}
                        >
                          {set.name}
                        </button>
                      ))}
                  </div>
                )}
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-0 flex-1 basis-52">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-3.5 text-muted"
                  />
                  <input
                    aria-label="Search cosmetics"
                    className={`${previewInput} pl-9`}
                    placeholder="Search cosmetics…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter collection"
                  className={`${previewInput} sm:w-auto`}
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                >
                  <option value="">All collections</option>
                  {session.sets.map((set) => (
                    <option key={set.key} value={set.key}>
                      {set.name}
                    </option>
                  ))}
                </select>
                {tab === "catalog" && (
                  <select
                    aria-label="Filter shelf status"
                    className={`${previewInput} sm:w-auto`}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">Every status</option>
                    <option value="available">On sale</option>
                    <option value="upcoming">Scheduled</option>
                    <option value="ended">Ended</option>
                    <option value="inactive">Retired / draft</option>
                  </select>
                )}
              </div>
              <div
                className="flex flex-wrap gap-2"
                aria-label="Cosmetic categories"
              >
                {["all" as const, ...COSMETIC_SLOTS].map((category) => (
                  <button
                    key={category}
                    aria-pressed={kind === category}
                    className={
                      kind === category ? previewPrimary : previewButton
                    }
                    onClick={() => setKind(category)}
                  >
                    {category === "all"
                      ? "All"
                      : SHOP_KIND_META[category].label}{" "}
                    <span className="opacity-70">
                      {
                        source.filter(
                          (item) =>
                            category === "all" || item.kind === category,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((item) => {
                  const owned = ownsCosmetic(session, item);
                  const selected =
                    itemSelection(item) !== null &&
                    look[item.kind] === itemSelection(item);
                  const applied =
                    itemSelection(item) !== null &&
                    session.look[item.kind] === itemSelection(item);
                  const canBuy =
                    isAvailableNow(item, now) &&
                    item.price <= session.balance &&
                    !session.ownedIds.includes(item.id) &&
                    (item.kind !== "title" || item.badgeId !== null);
                  const badge = session.badges.find(
                    (candidate) => candidate.id === item.badgeId,
                  );
                  return (
                    <article
                      key={item.id}
                      aria-label={item.name}
                      className={`flex min-w-0 flex-col gap-3 rounded-2xl border bg-surface p-3 ${selected ? "border-brand" : "border-line"}`}
                    >
                      <CosmeticThumbnail
                        item={item}
                        badges={session.badges}
                        identity={identity}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-1">
                          <h3 className="break-words font-medium text-ink">
                            {item.name}
                          </h3>
                          {item.tier === "premium" && (
                            <span className="text-xs text-accent">
                              Signature
                            </span>
                          )}
                        </div>
                        <p className="mt-1 break-words text-xs text-muted">
                          {item.description}
                        </p>
                        <p className="mt-2 text-xs text-accent">
                          {tab === "wardrobe"
                            ? item.kind === "title" && badge?.kind !== "shop"
                              ? "Earned title"
                              : session.ownedIds.includes(item.id)
                                ? "Purchased"
                                : "Reward title"
                            : `${item.price} coins · ${availabilityLabel(item, now) ?? "Year-round"}`}
                        </p>
                        {tab === "catalog" && item.secret && (
                          <p className="mt-1 text-xs text-muted">
                            Surprise drop
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={selected ? previewPrimary : previewButton}
                          disabled={item.kind === "title" && !item.badgeId}
                          aria-pressed={selected}
                          onClick={() => choose(item)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {selected ? <Check size={14} /> : <Eye size={14} />}
                            {selected
                              ? applied
                                ? "Wearing in preview"
                                : "Trying on"
                              : "Try on"}
                          </span>
                        </button>
                        {tab === "shop" &&
                          (owned ? (
                            <span className="self-center text-xs text-muted">
                              Owned
                            </span>
                          ) : (
                            <button
                              className={previewButton}
                              disabled={!canBuy}
                              onClick={() => setBuying(item)}
                            >
                              {session.ownedIds.includes(item.id)
                                ? "Previously purchased"
                                : !isAvailableNow(item, now)
                                  ? "Not on sale"
                                  : item.price > session.balance
                                    ? "Need more coins"
                                    : "Preview purchase"}
                            </button>
                          ))}
                        {tab === "catalog" && (
                          <>
                            <button
                              aria-label={`Edit ${item.name}`}
                              className={previewButton}
                              onClick={() => setEditing(item)}
                            >
                              Edit
                            </button>
                            <button
                              aria-label={`Duplicate ${item.name}`}
                              className={previewButton}
                              onClick={() =>
                                setEditing({
                                  ...item,
                                  id: `preview:${crypto.randomUUID()}`,
                                  slug: "",
                                  name: `${item.name} copy`,
                                  active: false,
                                })
                              }
                            >
                              Duplicate
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {filtered.length === 0 && (
                <div className="rounded-2xl border border-dashed border-line p-8 text-center">
                  <Package size={28} className="mx-auto mb-3 text-muted" />
                  <p className="text-sm text-muted">
                    {source.length === 0 && tab === "wardrobe"
                      ? "Your wardrobe is waiting for its first piece. Browse the shop or load a full test inventory below."
                      : "No cosmetics match these filters."}
                  </p>
                  <button
                    className={`${previewButton} mt-3`}
                    onClick={() => {
                      setKind("all");
                      setCollection("");
                      setStatus("all");
                      setQuery("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <details className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
        <summary className="cursor-pointer py-1 font-medium text-ink">
          Preview tools
        </summary>
        <p className="my-3 text-xs">
          Use your real holdings or simulate a stocked wardrobe. These tools
          affect this review session only.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={previewButton}
            onClick={() => {
              setSession({
                ...session,
                ownedIds: session.items.map((item) => item.id),
                heldBadgeIds: session.badges.map((badge) => badge.id),
              });
              setNotice(
                "Full test inventory loaded. These are simulated holdings.",
              );
            }}
          >
            Load full test inventory
          </button>
          <button
            className={previewButton}
            onClick={() => {
              setSession({ ...session, balance: session.balance + 5000 });
              setNotice("Added 5,000 preview coins.");
            }}
          >
            Add 5,000 preview coins
          </button>
          <button className={previewButton} onClick={() => setResetting(true)}>
            Reset preview session
          </button>
        </div>
      </details>
      {buying && (
        <ConfirmDialog
          title={`Preview purchase: ${buying.name}`}
          body={`Spend ${buying.price} preview coins? This simulates a purchase; your real balance and inventory will not change.`}
          confirmLabel="Buy in preview"
          onCancel={() => setBuying(null)}
          onConfirm={() => {
            const next = previewPurchase(session, buying.id, Date.now());
            setSession(next);
            setBuying(null);
            setNotice(
              next === session
                ? "This preview purchase is no longer available."
                : `${buying.name} added to your preview inventory. Try it on and apply your look.`,
            );
          }}
        />
      )}
      {leaving && (
        <ConfirmDialog
          title="Leave the preview?"
          body="Your preview outfits, purchases, and catalog drafts will be discarded."
          confirmLabel="Leave preview"
          onConfirm={onClose}
          onCancel={() => setLeaving(false)}
        />
      )}
      {resetting && (
        <ConfirmDialog
          title="Reset the preview?"
          body="Discard all session drafts and simulated purchases and return to the catalog and holdings loaded when you opened the preview."
          confirmLabel="Reset preview"
          onCancel={() => setResetting(false)}
          onConfirm={() => {
            setSession(initial);
            setLook(initial.look);
            setEditing(null);
            setEditingSet(null);
            setResetting(false);
            setNotice("Preview reset to your original holdings and catalog.");
          }}
        />
      )}
    </section>
  );
}
