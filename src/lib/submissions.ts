// Pure logic for community catalog contributions: the editable metadata shape,
// validation, and the field-level diff the admin queue renders. Kept free of
// React/Supabase so it's directly unit-tested.
import { mergePlatforms } from "./platforms";
import type { GameMeta } from "../types";

/** The catalog metadata a user can propose changing (edit) or filling in (new).
 *  Mirrors catalog_games / game_submissions in the schema. */
export interface CatalogFields {
  title: string;
  image: string; // cover art URL ("" when none)
  platforms: string[];
  genres: string[];
  released: string; // ISO date "YYYY-MM-DD" ("" when unknown)
  hours: number | null; // estimated playtime in hours (null when unknown)
}

export type CatalogFieldKey = keyof CatalogFields;

/** Human labels for each field, used by the form and the admin diff. */
export const FIELD_LABELS: Record<CatalogFieldKey, string> = {
  title: "Title",
  image: "Cover art",
  platforms: "Platforms",
  genres: "Genres",
  released: "Release date",
  hours: "Estimated playtime",
};

/** An empty draft — the starting point for proposing a brand-new game. */
export function emptyCatalogFields(): CatalogFields {
  return { title: "", image: "", platforms: [], genres: [], released: "", hours: null };
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
    released: f.released.trim(),
    hours,
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
      return f[key].length ? f[key].join(", ") : "—";
    case "hours":
      return f.hours == null ? "—" : `${f.hours}h`;
    case "released":
      return f.released || "—";
    case "image":
      return f.image || "—";
    case "title":
      return f.title || "—";
  }
}

const ALL_KEYS: CatalogFieldKey[] = ["title", "image", "platforms", "genres", "released", "hours"];

/** The fields whose normalized value changed between `before` and `after`. */
export function diffCatalog(before: CatalogFields, after: CatalogFields): FieldDiff[] {
  const a = normalizeCatalogFields(before);
  const b = normalizeCatalogFields(after);
  const out: FieldDiff[] = [];
  for (const key of ALL_KEYS) {
    const beforeStr = displayField(key, a);
    const afterStr = displayField(key, b);
    if (beforeStr !== afterStr) {
      out.push({ key, label: FIELD_LABELS[key], before: beforeStr, after: afterStr });
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
 *  wipe the title). Platforms are merged (catalog contributions fold in). */
export function applyCatalogOverride(meta: GameMeta, c: CatalogOverride | null): GameMeta {
  if (!c) return meta;
  return {
    ...meta,
    catalogId: c.catalogId,
    title: c.title.trim() ? c.title : meta.title,
    image: c.image.trim() ? c.image : meta.image,
    genres: c.genres.length ? c.genres : meta.genres,
    released: c.released.trim() ? c.released : meta.released,
    hours: c.hours != null ? c.hours : meta.hours,
    platforms: mergePlatforms(meta.platforms, c.platforms),
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
  if (kind === "edit" && !hasChanges(before, after)) {
    return "No changes to submit yet.";
  }
  return null;
}
