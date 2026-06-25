// Pure logic for community catalog contributions: the editable metadata shape,
// validation, and the field-level diff the admin queue renders. Kept free of
// React/Supabase so it's directly unit-tested.
import { mergePlatforms } from "./platforms";
import type { GameMeta, GameSubmission } from "../types";

/** The catalog metadata a user can propose changing (edit) or filling in (new).
 *  Mirrors catalog_games / game_submissions in the schema. */
export interface CatalogFields {
  title: string;
  image: string; // cover art URL ("" when none)
  platforms: string[];
  genres: string[];
  developers: string[]; // studio(s) that made the game ([] when unknown)
  released: string; // ISO date "YYYY-MM-DD" ("" when unknown)
  hours: number | null; // estimated playtime in hours (null when unknown)
  screenshots: string[]; // ordered preview image URLs ([] when none)
}

/** The most screenshots a single contribution may propose (keeps the gallery
 *  small and storage bounded). "A few" per the product intent. */
export const MAX_SCREENSHOTS = 6;

export type CatalogFieldKey = keyof CatalogFields;

/** Human labels for each field, used by the form and the admin diff. */
export const FIELD_LABELS: Record<CatalogFieldKey, string> = {
  title: "Title",
  image: "Cover art",
  platforms: "Platforms",
  genres: "Genres",
  developers: "Developer",
  released: "Release date",
  hours: "Estimated playtime",
  screenshots: "Screenshots",
};

/** An empty draft — the starting point for proposing a brand-new game. */
export function emptyCatalogFields(): CatalogFields {
  return { title: "", image: "", platforms: [], genres: [], developers: [], released: "", hours: null, screenshots: [] };
}

