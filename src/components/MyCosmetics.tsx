import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Shirt } from "lucide-react";
import { useStore } from "../store";
import { toast, toastAction } from "../lib/toast";
import { wardrobeApi, sameLook } from "../lib/wardrobe";
import {
  COSMETIC_SLOTS,
  SLOT_LABELS,
  itemSelection,
  type CosmeticLook,
  type CosmeticsSession,
} from "../lib/cosmeticsPreview";
import {
  isWorn,
  pieceName,
  slotCounts,
  slotItems,
  unheldSlots,
  wearMessage,
  wearOutfit,
} from "../lib/dressingRoom";
import type { ShopItemKind } from "../lib/shop";
import { CosmeticLookPreview, CosmeticThumbnail } from "./CosmeticPreviewCard";
import { previewButton, previewInput } from "./CosmeticsDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { cosmeticOwnershipLabel } from "../lib/cosmeticOwnership";
import { CosmeticEvents } from "./CosmeticEvents";
import { OutfitPresets } from "./OutfitPresets";

/** Show search once a slot holds more pieces than this. */
const SEARCH_AFTER = 8;

export function MyCosmetics({ onClose }: { onClose: () => void }) {
  const allowed = useStore((s) => s.cloud && !!s.userId);
  const userId = useStore((s) => s.userId);
  if (!allowed) return <p className="text-sm text-muted">Sign in to use My Cosmetics.</p>;
  return <Wardrobe key={userId} onClose={onClose} />;
}

/** The outfit the app has saved for you right now (the store mirrors every
 *  save, including ones made after this page closed). */
function savedLook(): CosmeticLook {
  const s = useStore.getState();
  return { title: s.selectedTitleId, frame: s.equippedFrameId, stall: s.equippedStallId, coin: s.equippedCoinId };
}

/** Undo (from the toast): put the previous outfit back, saved against what's
 *  worn now, so it works even after the page has closed or reopened. */
async function undoOutfit(previous: CosmeticLook) {
  const current = savedLook();
  if (sameLook(previous, current)) return;
  try {
    await wardrobeApi.apply(previous, current);
    toast("Back to your previous outfit", Shirt);
  } catch (reason) {
    toast(reason instanceof Error ? reason.message : "Could not undo that change.", AlertTriangle);
  }
}

/** The dressing room: the live preview stays in view while you browse one
 *  slot at a time, and tapping anything you own wears it right away (saved,
 *  with Undo in the toast). Saved looks switch a whole outfit in one tap. */
