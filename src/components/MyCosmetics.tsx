import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { wardrobeApi, sameLook } from "../lib/wardrobe";
import {
  COSMETIC_SLOTS,
  SLOT_LABELS,
  wardrobeItems,
  itemSelection,
  lookIsOwned,
  type CosmeticLook,
  type CosmeticsSession,
} from "../lib/cosmeticsPreview";
import { SHOP_KIND_META, type ShopItemKind } from "../lib/shop";
import { CosmeticLookPreview, CosmeticThumbnail } from "./CosmeticPreviewCard";
import {
  previewButton,
  previewPrimary,
  previewInput,
} from "./CosmeticsDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { cosmeticOwnershipLabel } from "../lib/cosmeticOwnership";
import { OutfitPresets } from "./OutfitPresets";

export function MyCosmetics({ onClose }: { onClose: () => void }) {
  const allowed = useStore(
    (s) => s.cloud && !!s.userId,
  );
  const userId = useStore((s) => s.userId);
  if (!allowed)
    return <p className="text-sm text-muted">Sign in to use My Cosmetics.</p>;
  return <Wardrobe key={userId} onClose={onClose} />;
}
function Wardrobe({ onClose }: { onClose: () => void }) {
  const [session, setSession] = useState<CosmeticsSession | null>(null);
  const [look, setLook] = useState<CosmeticLook | null>(null);
  const [kind, setKind] = useState<ShopItemKind | "all">("all");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [presetEditing, setPresetEditing] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "reload" | null>(null);
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
          setNotice("Your saved outfit is loaded.");
        }
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load your wardrobe.",
          );
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const changed = !!session && !!look && !sameLook(session.look, look);
  const unsaved = changed || presetEditing;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const items = session ? wardrobeItems(session) : [];
  const filtered = items.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (!collection || item.setKey === collection) &&
      `${item.name} ${item.description ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const wearable = !!session && !!look && lookIsOwned(session, look);
  async function apply() {
    if (!session || !look || !changed || !wearable || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await wardrobeApi.apply(look, session.look);
      setSession({ ...session, look: saved });
      setLook(saved);
      setNotice("Your outfit is saved.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save your outfit. Your try-on is still here.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="My Cosmetics" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <div>
          <h1 className="font-display text-2xl text-ink">My Cosmetics</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Your real collection, including retired pieces and earned titles.
            Try a look, then Apply to save your actual equipment. Saved
            cosmetics appear wherever your equipment is shown.
          </p>
        </div>
        <button
          disabled={busy}
          className={previewButton}
          onClick={() => (unsaved ? setConfirm("leave") : onClose())}
        >
          Done
        </button>
      </header>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      )}
      <button
        className={`${previewButton} self-start`}
        disabled={busy}
        onClick={() =>
          unsaved ? setConfirm("reload") : setAttempt(attempt + 1)
        }
      >
        Reload wardrobe
      </button>
      {!session && busy && <p role="status">Loading your wardrobe…</p>}
      {session && look && (
        <>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-3">
              <CosmeticLookPreview
                look={look}
                items={session.items}
                badges={session.badges}
                identity={identity}
              />
              <p className="text-center text-xs text-muted">
                Profile · your banner and colors
              </p>
              <CosmeticLookPreview
                surface="community"
                look={look}
                items={session.items}
                badges={session.badges}
                identity={identity}
              />
              <p className="text-center text-xs text-muted">
                Community · your stall decorations
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-3 font-display text-lg text-ink">Your look</h2>
              <div className="grid grid-cols-2 gap-2">
                {COSMETIC_SLOTS.map((slot) => {
                  const name =
                    slot === "title"
                      ? session.badges.find((b) => b.id === look.title)?.name
                      : session.items.find((i) => i.id === look[slot])?.name;
                  return (
                    <div
                      key={slot}
                      className="min-w-0 rounded-xl border border-line p-3"
                    >
                      <button
                        disabled={busy}
                        className="min-h-11 w-full text-left"
                        onClick={() => {
                          setKind(slot);
                          setCollection("");
                          setQuery("");
                        }}
                      >
                        <span className="block text-xs text-muted">
                          {SLOT_LABELS[slot]}
                        </span>
                        <span className="block break-words text-sm text-ink">
                          {name ??
                            (look[slot] ? "Unavailable item" : "Default")}
                        </span>
                      </button>
                      <button
                        aria-label={`Use default ${slot}`}
                        disabled={busy || look[slot] === null}
                        className="min-h-11 text-sm text-accent disabled:opacity-40"
                        onClick={() => setLook({ ...look, [slot]: null })}
                      >
                        Use default
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3 shadow-lg">
            <p className="text-sm text-muted">
              {busy
                ? "Working…"
                : changed
                  ? "You have unapplied changes."
                  : "Your outfit is up to date."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={previewPrimary}
                disabled={busy || !changed || !wearable}
                onClick={() => void apply()}
              >
                Apply outfit
              </button>
              <button
                className={previewButton}
                disabled={busy || !changed}
                onClick={() => {
                  setLook(session.look);
                  setError("");
                  setNotice("Returned to your saved outfit.");
                }}
              >
                Undo try-on
              </button>
            </div>
          </div>
          {!wearable && (
            <p className="text-sm text-danger">
              An equipped piece is no longer held. Choose a replacement or use
              its default before applying.
            </p>
          )}
          <OutfitPresets
            key={attempt}
            session={session}
            look={look}
            disabled={busy}
            onEditingChange={setPresetEditing}
            onPreview={(presetLook) => {
              setLook(presetLook);
              setError("");
              setNotice(
                "Saved look loaded for try-on. Apply outfit to wear it.",
              );
            }}
          />
          <h2 className="font-display text-xl text-ink">
            Your collection{" "}
            <span className="text-sm text-muted">({items.length})</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              className={`${previewInput} min-w-0 flex-1 basis-48`}
              aria-label="Search cosmetics"
              placeholder="Search cosmetics…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Filter collection"
              className={`${previewInput} min-w-0 flex-1 basis-48`}
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            >
              <option value="">All collections</option>
              {session.sets.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div
            className="flex flex-wrap gap-2"
            aria-label="Cosmetic categories"
          >
            {(["all", ...COSMETIC_SLOTS] as const).map((value) => (
              <button
                key={value}
                aria-pressed={kind === value}
                className={kind === value ? previewPrimary : previewButton}
                onClick={() => setKind(value)}
              >
                {value === "all" ? "All" : SHOP_KIND_META[value].label}
              </button>
            ))}
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <article
                aria-label={item.name}
                key={item.id}
                className="min-w-0 rounded-2xl border border-line bg-surface p-3"
              >
                <CosmeticThumbnail
                  item={item}
                  badges={session.badges}
                  identity={identity}
                />
                <h3 className="mt-3 break-words font-medium text-ink">
                  {item.name}
                </h3>
                <p className="mt-1 break-words text-sm text-muted">
                  {item.description}
                </p>
                <p className="my-2 text-xs text-muted">
                  {item.id.startsWith("badge:")
                    ? "Earned title"
                    : cosmeticOwnershipLabel(session.ownershipSources?.[item.id], item.active)}
                  {session.look[item.kind] === itemSelection(item)
                    ? " · Equipped"
                    : ""}
                </p>
                <button
                  className={previewButton}
                  disabled={busy}
                  aria-pressed={look[item.kind] === itemSelection(item)}
                  onClick={() => {
                    setLook({ ...look, [item.kind]: itemSelection(item) });
                    setNotice("Try-on updated. Apply to save this outfit.");
                  }}
                >
                  {look[item.kind] === itemSelection(item)
                    ? session.look[item.kind] === itemSelection(item)
                      ? "Equipped"
                      : "Trying on"
                    : "Try on"}
                </button>
              </article>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {items.length
                ? "No cosmetics match these filters."
                : "Your collection is empty. Default looks are always available."}
            </p>
          )}
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title="Discard unapplied changes?"
          body="Your saved outfit and saved looks will stay as they are. Your current try-on and unsaved preset edits will be discarded."
          confirmLabel={
            confirm === "leave" ? "Leave wardrobe" : "Reload wardrobe"
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "leave") onClose();
            else setAttempt(attempt + 1);
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}