/** Trim, drop blanks, and de-duplicate a URL list while preserving order. */
function normalizeUrlList(list: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const url = (raw ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** Parse a comma-delimited developer string (e.g. "CD PROJEKT RED, CD PROJEKT")
 *  into a trimmed, de-duplicated list. Inverse of `developers.join(", ")`. */
export function parseDevelopers(text: string): string[] {
  return normalizeList(text.split(","));
}

/** Trim + dedupe (case-insensitive, first spelling kept) a label list. Reuses the
 *  platform merge so platforms and genres normalize identically. */
export function normalizeList(list: string[] | undefined): string[] {
  return mergePlatforms(list ?? []);
}

/** Canonicalize a draft so equal-but-differently-typed inputs compare equal:
 *  trim strings, normalize lists, coerce a non-finite/negative playtime to null. */
export function normalizeCatalogFields(f: CatalogFields): CatalogFields {
  const hours =
    f.hours == null || !Number.isFinite(f.hours) || f.hours < 0 ? null : f.hours;
  return {
    title: f.title.trim(),
    image: f.image.trim(),
    platforms: normalizeList(f.platforms),
    genres: normalizeList(f.genres),
    developers: normalizeList(f.developers),
    released: f.released.trim(),
    hours,
    screenshots: normalizeUrlList(f.screenshots),
  };
}

/** A single field that differs between the current value and the proposal. */
export interface FieldDiff {
  key: CatalogFieldKey;
  label: string;
  before: string; // display string of the current value
  after: string; // display string of the proposed value
}

/** Render a field's value as a display string for the diff view. */
export function displayField(key: CatalogFieldKey, f: CatalogFields): string {
  switch (key) {
    case "platforms":
    case "genres":
    case "developers":
      return f[key].length ? f[key].join(", ") : "—";
    case "hours":
      return f.hours == null ? "—" : `${f.hours}h`;
    case "released":
      return f.released || "—";
    case "image":
      return f.image || "—";
    case "title":
      return f.title || "—";
    case "screenshots":
      return f.screenshots.length
        ? `${f.screenshots.length} image${f.screenshots.length === 1 ? "" : "s"}`
        : "—";
  }
}

const ALL_KEYS: CatalogFieldKey[] = ["title", "image", "platforms", "genres", "developers", "released", "hours", "screenshots"];

/** Whether a field actually changed. Screenshots compare by their ordered URLs
 *  (so a swap/reorder counts), since their display string is only a count. */
function fieldChanged(key: CatalogFieldKey, a: CatalogFields, b: CatalogFields): boolean {
  if (key === "screenshots") return a.screenshots.join("\n") !== b.screenshots.join("\n");
  return displayField(key, a) !== displayField(key, b);
}

/** The fields whose normalized value changed between `before` and `after`. */
export function diffCatalog(before: CatalogFields, after: CatalogFields): FieldDiff[] {
  const a = normalizeCatalogFields(before);
  const b = normalizeCatalogFields(after);
  const out: FieldDiff[] = [];
  for (const key of ALL_KEYS) {
    if (fieldChanged(key, a, b)) {
      out.push({ key, label: FIELD_LABELS[key], before: displayField(key, a), after: displayField(key, b) });
    }
  }
  return out;
}

/** True when the proposal differs from the current values in at least one field. */
export function hasChanges(before: CatalogFields, after: CatalogFields): boolean {
  return diffCatalog(before, after).length > 0;
}

/** The shared catalog record for a game (its master metadata), as fetched when
 *  adding a game so approved edits become the new defaults. */
export type CatalogOverride = CatalogFields & { catalogId: string };

/** Overlay an approved catalog record onto freshly-fetched (RAWG/Wikidata) game
 *  metadata, so every approved edit — not just platforms — becomes the default
 *  when a game is added or re-added. A field is overridden only when the catalog
 *  actually has a value for it (so a catalog row that only set platforms doesn't
 *  wipe the title). Platforms are *replaced* by the catalog's list when it has
 *  any, because moderated edits can both add and remove a platform — merging
 *  would resurrect a wrong platform an editor deliberately removed. */
export function applyCatalogOverride(meta: GameMeta, c: CatalogOverride | null): GameMeta {
  if (!c) return meta;
  return {
    ...meta,
    catalogId: c.catalogId,
    title: c.title.trim() ? c.title : meta.title,
    image: c.image.trim() ? c.image : meta.image,
    genres: c.genres.length ? c.genres : meta.genres,
    developers: c.developers.length ? c.developers : meta.developers,
    released: c.released.trim() ? c.released : meta.released,
    hours: c.hours != null ? c.hours : meta.hours,
    platforms: c.platforms.length ? c.platforms : meta.platforms,
  };
}

/** Validate a proposal. Returns an error message, or null when it's submittable.
 *  `kind` is "edit" (must change something) or "new" (just needs a title). */
export function validateSubmission(
  before: CatalogFields,
  after: CatalogFields,
  kind: "edit" | "new",
): string | null {
  const f = normalizeCatalogFields(after);
  if (!f.title) return "A title is required.";
  if (f.image && !/^https?:\/\//i.test(f.image)) {
    return "Cover art must be a valid http(s) URL.";
  }
  if (f.released && Number.isNaN(Date.parse(f.released))) {
    return "Release date is invalid.";
  }
  if (after.hours != null && Number.isFinite(after.hours) && after.hours < 0) {
    return "Estimated playtime can't be negative.";
  }
  if (f.screenshots.length > MAX_SCREENSHOTS) {
    return `Up to ${MAX_SCREENSHOTS} screenshots, please.`;
  }
  if (f.screenshots.some((url) => !/^https?:\/\//i.test(url))) {
    return "Screenshots must be valid http(s) URLs.";
  }
  if (kind === "edit" && !hasChanges(before, after)) {
    return "No changes to submit yet.";
  }
  return null;
}

/** True when an approved catalog *edit* can still be rolled back to its
 *  pre-approval values. Only edits change the live catalog (a `new` approval has
 *  no prior state and may already be in players' libraries), only approved ones
 *  committed anything, and a submission can be reverted once. Mirrors the guards
 *  in the `revert_game_submission` RPC so the UI only offers what the server allows. */
export function canRevertSubmission(
  s: Pick<GameSubmission, "kind" | "status" | "deletedAt" | "revertedAt">,
): boolean {
  return (
    s.kind === "edit" &&
    s.status === "approved" &&
    s.deletedAt == null &&
    s.revertedAt == null
  );
}

/** Human one-liner for the result of a revert: which fields were rolled back and
 *  which were skipped because a later edit had changed them since approval. */
export function revertResultMessage(reverted: string[], skipped: string[]): string {
  const label = (k: string) => FIELD_LABELS[k as CatalogFieldKey] ?? k;
  const did = reverted.length
    ? `Reverted ${reverted.map(label).join(", ")}.`
    : "Nothing reverted.";
  if (!skipped.length) return did;
  return `${did} Left ${skipped.map(label).join(", ")} (changed since approval).`;
}
