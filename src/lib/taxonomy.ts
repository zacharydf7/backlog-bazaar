// Pure helpers for the controlled taxonomy — the admin-curated master lists of
// Platforms and Genres. The lists are loaded into the store from the backend and
// drive every taxonomy dropdown. These helpers match free or imported (RAWG)
// values against a master list case-insensitively and return the canonical
// spelling, so stored data stays clean. The server triggers are the source of
// truth (they reject off-list writes); canonicalizing here keeps the client from
// ever sending one — e.g. a RAWG genre that isn't (yet) on the list is dropped at
// import rather than blocking the save.

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

/** Sort a master list for display: case-insensitive alphabetical. */
export function sortTerms(master: string[]): string[] {
  return [...master].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
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
