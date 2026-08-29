import { describe, it, expect } from "vitest";
import { isLocalCover, originalCoverTarget } from "./covers";

describe("isLocalCover", () => {
  it("is true for a cover uploaded into our 'covers' storage bucket", () => {
    expect(
      isLocalCover(
        "https://abc.supabase.co/storage/v1/object/public/covers/u123/g456.jpg?v=1",
      ),
    ).toBe(true);
  });

  it("is false for a remote catalog/RAWG default cover", () => {
    expect(isLocalCover("https://media.rawg.io/media/games/abc/cover.jpg")).toBe(false);
  });

  it("is false for an avatar/attachment URL in a different bucket", () => {
    expect(
      isLocalCover("https://abc.supabase.co/storage/v1/object/public/avatars/u123/avatar.jpg"),
    ).toBe(false);
  });

  it("is false for null/undefined/empty", () => {
    expect(isLocalCover(null)).toBe(false);
    expect(isLocalCover(undefined)).toBe(false);
    expect(isLocalCover("")).toBe(false);
  });
});

describe("originalCoverTarget", () => {
  const igdbArt = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg";
  const rawgArt = "https://media.rawg.io/media/games/abc/cover.jpg";

  it("prefers the stored write-once original over a live RAWG fetch", () => {
    // The regression: an IGDB-added card that later GAINED a rawgId via the
    // identity crosswalk must restore to ITS original art, not RAWG's.
    expect(originalCoverTarget({ originalImage: igdbArt, rawgId: 46667 }, rawgArt)).toBe(igdbArt);
  });

  it("falls back to the live RAWG cover only for legacy rows with no original", () => {
    expect(originalCoverTarget({ originalImage: null, rawgId: 46667 }, rawgArt)).toBe(rawgArt);
    expect(originalCoverTarget({ rawgId: 46667 }, rawgArt)).toBe(rawgArt);
  });

  it("offers nothing for a card with no original and no rawg identity", () => {
    expect(originalCoverTarget({ originalImage: null, rawgId: null }, rawgArt)).toBeUndefined();
    expect(originalCoverTarget({}, undefined)).toBeUndefined();
  });
});
