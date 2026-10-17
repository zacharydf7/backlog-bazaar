import { describe, it, expect } from "vitest";
import {
  coercePersonalScreenshots,
  coversPathFromUrl,
  personalShotPath,
} from "./personalScreenshots";

describe("personal screenshots (86fc0b4b)", () => {
  it("stores each shot in the player's covers folder, named by game and time", () => {
    expect(personalShotPath("u1", "g1", 1700)).toBe("u1/g1-shot-1700.jpg");
  });

  it("maps a covers public URL back to its path, dropping the cache-buster", () => {
    expect(
      coversPathFromUrl(
        "https://x.supabase.co/storage/v1/object/public/covers/u1/g1-shot-1700.jpg?v=9",
      ),
    ).toBe("u1/g1-shot-1700.jpg");
  });

  it("returns null for a URL outside the covers bucket", () => {
    expect(coversPathFromUrl("https://x.supabase.co/storage/v1/object/public/catalog/u1/a.jpg")).toBeNull();
    expect(coversPathFromUrl("https://images.igdb.com/a.jpg")).toBeNull();
  });

  it("coerces a stored value into a URL list", () => {
    expect(coercePersonalScreenshots(["a", "", 3, "b"])).toEqual(["a", "b"]);
    expect(coercePersonalScreenshots(null)).toEqual([]);
  });
});
