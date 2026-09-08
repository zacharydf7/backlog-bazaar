import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { type ShopSet } from "../lib/shop";
import { collectionDraftApi } from "../lib/collectionDraftApi";
import {
  collectionDraftData,
  collectionPayload,
  collectionReview,
  type CollectionDraft,
} from "../lib/collectionDrafts";
import {
  CollectionDraftEditor,
  previewButton,
  previewPrimary,
  previewInput,
} from "./CosmeticsDraftEditor";
import { ConfirmDialog } from "./ConfirmDialog";
export function CollectionDraftManager({ onClose }: { onClose: () => void }) {
  const allowed = useStore(
    (s) =>
      s.can("shop.manage") &&
      (s.can("shop.collections.drafts") || s.can("shop.collections.publish")),
  );
  const userId = useStore((s) => s.userId);
  return allowed ? (
    <CollectionWorkspace key={userId} onClose={onClose} />
  ) : (
    <p className="text-sm text-muted">Collection draft access is required.</p>
  );
}
function CollectionWorkspace({ onClose }: { onClose: () => void }) {
  const canEdit = useStore((s) => s.can("shop.collections.drafts"));
  const canPublish = useStore((s) => s.can("shop.collections.publish"));
  const [drafts, setDrafts] = useState<CollectionDraft[]>([]);
  const [sets, setSets] = useState<ShopSet[]>([]);
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState<CollectionDraft | null>(null);
  const [reviewing, setReviewing] = useState<CollectionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError("");
    async function load() {
      try {
        const [rows, current] = await Promise.all([
          collectionDraftApi.list(),
          collectionDraftApi.collections(),
        ]);
        if (!cancelled) {
          setDrafts(rows);
          setSets(current);
          setLoaded(true);
        }
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load collection drafts.",
          );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [!!editing]);
  async function run(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The request failed. Saved revisions remain intact.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const replace = (draft: CollectionDraft) =>
    setDrafts((rows) => [
      draft,
      ...rows.filter((row) => row.draft_id !== draft.draft_id),
    ]);
  const data = editing ? collectionDraftData(editing) : null;
  const review = reviewing ? collectionReview(reviewing) : null;
  const hasChanges =
    !!review && (review.changes.length > 0 || review.memberships.length > 0);
  const valid =
    !!reviewing &&
    !!reviewing.payload.set.key.trim() &&
    !!reviewing.payload.set.name.trim();
  return (
    <section
      aria-label="Saved collection drafts"
      className="flex min-w-0 flex-col gap-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">
            Saved collection drafts
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Plan names, rewards and membership together. Saving keeps a
            revision; publishing changes the live collection. The shop stays as
            it is.
          </p>
        </div>
        <button
          disabled={busy}
          className={previewButton}
          onClick={() => (editing ? setLeaving(true) : onClose())}
        >
          Back to shop management
        </button>
      </header>
      {error && (
        <p role="alert" className="text-sm text-danger">
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
          className={`${previewButton} self-start`}
          disabled={busy}
          onClick={() => {
            setReviewing(null);
            setAttempt(attempt + 1);
          }}
        >
          Reload collection drafts
        </button>
      )}
      {!loaded && !error && <p role="status">Loading collection drafts…</p>}
      {loaded && !editing && !reviewing && (
        <>
          {canEdit && (
            <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-surface p-4">
              <label className="min-w-0 flex-1 basis-64 text-sm text-muted">
                Start from
                <select
                  className={`${previewInput} mt-1`}
                  aria-label="Collection source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">A new collection</option>
                  {sets.map((set) => (
                    <option key={set.key} value={set.key}>
                      {set.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy}
                className={`${previewPrimary} self-end`}
                onClick={() =>
                  void run(async () => {
                    const draft = await collectionDraftApi.start(
                      source || null,
                    );
                    replace(draft);
                    setEditing(draft);
                  })
                }
              >
                Start collection draft
              </button>
            </div>
          )}
          {drafts.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              No saved collection drafts yet.
            </p>
          )}
          {drafts.map((draft) => (
            <article
              key={draft.draft_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
            >
              <div className="min-w-0">
                <h2 className="break-words font-medium text-ink">
                  {draft.payload.set.name || "Untitled collection"}
                </h2>
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
                  Review collection
                </button>
                {canEdit && draft.state === "draft" && (
                  <button
                    disabled={busy}
                    className={previewButton}
                    onClick={() => setEditing(draft)}
                  >
                    Edit collection draft
                  </button>
                )}
              </div>
            </article>
          ))}
        </>
      )}
      {editing && data && canEdit && (
        <CollectionDraftEditor
          key={`${editing.draft_id}:${editing.revision}`}
          initial={data.initial}
          sets={data.sets}
          items={data.items}
          badges={data.badges}
          initialMemberIds={editing.payload.member_ids}
          persistent
          saving={busy}
          onCancel={() => setEditing(null)}
          onSave={(set, members) =>
            void run(async () => {
              const saved = await collectionDraftApi.save(
                editing,
                collectionPayload(set, members),
              );
              replace(saved);
              setEditing(null);
              setReviewing(saved);
              setAcknowledged(false);
              setNotice(
                `Collection revision ${saved.revision} saved. Nothing has been published.`,
              );
            })
          }
        />
      )}
      {reviewing && review && (
        <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl text-ink">
              Review {reviewing.payload.set.name || "Untitled collection"}
            </h2>
            <button
              disabled={busy}
              className={previewButton}
              onClick={() => setReviewing(null)}
            >
              Back to drafts
            </button>
          </div>
          <p className="text-sm text-muted">
            Compared with the catalog when this draft started. The server checks
            for newer changes again before publishing.
          </p>
          <dl className="flex flex-col gap-2">
            {review.changes.map((change) => (
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
          <h3 className="font-medium text-ink">Membership changes</h3>
          {review.memberships.length === 0 ? (
            <p className="text-sm text-muted">No membership changes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {review.memberships.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl bg-panel p-3 text-sm text-ink"
                >
                  <span className="break-words font-medium">{item.name}</span>
                  <span className="block break-words text-muted">
                    {item.fromName} → {item.toName}
                    {item.active
                      ? ""
                      : " · Off sale; still counts while in a collection"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="font-medium text-ink">Pieces required, including off-sale items</h3>
          <ul className="flex flex-col gap-2">
            {review.impacts.map((impact) => (
              <li key={impact.key} className="break-words text-sm text-ink">
                {impact.name}: {impact.before} → {impact.after}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Rewards are checked when a piece in the collection is purchased or earned. Existing
            reward grants remain held; publishing does not grant rewards
            retroactively. Moving a piece can change both collections'
            requirements.
          </p>
          {reviewing.state === "draft" && canPublish && (
            <>
              <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                I understand these changes affect live collection requirements
                and future rewards.
              </label>
              <button
                className={previewPrimary}
                disabled={busy || !valid || !hasChanges || !acknowledged}
                onClick={() => setConfirm(true)}
              >
                Publish collection revision
              </button>
            </>
          )}
          {!hasChanges && (
            <p className="text-sm text-muted">
              No collection changes to publish.
            </p>
          )}
          {reviewing.state === "published" && (
            <p className="text-sm text-success">
              This revision is published. Start a new draft for further changes.
            </p>
          )}
        </div>
      )}
      {confirm && reviewing && canPublish && (
        <ConfirmDialog
          title="Publish this collection?"
          body="This changes the live collection and item memberships. Existing purchases and granted titles are preserved. The shop setting will not change."
          confirmLabel="Publish collection now"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            void run(async () => {
              const saved = await collectionDraftApi.publish(
                reviewing,
                acknowledged,
              );
              replace(saved);
              setReviewing(saved);
              setNotice(
                "Collection published. Existing purchases and reward grants are unchanged.",
              );
            });
          }}
        />
      )}
      {leaving && (
        <ConfirmDialog
          title="Leave collection editing?"
          body="Unsaved edits will be discarded. Saved revisions remain available."
          confirmLabel="Leave editing"
          onCancel={() => setLeaving(false)}
          onConfirm={onClose}
        />
      )}
    </section>
  );
}
