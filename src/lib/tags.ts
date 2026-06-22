// Tags/labels for feature & bug reports. A baked-in starter set, plus any custom
// tag a user types — which becomes available to everyone once it's on a submitted
// report (the suggestion list is derived from every request's tags). Pure so it's
// unit-tested; the TagPicker component and the store lean on it.

/** Starter tags offered to everyone. Custom tags users add join the suggestions
 *  once they've been used on a request. */
export const PREDEFINED_TAGS = [
  "mobile",
  "desktop",
  "ui/ux",
  "quality of life",
  "enhancement",
  "performance",
  "accessibility",
] as const;

export const MAX_TAGS = 6;
export const MAX_TAG_LEN = 24;

/** Canonical form of a tag: trimmed, whitespace-collapsed, lowercased. Lowercasing
 *  keeps "Mobile" and "mobile" from becoming two tags. */
export function normalizeTag(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Add a tag to a selection: normalizes, drops empties/over-long, dedupes, and
 *  caps the count. Returns a new list (unchanged if it can't be added). */
export function addTagToList(list: string[], raw: string): string[] {
  const t = normalizeTag(raw);
  if (!t || t.length > MAX_TAG_LEN) return list;
  if (list.includes(t)) return list;
  if (list.length >= MAX_TAGS) return list;
  return [...list, t];
}

/** Every distinct tag used across a set of requests (the shared catalog source). */
export function collectUsedTags(requests: { tags?: string[] }[]): string[] {
  const set = new Set<string>();
  for (const r of requests) {
    for (const t of r.tags ?? []) {
      const n = normalizeTag(t);
      if (n) set.add(n);
    }
  }
  return [...set];
}

/** Tags to offer in the picker: predefined ∪ already-used, alphabetised, minus
 *  the ones already selected. */
export function tagSuggestions(usedTags: string[], selected: string[]): string[] {
  const set = new Set<string>(PREDEFINED_TAGS);
  for (const t of usedTags) {
    const n = normalizeTag(t);
    if (n) set.add(n);
  }
  const chosen = new Set(selected.map(normalizeTag));
  return [...set].filter((t) => !chosen.has(t)).sort((a, b) => a.localeCompare(b));
}
