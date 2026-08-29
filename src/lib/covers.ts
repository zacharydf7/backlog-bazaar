// Cover-art helpers shared by the privacy gate and the reporting affordance.
//
// A "local custom cover" is one a user uploaded themselves: setGameImage (in
// store.ts) stores the blob in the 'covers' storage bucket and points game.image
// at its public URL, which always contains the `/covers/` path segment. Every
// other cover (a RAWG/catalog default, or one reverted via restoreGameImage) is a
// remote URL that never points into that bucket. The server enforces the
// friend-gate in player_library using the same test (`image like '%/covers/%'`);
// this mirror lets the client decide where to show the "Report image" affordance
// and honour the opt-out on message embeds. Kept pure so it's unit-tested offline.

/** True if `url` is a user-uploaded cover stored in our 'covers' bucket (i.e. an
 *  unmoderated local override), as opposed to a global/catalog default. */
export function isLocalCover(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes("/covers/");
}

/** The cover "Restore original" reverts to: the art the card SHIPPED with.
 *  The stored write-once original_image is authoritative; a live RAWG re-fetch
 *  is only the fallback for legacy rows that predate original tracking.
 *  (It used to be the other way round whenever a rawgId existed — wrong for an
 *  IGDB-added card that later GAINED a rawgId through the identity crosswalk:
 *  restoring fetched foreign RAWG art, which then read as a personal
 *  customization and shielded the card from catalog cover updates.) */
export function originalCoverTarget(
  game: { originalImage?: string | null; rawgId?: number | null },
  liveRawgCover: string | undefined,
): string | undefined {
  return game.originalImage ?? (game.rawgId ? liveRawgCover : undefined);
}
