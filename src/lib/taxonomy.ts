// Pure helpers for the controlled taxonomy — the admin-curated master lists of
// Platforms and Genres. The lists are loaded into the store from the backend and
// drive every taxonomy dropdown. These helpers match free or imported (RAWG)
// values against a master list case-insensitively and return the canonical
// spelling, so stored data stays clean. The server triggers are the source of
// truth (they reject off-list writes); canonicalizing here keeps the client from
// ever sending one — e.g. a RAWG genre that isn't (yet) on the list is dropped at
// import rather than blocking the save.

/** Outcome of removing a master-list term. `in_use` means the term is still
 *  referenced somewhere, so the caller should offer to replace it before removing
 *  (see `admin_replace_*` / the Taxonomy manager's replace flow). */
export type TaxonomyRemoveResult = "removed" | "in_use" | "error";

/** A term's canonical spelling from the master list (case-insensitive, trimmed),
 *  or null when it isn't on the list. */
export function canonicalTerm(value: string, master: string[]): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  for (const m of master) if (m.trim().toLowerCase() === v) return m;
  return null;
}

/** Whether a term is on the master list (case-insensitive, trimmed). */
export function isKnownTerm(value: string, master: string[]): boolean {
  return canonicalTerm(value, master) !== null;
}

/** Filter a list of terms to those on the master list, mapped to their canonical
 *  spelling and de-duplicated (first occurrence wins, order preserved). Unknown
 *  terms are dropped — used to canonicalize imported values before they're stored
 *  so they can never trip the server's off-list rejection. */
export function canonicalizeTerms(values: string[] | undefined, master: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values ?? []) {
    const c = canonicalTerm(raw, master);
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      out.push(c);
    }
  }
  return out;
}

/** The platforms a user chose for their copies that are valid master-list terms
 *  but NOT in the game's verified release list — i.e. the platforms worth
 *  suggesting be added to the catalog. Canonical spelling, case-insensitive,
 *  de-duplicated. Off-master values are dropped (the catalog would reject them
 *  anyway). Used by the Add-Game "Missing platform?" escape hatch. */
export function missingFromVerified(
  chosen: string[],
  verified: string[] | undefined,
  master: string[],
): string[] {
  const verifiedSet = new Set(
    canonicalizeTerms(verified, master).map((p) => p.toLowerCase()),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of chosen) {
    const canon = canonicalTerm(c, master);
    if (!canon) continue;
    const lo = canon.toLowerCase();
    if (verifiedSet.has(lo) || seen.has(lo)) continue;
    seen.add(lo);
    out.push(canon);
  }
  return out;
}

/** Like `missingFromVerified`, but only the platforms a user *just* added to
 *  their copies (vs. the copies that were already there) — so re-saving a game
 *  whose copy sits on a grandfathered off-list platform doesn't re-file a
 *  suggestion every time. Used by the Edit-Game "Missing platform?" escape hatch,
 *  where the game (and some of its copies) already exist. */
export function newlyMissingPlatforms(
  current: string[],
  original: string[],
  verified: string[] | undefined,
  master: string[],
): string[] {
  const originalSet = new Set(original.map((p) => p.trim().toLowerCase()));
  const added = current.filter((p) => !originalSet.has(p.trim().toLowerCase()));
  return missingFromVerified(added, verified, master);
}

/** Sort a master list for display: case-insensitive alphabetical. */
export function sortTerms(master: string[]): string[] {
  return [...master].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Case-insensitive, order-preserving, de-duplicated replace of one term with
 *  another inside a term list. Mirrors the SQL `jsonb_text_array_replace` used by
 *  the replace RPCs, so the client view matches the server rewrite after a
 *  taxonomy term is replaced. Returns the input unchanged when it's undefined. */
export function renameTerm(
  arr: string[] | undefined,
  oldName: string,
  newName: string,
): string[] | undefined {
  if (!arr) return arr;
  const lo = oldName.trim().toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const t = v.toLowerCase() === lo ? newName : v;
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** The platform options to offer for a game's owned copies. When the game lists
 *  the platforms it released on, restrict the choices to those (canonicalized to
 *  the master list) — you can't own a copy on a platform the game never shipped on
 *  — otherwise fall back to the whole master list. Any platform already on a copy
 *  is always kept (even a legacy off-list value), so editing never drops it.
 *  Case-insensitive, de-duplicated, sorted. */
export function copyPlatformOptions(
  gamePlatforms: string[] | undefined,
  master: string[],
  existing: string[] = [],
): string[] {
  const fromGame = canonicalizeTerms(gamePlatforms, master);
  const base = fromGame.length > 0 ? fromGame : master;
  const out = [...base];
  const seen = new Set(out.map((p) => p.toLowerCase()));
  for (const e of existing) {
    const t = e.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return sortTerms(out);
}

// Offline/local-mode defaults, mirroring the schema seed so the dropdowns work
// without the backend. The cloud loads the live (admin-curated) lists over these.
export const DEFAULT_PLATFORM_NAMES: string[] = [
  "PC",
  "PlayStation 5",
  "PlayStation 4",
  "Xbox Series X/S",
  "Xbox One",
  "Nintendo Switch",
  "PlayStation 3",
  "PlayStation 2",
  "PlayStation",
  "PS Vita",
  "PSP",
  "Xbox 360",
  "Xbox",
  "Wii U",
  "Wii",
  "Nintendo 3DS",
  "Nintendo DS",
  "GameCube",
  "Nintendo 64",
  "Game Boy Advance",
  "SNES",
  "NES",
  "macOS",
  "Linux",
  "iOS",
  "Android",
  "Web",
];

export const DEFAULT_GENRE_NAMES: string[] = [
  "Action",
  "Indie",
  "Adventure",
  "RPG",
  "Strategy",
  "Shooter",
  "Casual",
  "Simulation",
  "Puzzle",
  "Arcade",
  "Platformer",
  "Racing",
  "Massively Multiplayer",
  "Sports",
  "Fighting",
  "Family",
  "Board Games",
  "Card",
  "Educational",
];
