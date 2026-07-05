// Pure logic for the "Export my data" account action: assemble the user's
// collection + profile into one serializable object and name the download file.
// Kept free of React/Supabase/browser APIs so it's unit-tested offline; the
// component does only the (browser-only) Blob download around these helpers.

import type { Game, Compilation } from "../types";
import type { GameListFolder, GameListItem, GameListSummary } from "./gameLists";

/** Bumped if the export shape changes, so a future importer can branch on it.
 *  v2 added custom game lists (`lists` + `listFolders`). */
export const EXPORT_SCHEMA_VERSION = 2;

/** A custom list with its items inlined, as the export carries it. */
export interface ExportedGameList extends GameListSummary {
  items: GameListItem[];
}

export interface LibraryExportInput {
  displayName: string | null;
  email: string | null;
  coins: number;
  vouchers: number;
  platforms: string[];
  games: Game[];
  compilations: Compilation[];
  /** Custom lists + folders (cloud-only; omitted → empty arrays). */
  lists?: ExportedGameList[];
  listFolders?: GameListFolder[];
  /** Injected for deterministic tests; defaults to now. */
  now?: Date;
}

export interface LibraryExport {
  app: "Backlog Bazaar";
  schemaVersion: number;
  exportedAt: string;
  profile: {
    displayName: string | null;
    email: string | null;
    platforms: string[];
  };
  economy: { coins: number; vouchers: number };
  games: Game[];
  compilations: Compilation[];
  lists: ExportedGameList[];
  listFolders: GameListFolder[];
}

/** Assemble a user's exportable data into one plain, serializable object. */
export function buildLibraryExport(input: LibraryExportInput): LibraryExport {
  const now = input.now ?? new Date();
  return {
    app: "Backlog Bazaar",
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    profile: {
      displayName: input.displayName,
      email: input.email,
      platforms: input.platforms,
    },
    economy: { coins: input.coins, vouchers: input.vouchers },
    games: input.games,
    compilations: input.compilations,
    lists: input.lists ?? [],
    listFolders: input.listFolders ?? [],
  };
}

/** Pretty-printed JSON for the download. */
export function serializeExport(data: LibraryExport): string {
  return JSON.stringify(data, null, 2);
}

/** Download filename, e.g. "backlog-bazaar-export-2026-07-04.json". */
export function exportFilename(now: Date = new Date()): string {
  return `backlog-bazaar-export-${now.toISOString().slice(0, 10)}.json`;
}