function Wardrobe({ onClose }: { onClose: () => void }) {
  const [session, setSession] = useState<CosmeticsSession | null>(null);
  // The outfit on screen: the saved one, or the one being saved right now.
  const [look, setLook] = useState<CosmeticLook | null>(null);
  const [slot, setSlot] = useState<ShopItemKind>("title");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [presetEditing, setPresetEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const saving = useRef(false);
  const [identity] = useState(() => {
    const s = useStore.getState();
    return {
      name: s.displayName || "You",
      avatar: s.avatarUrl,
      bannerUrl: s.bannerUrl,
      bg: s.bg,
      accent: s.accent,
      defaultCoin: s.defaultCoin,
    };
  });

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    void wardrobeApi
      .load()
      .then((loaded) => {
        if (!cancelled) {
          setSession(loaded);
          setLook(loaded.look);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load your wardrobe.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!presetEditing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [presetEditing]);

  // An outfit saved from elsewhere (Undo after this page reopened, another
  // tab) shows up here: follow the store's saved outfit when it CHANGES.
  const titleId = useStore((s) => s.selectedTitleId);
  const frameId = useStore((s) => s.equippedFrameId);
  const stallId = useStore((s) => s.equippedStallId);
  const coinId = useStore((s) => s.equippedCoinId);
  const seenSaved = useRef<CosmeticLook | null>(null);
  useEffect(() => {
    const now = { title: titleId, frame: frameId, stall: stallId, coin: coinId };
    const before = seenSaved.current;
    seenSaved.current = now;
    if (!before || sameLook(before, now) || saving.current) return;
    setSession((s) => (s && !sameLook(s.look, now) ? { ...s, look: now } : s));
    setLook((l) => (l && !sameLook(l, now) ? now : l));
  }, [titleId, frameId, stallId, coinId]);

  /** Put changes on and save them. One save at a time; a failed save puts the
   *  previous outfit back on screen and says why. */
  async function wear(changes: Partial<CosmeticLook>, label: string, from: "worn" | "look" = "worn") {
    if (!session || saving.current) return;
    const before = session.look;
    const { next, cleared } = wearOutfit(session, before, changes);
    if (sameLook(next, before)) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setLook(next);
    try {
      const saved = await wardrobeApi.apply(next, before);
      setSession((s) => (s ? { ...s, look: saved } : s));
      setLook(saved);
      toastAction(wearMessage(label, cleared, from), { label: "Undo", onAction: () => void undoOutfit(before) }, Shirt);
    } catch (reason) {
      setLook(before);
      setError(reason instanceof Error ? reason.message : "Could not save your outfit.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const unheld = session && look ? unheldSlots(session, look) : [];
  const counts = session ? slotCounts(session) : null;
  const allInSlot = session ? slotItems(session, slot) : [];
  const shown = session ? slotItems(session, slot, { query, collection }) : [];
  const slotSets = session ? session.sets.filter((set) => allInSlot.some((item) => item.setKey === set.key)) : [];

  function pickSlot(next: ShopItemKind) {
    setSlot(next);
    setQuery("");
    setCollection("");
  }

  return (
    <section aria-label="My Cosmetics" className="flex min-w-0 flex-col gap-4">
      <CosmeticEvents />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-ink">My Cosmetics</h1>
          <p className="mt-1 text-sm text-muted">
            Tap anything you own to wear it. Changes save right away.
          </p>
        </div>
        <button
          disabled={busy}
          className={previewButton}
          onClick={() => (presetEditing ? setConfirmLeave(true) : onClose())}
        >
          Done
        </button>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2">
          <p className="text-sm text-danger">{error}</p>
          <button className={previewButton} disabled={busy} onClick={() => setAttempt(attempt + 1)}>
            Reload
          </button>
        </div>
      )}
      {!session && busy && <p role="status">Loading your wardrobe…</p>}

      {session && look && counts && (
        <div className="min-w-0 gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          {/* The preview stays in view while you browse: pinned under the app
              bar on a phone (the compact stall card), and as a sticky column
              on a wide screen (profile card and stall card). */}
          <div
            className="sticky z-20 -mx-4 bg-canvas px-4 pb-3 pt-1 md:-mx-6 md:px-6 lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0"
            style={{ top: "var(--chrome-h, 0px)" }}
          >
            <div className="hidden lg:mb-3 lg:block">
              <CosmeticLookPreview look={look} items={session.items} badges={session.badges} identity={identity} />
            </div>
            <CosmeticLookPreview
              surface="community"
              look={look}
              items={session.items}
              badges={session.badges}
              identity={identity}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            {unheld.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2">
                <p className="text-sm text-danger">
                  {unheld.map((s) => `${SLOT_LABELS[s]} (${pieceName(session, s, look[s])})`).join(" and ")}{" "}
                  {unheld.length === 1 ? "is" : "are"} no longer yours.
                </p>
                <button
                  className={previewButton}
                  disabled={busy}
                  onClick={() =>
                    void wear(Object.fromEntries(unheld.map((s) => [s, null])), "Took it off")
                  }
                >
                  Take it off
                </button>
              </div>
            )}

            <div role="tablist" aria-label="Cosmetic slots" className="grid grid-cols-4 gap-1.5">
              {COSMETIC_SLOTS.map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={slot === s}
                  onClick={() => pickSlot(s)}
                  className={
                    "min-w-0 rounded-xl border px-2 py-2 text-left transition " +
                    (slot === s ? "border-brand bg-brand/10" : "border-line bg-surface hover:bg-panel")
                  }
                >
                  <span className="block text-xs font-semibold text-ink">
                    {SLOT_LABELS[s]} <span className="font-normal text-subtle">{counts[s]}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted">{pieceName(session, s, look[s])}</span>
                </button>
              ))}
            </div>

            {(allInSlot.length > SEARCH_AFTER || slotSets.length > 1) && (
              <div className="flex flex-wrap gap-2">
                {allInSlot.length > SEARCH_AFTER && (
                  <input
                    className={`${previewInput} min-w-0 flex-1 basis-40`}
                    aria-label="Search cosmetics"
                    placeholder={`Search ${SLOT_LABELS[slot].toLowerCase()}s…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                )}
                {slotSets.length > 1 && (
                  <select
                    aria-label="Filter collection"
                    className={`${previewInput} min-w-0 flex-1 basis-40`}
                    value={collection}
                    onChange={(e) => setCollection(e.target.value)}
                  >
                    <option value="">All collections</option>
                    {slotSets.map((set) => (
                      <option key={set.key} value={set.key}>
                        {set.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                aria-pressed={look[slot] === null}
                aria-label={`No ${SLOT_LABELS[slot].toLowerCase()}`}
                disabled={busy}
                onClick={() => void wear({ [slot]: null }, `No ${SLOT_LABELS[slot].toLowerCase()}`)}
                className={tileClass(look[slot] === null)}
              >
                <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
                  None
                </div>
                <TileCaption name="None" detail="The default look" worn={look[slot] === null} />
              </button>
              {shown.map((item) => {
                const worn = isWorn(look, item);
                return (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={worn}
                    aria-label={item.name}
                    title={item.description ?? undefined}
                    disabled={busy}
                    onClick={() => void wear({ [item.kind]: itemSelection(item) }, `Wearing ${item.name}`)}
                    className={tileClass(worn)}
                  >
                    <CosmeticThumbnail item={item} badges={session.badges} identity={identity} />
                    <TileCaption
                      name={item.name}
                      detail={
                        item.id.startsWith("badge:")
                          ? "Earned title"
                          : cosmeticOwnershipLabel(session.ownershipSources?.[item.id], item.active)
                      }
                      worn={worn}
                    />
                  </button>
                );
              })}
            </div>
            {shown.length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
                {allInSlot.length
                  ? "Nothing matches these filters."
                  : `You don't own any ${SLOT_LABELS[slot].toLowerCase()}s yet. Find them in the Curio Shop.`}
              </p>
            )}

            <OutfitPresets
              key={attempt}
              session={session}
              look={look}
              disabled={busy}
              onEditingChange={setPresetEditing}
              onWear={(presetLook, name) => void wear(presetLook, `Wearing ${name}`, "look")}
            />
          </div>
        </div>
      )}

      {confirmLeave && (
        <ConfirmDialog
          title="Discard your unsaved look name?"
          body="The look you were naming won't be saved. Everything you're wearing is already saved."
          confirmLabel="Leave"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            setConfirmLeave(false);
            onClose();
          }}
        />
      )}
    </section>
  );
}

function tileClass(worn: boolean): string {
  return (
    "relative min-w-0 rounded-2xl border bg-surface p-2 text-left transition disabled:cursor-wait " +
    (worn ? "border-brand ring-2 ring-brand/60" : "border-line hover:border-brand/50")
  );
}

function TileCaption({ name, detail, worn }: { name: string; detail: string; worn: boolean }) {
  return (
    <div className="mt-2 min-w-0 px-1">
      <p className="flex min-w-0 items-center gap-1 text-sm font-medium text-ink">
        <span className="truncate">{name}</span>
        {worn && <Check size={14} className="shrink-0 text-brand" aria-label="Wearing" />}
      </p>
      <p className="truncate text-[11px] text-muted">{worn ? "Wearing" : detail}</p>
    </div>
  );
}
