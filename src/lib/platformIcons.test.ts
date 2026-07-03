import { describe, it, expect } from "vitest";
import { platformTagSpec, platformShorthand } from "./platformIcons";
import { DEFAULT_PLATFORM_NAMES } from "./taxonomy";

describe("platformTagSpec", () => {
  it("maps generational brands to one glyph plus a short tag", () => {
    const ps5 = platformTagSpec("PlayStation 5");
    const ps4 = platformTagSpec("PlayStation 4");
    expect(ps5.kind).toBe("icon");
    expect(ps4.kind).toBe("icon");
    if (ps5.kind === "icon" && ps4.kind === "icon") {
      expect(ps5.path).toBe(ps4.path); // same monogram…
      expect(ps5.suffix).toBe("5"); // …distinguished by the tag
      expect(ps4.suffix).toBe("4");
    }
    const xsx = platformTagSpec("Xbox Series X/S");
    expect(xsx.kind === "icon" && xsx.suffix).toBe("X|S");
  });

  it("gives base-generation brands the bare glyph", () => {
    const sw = platformTagSpec("Nintendo Switch");
    expect(sw.kind).toBe("icon");
    expect(sw.kind === "icon" && sw.suffix).toBeUndefined();
    const ps = platformTagSpec("PlayStation");
    expect(ps.kind === "icon" && ps.suffix).toBeUndefined();
  });

  it("is case-insensitive on the canonical names", () => {
    expect(platformTagSpec("nintendo switch").kind).toBe("icon");
    expect(platformTagSpec("XBOX ONE").kind).toBe("icon");
  });

  it("falls back to a shorthand text pill for unmapped platforms", () => {
    expect(platformTagSpec("Sega Dreamcast")).toEqual({ kind: "text", short: "SD" });
    expect(platformTagSpec("3DO")).toEqual({ kind: "text", short: "3DO" });
  });

  it("resolves every seeded taxonomy platform to a compact tag", () => {
    for (const name of DEFAULT_PLATFORM_NAMES) {
      const spec = platformTagSpec(name);
      if (spec.kind === "text") {
        // Fallback pills must actually be compact — that's their whole point.
        expect(spec.short.length, name).toBeLessThanOrEqual(5);
        expect(spec.short.length, name).toBeGreaterThan(0);
      } else {
        expect(spec.path.length, name).toBeGreaterThan(0);
      }
    }
  });
});

describe("platformShorthand", () => {
  it("passes short names through untouched", () => {
    expect(platformShorthand("Wii")).toBe("Wii");
    expect(platformShorthand("Wii U")).toBe("Wii U");
    expect(platformShorthand("SNES")).toBe("SNES");
  });

  it("applies the well-known abbreviations", () => {
    expect(platformShorthand("Game Boy Advance")).toBe("GBA");
    expect(platformShorthand("Nintendo 64")).toBe("N64");
    expect(platformShorthand("Nintendo 3DS")).toBe("3DS");
    expect(platformShorthand("Nintendo DS")).toBe("DS");
  });

  it("condenses unknown long names to their capitals and digits", () => {
    expect(platformShorthand("Sega Dreamcast")).toBe("SD");
    expect(platformShorthand("Atari Jaguar 64")).toBe("AJ64");
  });

  it("truncates when a long name has no capitals to condense", () => {
    expect(platformShorthand("homebrew handheld")).toBe("homeb");
  });
});
