import { describe, it, expect } from "vitest";
import { isLocalCover } from "./covers";

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
