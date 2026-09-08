import { useEffect, useState } from "react";
import { useStore } from "../store";
import { supabase } from "../lib/supabase";
import {
  coerceShopItems,
  coerceShopSets,
  type ShopItem,
  type ShopSet,
} from "../lib/shop";
import { DEFAULT_COIN } from "../lib/coins";
import { shopDraftApi } from "../lib/shopDraftApi";
import {
  shopDraftChanges,
  shopDraftEditorData,
  shopDraftPayload,
  type ShopDraft,
} from "../lib/shopDrafts";
import { CosmeticThumbnail } from "./CosmeticPreviewCard";
import {
  CosmeticsDraftEditor,
  previewButton,
  previewInput,
  previewPrimary,
} from "./CosmeticsDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { validateCosmetic } from "../lib/cosmeticsPreview";

export function ShopDraftManager({ onClose }: { onClose: () => void }) {
  const allowed = useStore(
    (s) =>
      s.can("shop.manage") && (s.can("shop.drafts") || s.can("shop.publish")),
  );
  const userId = useStore((s) => s.userId);
  if (!allowed)
    return (
      <p className="text-sm text-muted">
        Draft or publish permission is required.
      </p>
    );
  return <DraftWorkspace key={userId} onClose={onClose} />;
}

function DraftWorkspace({ onClose }: { onClose: () => void }) {
  const canEdit = useStore((s) => s.can("shop.drafts"));
  const canPublish = useStore((s) => s.can("shop.publish"));
  const [drafts, setDrafts] = useState<ShopDraft[]>([]);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [sets, setSets] = useState<ShopSet[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [editing, setEditing] = useState<ShopDraft | null>(null);
  const [reviewing, setReviewing] = useState<ShopDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [identity] = useState(() => {
    const s = useStore.getState();
    return {
      name: s.displayName || "You",
      avatar: s.avatarUrl,
      defaultCoin: s.defaultCoin ?? DEFAULT_COIN,
    };
  });
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError("");
    async function load() {
      try {
        if (!supabase)
          throw new Error(
            "Persistent drafts require a signed-in cloud account.",
          );
        const [saved, catalog, collections] = await Promise.all([
          shopDraftApi.list(),
          supabase.from("shop_items").select("*").order("sort"),
          supabase.from("shop_sets").select("*"),
        ]);
        if (catalog.error || collections.error)
          throw new Error(catalog.error?.message ?? collections.error?.message);
        if (!cancelled) {
          setDrafts(saved);
          setItems(coerceShopItems(catalog.data));
          setSets(coerceShopSets(collections.data));
          setLoaded(true);
        }
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "Could not load drafts.",
          );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const replace = (draft: ShopDraft) =>
    setDrafts((all) => [
      draft,
      ...all.filter((d) => d.draft_id !== draft.draft_id),
    ]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The request failed. Your saved revisions are intact.",
      );
    } finally {
      setBusy(false);
    }
  };
  const editData = editing ? shopDraftEditorData(editing) : null;
  const reviewData = reviewing ? shopDraftEditorData(reviewing) : null;
  const changes = reviewing ? shopDraftChanges(reviewing) : [];
  const reviewProblem = reviewData
    ? validateCosmetic(reviewData.item, items)
    : null;

  return (
    <section
      aria-label="Persistent cosmetic drafts"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">
            Saved cosmetic drafts
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Save revisions here and return later. Only Publish changes the live
            catalog. Publishing never opens the shop.
          </p>
        </div>
        <button disabled={busy} className={previewButton} onClick={onClose}>
          Back to shop management
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      {!editing && (
        <button
          disabled={busy}
          className={`${previewButton} self-start`}
          onClick={() => {
            setReviewing(null);
            setAttempt((value) => value + 1);
          }}
        >
          Reload saved drafts
        </button>
      )}
      {!loaded && !error && (
        <p role="status" className="text-sm text-muted">
          Loading drafts…
        </p>
      )}
      {loaded && !editing && !reviewing && (
        <>
          {canEdit && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-panel p-4">
              <label className="min-w-0 flex-1 basis-64 text-xs text-muted">
                Start from
                <select
                  aria-label="Draft source"
                  className={previewInput}
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  <option value="">A new cosmetic</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy}
                className={`${previewPrimary} self-end`}
                onClick={() =>
                  void run(async () => {
                    const draft = await shopDraftApi.start(sourceId || null);
                    replace(draft);
                    setEditing(draft);
                  })
                }
              >
                Start draft
              </button>
            </div>
          )}
          {drafts.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              No saved drafts yet.
            </p>
          )}
          {drafts.map((draft) => (
            <article
              key={draft.draft_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
            >
              <div className="min-w-0">
                <h3 className="break-words font-medium text-ink">
                  {String(draft.payload.item.name || "Untitled cosmetic")}
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Revision {draft.revision} · {draft.state} ·{" "}
                  {new Date(draft.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  className={previewButton}
                  onClick={() => {
                    setReviewing(draft);
                    setAcknowledged(false);
                  }}
                >
                  Review
                </button>
                {canEdit && draft.state === "draft" && (
                  <button
                    disabled={busy}
                    className={previewButton}
                    onClick={() => setEditing(draft)}
                  >
                    Edit draft
                  </button>
                )}
              </div>
            </article>
          ))}
        </>
      )}
      {editing && editData && canEdit && (
        <CosmeticsDraftEditor
          key={`${editing.draft_id}:${editing.revision}`}
          persistent
          saving={busy}
          initial={editData.item}
          items={items}
          sets={sets}
          badges={[editData.badge]}
          identity={identity}
          onCancel={() => setEditing(null)}
          onSave={(item, badge) =>
            void run(async () => {
              const saved = await shopDraftApi.save(
                editing,
                shopDraftPayload(item, badge),
              );
              replace(saved);
              setEditing(null);
              setReviewing(saved);
              setAcknowledged(false);
              setNotice(
                `Revision ${saved.revision} saved. Nothing has been published.`,
              );
            })
          }
        />
      )}
      {reviewing && reviewData && (
        <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xl text-ink">
              Review {reviewData.item.name || "Untitled cosmetic"}
            </h3>
            <button
              disabled={busy}
              className={previewButton}
              onClick={() => setReviewing(null)}
            >
              Back to drafts
            </button>
          </div>
          <CosmeticThumbnail
            item={reviewData.item}
            badges={[reviewData.badge]}
            identity={identity}
          />
          <p className="text-sm text-muted">
            {reviewing.source_item_id
              ? "Changes from the live item when this draft started:"
              : "This will create a new cosmetic:"}
          </p>
          <dl className="flex flex-col gap-2">
            {changes.map((change) => (
              <div
                key={change.label}
                className="grid min-w-0 gap-1 rounded-xl bg-panel p-3 sm:grid-cols-3"
              >
                <dt className="text-sm font-medium text-ink">{change.label}</dt>
                <dd className="break-words text-sm text-muted">
                  Before: {change.before}
                </dd>
                <dd className="break-words text-sm text-ink">
                  After: {change.after}
                </dd>
              </div>
            ))}
          </dl>
          {changes.length === 0 && (
            <p className="text-sm text-muted">No catalog changes to publish.</p>
          )}
          {changes.some(
            (change) =>
              change.label === "Collection" || change.label === "On the shelf",
          ) && (
            <p className="text-sm text-muted">
              Collection rewards currently depend on active pieces. Changing
              membership or shelf status can change the requirement; existing
              reward grants are retained.
            </p>
          )}
          {reviewing.state === "draft" && canPublish && (
            <>
              {reviewProblem && (
                <p className="text-sm text-danger">
                  Edit and save this draft before publishing: {reviewProblem}
                </p>
              )}
              {reviewing.source_item_id && (
                <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  I understand these edits affect the existing item and may
                  change its appearance for current owners.
                </label>
              )}
              <button
                className={previewPrimary}
                disabled={
                  busy ||
                  !!reviewProblem ||
                  changes.length === 0 ||
                  (!!reviewing.source_item_id && !acknowledged)
                }
                onClick={() => setConfirmPublish(true)}
              >
                Publish saved revision
              </button>
            </>
          )}
          {reviewing.state === "published" && (
            <p className="text-sm text-success">
              This revision was published. Start a new draft for further
              changes.
            </p>
          )}
        </div>
      )}
      {confirmPublish && reviewing && canPublish && (
        <ConfirmDialog
          title="Publish to the live catalog?"
          body={`Publish revision ${reviewing.revision} of ${String(reviewing.payload.item.name || "this cosmetic")}? These are real catalog changes. The shop's open/closed setting will not change.`}
          confirmLabel="Publish now"
          onCancel={() => setConfirmPublish(false)}
          onConfirm={() => {
            setConfirmPublish(false);
            void run(async () => {
              const published = await shopDraftApi.publish(
                reviewing,
                acknowledged,
              );
              replace(published);
              setReviewing(published);
              setNotice(
                "Saved revision published. The shop setting is unchanged.",
              );
            });
          }}
        />
      )}
    </section>
  );
}
