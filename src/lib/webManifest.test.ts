// @vitest-environment node
//
// The installable app (issue fae311ea): a home-screen launch on Android only
// takes the theme's colors for the phone's bars with a valid web manifest.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** A PNG's pixel size, from its IHDR chunk (after checking it is a PNG). */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect(b.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(b.toString("ascii", 12, 16)).toBe("IHDR");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("web app manifest", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

  it("opens full screen in the default theme's colors", () => {
    expect(manifest).toMatchObject({ id: "/", name: "Backlog Bazaar", start_url: "/", display: "standalone" });
    // Midnight's --canvas, the same default as index.html's theme-color.
    const canvas = readFileSync("src/index.css", "utf8").match(/--canvas:\s*(#[0-9a-f]{6})/i)![1];
    expect(manifest.theme_color).toBe(canvas);
    expect(manifest.background_color).toBe(canvas);
  });

  it("ships the 192px and 512px icons installing needs, as real PNGs of that size", () => {
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((i: { sizes: string }) => i.sizes === `${size}x${size}`);
      expect(icon).toBeTruthy();
      expect(pngSize(`public${icon.src}`)).toEqual([size, size]);
    }
  });

  it("is linked from the page", () => {
    expect(readFileSync("index.html", "utf8")).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
  });
});
