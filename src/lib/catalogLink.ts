// "Same game as…" (issue 52f98b68): a moderator ties a community catalog entry
// to the IGDB game it duplicates and picks which side is primary. This is the
// pure merge the link writes — the primary's non-empty values win and the other
// side fills its gaps. The server (link_catalog_game_provider) stores the result.
import type { GameMeta } from "../types";
import { canonicalizeCatalogTerms, normalizeCatalogFields, type CatalogFields } from "./submissions";

/** Which side of a link wins a field both sides have. */
export type LinkPrimary = "catalog" | "provider";

/** The fields a link merges. Screenshots and the live-service flag stay as the
 *  catalog has them — IGDB search results carry neither. */
export const LINKED_FIELDS = ["title", "image", "platforms", "genres", "developers", "released", "hours"] as const;
export type LinkedField = (typeof LINKED_FIELDS)[number];

export interface LinkedMerge {
  fields: CatalogFields;
  /** Where each merged value came from; null when neither side has one. */
  sources: Record<LinkedField, LinkPrimary | null>;
}

/** What linking would touch, from preview_catalog_provider_link. */
export interface CatalogLinkPreview {
  communityCopies: number;
  igdbCopiesToAdopt: number;
  conflict: string | null;
}

const copies = (n: number) => `${n} ${n === 1 ? "copy" : "copies"}`;

/** The toast after a link, from the RPC's counts. */
export function linkResultMessage(adopted: number, stamped: number): string {
  return `Linked. ${copies(adopted)} adopted, ${stamped} stamped.`;
}

/** The toast after an unlink: what went back, and what had changed since. */
export function unlinkResultMessage(reverted: number, skipped: number): string {
  const did = `Unlinked. ${copies(reverted)} restored`;
  return skipped ? `${did}, ${skipped} left as they were (changed since).` : `${did}.`;
}

function isGap(v: CatalogFields[LinkedField]): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  return Array.isArray(v) && v.length === 0;
}

/** An IGDB search result as catalog fields. Platforms and genres are mapped onto
 *  the master taxonomy (off-list terms dropped), since the catalog's term trigger
 *  rejects anything else. */
export function providerCatalogFields(
  meta: GameMeta,
  genreList: string[],
  platformList: string[],
): CatalogFields {
  return canonicalizeCatalogTerms(
    {
      title: meta.title,
      image: meta.image ?? "",
      platforms: meta.platforms ?? [],
      genres: meta.genres ?? [],
      developers: meta.developers ?? [],
      released: meta.released ?? "",
      hours: meta.hours ?? null,
      screenshots: [],
      isLiveService: false,
    },
    genreList,
    platformList,
  );
}

/** Merge a community entry with its IGDB game: per field, the primary side's
 *  value when it has one, else the other side's. Empty strings, null and []
 *  are gaps. Screenshots and the live-service flag are the catalog's. */
export function mergeLinkedFields(
  catalog: CatalogFields,
  provider: CatalogFields,
  primary: LinkPrimary,
): LinkedMerge {
  const sides = { catalog: normalizeCatalogFields(catalog), provider: normalizeCatalogFields(provider) };
  const other: LinkPrimary = primary === "catalog" ? "provider" : "catalog";
  const fields = { ...sides.catalog };
  const sources = {} as Record<LinkedField, LinkPrimary | null>;
  for (const key of LINKED_FIELDS) {
    const from = !isGap(sides[primary][key]) ? primary : !isGap(sides[other][key]) ? other : null;
    sources[key] = from;
    if (from) Object.assign(fields, { [key]: sides[from][key] });
  }
  return { fields, sources };
}
