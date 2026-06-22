// Consoles a player can own, each mapped to the RAWG platform id(s) used to
// filter discovery queries.
export interface PlatformDef {
  id: string;
  label: string;
  rawgIds: number[];
}

export const PLATFORMS: PlatformDef[] = [
  { id: "pc", label: "PC", rawgIds: [4] },
  { id: "ps5", label: "PlayStation 5", rawgIds: [187] },
  { id: "ps4", label: "PlayStation 4", rawgIds: [18] },
  { id: "xbox-series", label: "Xbox Series X/S", rawgIds: [186] },
  { id: "xbox-one", label: "Xbox One", rawgIds: [1] },
  { id: "switch", label: "Nintendo Switch", rawgIds: [7] },
];

/** RAWG platform ids for a set of owned platform ids. */
export function rawgIdsFor(ownedIds: string[]): number[] {
  const set = new Set(ownedIds);
  return PLATFORMS.filter((p) => set.has(p.id)).flatMap((p) => p.rawgIds);
}

/** True if a label matches one of the built-in platforms (case-insensitive). */
export function isBuiltInPlatformLabel(label: string): boolean {
  const l = label.trim().toLowerCase();
  return PLATFORMS.some((p) => p.label.toLowerCase() === l);
}

/** The platform *labels* a player owns: the built-in consoles they've selected
 *  (by id) plus any custom platforms they've added. Used to populate the
 *  platform options when adding/editing a game's copies. Order: built-ins first
 *  (in PLATFORMS order), then customs in their stored order. Deduped by label. */
export function ownedPlatformLabels(ownedIds: string[], customPlatforms: string[]): string[] {
  const set = new Set(ownedIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of PLATFORMS) {
    if (set.has(p.id) && !seen.has(p.label.toLowerCase())) {
      seen.add(p.label.toLowerCase());
      out.push(p.label);
    }
  }
  for (const label of customPlatforms) {
    const t = label.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

/** Merge platform-label lists into one: trimmed, blanks dropped, de-duplicated
 *  case-insensitively (keeping the first spelling seen), order preserved. Used to
 *  edit a game's platforms and to fold in the shared catalog's contributions. */
export function mergePlatforms(...lists: (string[] | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list ?? []) {
      const t = raw.trim();
      const key = t.toLowerCase();
      if (t && !seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    }
  }
  return out;
}
