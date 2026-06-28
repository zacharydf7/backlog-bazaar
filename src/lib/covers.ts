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
