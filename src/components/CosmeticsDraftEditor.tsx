import { useState, type ReactNode } from "react";
import type { Badge } from "../types";
import { SHOP_KIND_META, type ShopItem, type ShopSet } from "../lib/shop";
import { BADGE_ICON_NAMES, TITLE_EFFECTS } from "../lib/badges";
import {
  COSMETIC_SLOTS,
  fromLocalDateTime,
  toLocalDateTime,
  validateCosmetic,
  visualOptions,
} from "../lib/cosmeticsPreview";
import { CosmeticThumbnail, type PreviewIdentity } from "./CosmeticPreviewCard";

export const previewButton =
  "min-h-11 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40";
export const previewPrimary =
  "min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
export const previewInput =
  "min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export function CosmeticsDraftEditor({
  initial,
  items,
  sets,
  badges,
  identity,
  onSave,
  onCancel,
  persistent = false,
  saving = false,
}: {
  initial: ShopItem;
  items: ShopItem[];
  sets: ShopSet[];
  badges: Badge[];
  identity: PreviewIdentity;
  onSave: (item: ShopItem, badge: Badge | null) => void;
  onCancel: () => void;
  persistent?: boolean;
  saving?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [badge, setBadge] = useState<Badge>(() => {
    const original = badges.find((b) => b.id === initial.badgeId);
    const copied = !items.some((item) => item.id === initial.id);
    return {
      ...original,
      id: copied || !original ? `preview-title:${initial.id}` : original.id,
      slug: original?.slug ?? `shop-${initial.slug}`,
      name: initial.name,
      description: initial.description,
      icon: original?.icon ?? "award",
      prestige: original?.prestige ?? 3,
      kind: "shop",
      effect: original?.effect ?? null,
    };
  });
  const [error, setError] = useState<string | null>(null);
  const existing = items.some((item) => item.id === initial.id);
  const displayBadge = {
    ...badge,
    name: draft.name || "Your title",
    description: draft.description,
  };
  const displayItem =
    draft.kind === "title" ? { ...draft, badgeId: badge.id } : draft;
  const patch = (update: Partial<ShopItem>) =>
    setDraft((item) => ({ ...item, ...update }));

  if (saving)
    return (
      <p role="status" className="text-sm text-muted">
        Saving draft revision…
      </p>
    );
  return (
    <form
      aria-label="Cosmetic draft editor"
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const problem = validateCosmetic(displayItem, items);
        setError(problem);
        if (!problem)
          onSave(
            {
              ...displayItem,
              name: draft.name.trim(),
              slug: draft.slug.trim(),
            },
            draft.kind === "title" ? displayBadge : null,
          );
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl text-ink">
          {existing ? "Edit cosmetic" : "Create cosmetic"}
        </h2>
        <button type="button" className={previewButton} onClick={onCancel}>
          Cancel editing
        </button>
      </div>
      <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <CosmeticThumbnail
            item={displayItem}
            badges={[displayBadge]}
            identity={identity}
          />
          <p className="mt-3 break-words font-medium text-ink">
            {draft.name || "Untitled cosmetic"}
          </p>
          <p className="mt-1 break-words text-sm text-muted">
            {draft.description || "Add a little story to this piece."}
          </p>
          {existing && (
            <p className="mt-4 rounded-xl bg-panel p-3 text-xs text-muted">
              Appearance changes affect existing owners when published.
              {persistent
                ? " Saving a draft does not publish it."
                : " This draft changes only your preview."}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
            <legend className="mb-3 font-medium text-ink">The piece</legend>
            <Field label="Name">
              <input
                autoFocus
                required
                className={previewInput}
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field label="Permanent slug">
              <input
                required
                disabled={existing}
                className={previewInput}
                value={draft.slug}
                onChange={(e) => patch({ slug: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <select
                disabled={existing}
                className={previewInput}
                value={draft.kind}
                onChange={(e) => {
                  const kind = e.target.value as ShopItem["kind"];
                  patch({
                    kind,
                    style: visualOptions(kind)[0]?.key ?? null,
                    badgeId: kind === "title" ? badge.id : null,
                  });
                }}
              >
                {COSMETIC_SLOTS.map((kind) => (
                  <option key={kind} value={kind}>
                    {SHOP_KIND_META[kind].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class">
              <select
                className={previewInput}
                value={draft.tier}
                onChange={(e) =>
                  patch({ tier: e.target.value as ShopItem["tier"] })
                }
              >
                <option value="standard">Standard</option>
                <option value="premium">Signature</option>
              </select>
            </Field>
          </fieldset>
          <Field label="Description">
            <textarea
              className={previewInput}
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          {draft.kind === "title" ? (
            <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3">
              <legend className="mb-3 font-medium text-ink">
                Title appearance
              </legend>
              <Field label="Icon">
                <select
                  className={previewInput}
                  value={badge.icon}
                  onChange={(e) => setBadge({ ...badge, icon: e.target.value })}
                >
                  {BADGE_ICON_NAMES.map((icon) => (
                    <option key={icon}>{icon}</option>
                  ))}
                </select>
              </Field>
              <Field label="Prestige">
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  className={previewInput}
                  value={badge.prestige}
                  onChange={(e) =>
                    setBadge({ ...badge, prestige: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Effect">
                <select
                  className={previewInput}
                  value={badge.effect ?? ""}
                  onChange={(e) =>
                    setBadge({ ...badge, effect: e.target.value || null })
                  }
                >
                  <option value="">None</option>
                  {Object.entries(TITLE_EFFECTS).map(([key, effect]) => (
                    <option key={key} value={key}>
                      {effect.label}
                    </option>
                  ))}
                </select>
              </Field>
            </fieldset>
          ) : (
            <fieldset className="min-w-0">
              <legend className="mb-3 font-medium text-ink">
                Choose a look
              </legend>
              <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto p-1">
                {visualOptions(draft.kind).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={draft.style === option.key}
                    className={`min-w-0 rounded-xl border p-2 text-left ${draft.style === option.key ? "border-brand bg-brand/10" : "border-line"}`}
                    onClick={() => patch({ style: option.key })}
                  >
                    <CosmeticThumbnail
                      item={{ ...draft, style: option.key }}
                      badges={[]}
                      identity={identity}
                    />
                    <span className="mt-2 block break-words text-xs text-ink">
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
            <legend className="mb-3 font-medium text-ink">On the shelf</legend>
            <Field label="Price (coins)">
              <input
                required
                type="number"
                min={0}
                step={1}
                className={previewInput}
                value={draft.price}
                onChange={(e) => patch({ price: Number(e.target.value) })}
              />
            </Field>
            <Field label="Collection">
              <select
                className={previewInput}
                value={draft.setKey ?? ""}
                onChange={(e) => patch({ setKey: e.target.value || null })}
              >
                <option value="">No collection</option>
                {sets.map((set) => (
                  <option key={set.key} value={set.key}>
                    {set.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Available from">
              <input
                type="datetime-local"
                className={previewInput}
                value={toLocalDateTime(draft.availableFrom)}
                onChange={(e) =>
                  patch({ availableFrom: fromLocalDateTime(e.target.value) })
                }
              />
            </Field>
            <Field label="Unavailable starting">
              <input
                type="datetime-local"
                className={previewInput}
                value={toLocalDateTime(draft.availableUntil)}
                onChange={(e) =>
                  patch({ availableUntil: fromLocalDateTime(e.target.value) })
                }
              />
            </Field>
          </fieldset>
          <p className="text-xs text-muted">
            Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Leave
            dates empty for year-round stock. Sales end at the exact end time.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => patch({ active: e.target.checked })}
              />{" "}
              On the shelf
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.secret}
                onChange={(e) => patch({ secret: e.target.checked })}
              />{" "}
              Hide until launch
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button className={previewPrimary} type="submit">
            {persistent ? "Save draft revision" : "Save to preview"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function CollectionDraftEditor({
  initial,
  sets,
  items,
  badges,
  onSave,
  onCancel,
}: {
  initial: ShopSet;
  sets: ShopSet[];
  items: ShopItem[];
  badges: Badge[];
  onSave: (set: ShopSet, memberIds: string[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [members, setMembers] = useState(
    items.filter((item) => item.setKey === initial.key).map((item) => item.id),
  );
  const [error, setError] = useState<string | null>(null);
  const existing = sets.some((set) => set.key === initial.key);
  return (
    <form
      aria-label="Collection draft editor"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.name.trim() || !draft.key.trim()) {
          setError("Give the collection a name and a key.");
          return;
        }
        if (!existing && sets.some((set) => set.key === draft.key.trim())) {
          setError("That collection key is already in use.");
          return;
        }
        onSave(
          { ...draft, key: draft.key.trim(), name: draft.name.trim() },
          members,
        );
      }}
    >
      <h2 className="font-display text-xl text-ink">
        {existing ? "Edit collection" : "Create collection"}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Collection name">
          <input
            autoFocus
            required
            className={previewInput}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Collection key">
          <input
            required
            disabled={existing}
            className={previewInput}
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Collection story">
        <textarea
          className={previewInput}
          value={draft.description ?? ""}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Field>
      <Field label="Reward title">
        <select
          className={previewInput}
          value={draft.badgeId ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, badgeId: e.target.value || null })
          }
        >
          <option value="">No reward</option>
          {badges
            .filter((badge) => badge.kind === "shop")
            .map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.name}
              </option>
            ))}
        </select>
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">
          Collection pieces
        </legend>
        <p className="mb-3 text-xs text-muted">
          A piece belongs to one collection. Selecting a piece from another
          collection moves it in this preview. Active members determine the
          reward requirement.
        </p>
        <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {items.map((item) => (
            <label
              key={item.id}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-line p-3 text-sm text-ink"
            >
              <input
                type="checkbox"
                checked={members.includes(item.id)}
                onChange={(e) =>
                  setMembers(
                    e.target.checked
                      ? [...members, item.id]
                      : members.filter((id) => id !== item.id),
                  )
                }
              />
              <span className="min-w-0 break-words">
                {item.name}
                {item.setKey && item.setKey !== initial.key && (
                  <span className="block text-xs text-muted">
                    From{" "}
                    {sets.find((set) => set.key === item.setKey)?.name ??
                      item.setKey}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={previewButton} onClick={onCancel}>
          Cancel editing
        </button>
        <button type="submit" className={previewPrimary}>
          Save collection to preview
        </button>
      </div>
    </form>
  );
}
