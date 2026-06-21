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
