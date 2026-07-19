import { describe, expect, it } from "vitest";
import {
  FRAME_STYLES,
  SEEDED_FRAME_KEYS,
  SEEDED_STALL_KEYS,
  STALL_STYLES,
  resolveFrameStyle,
  resolveStallStyle,
} from "./shopCosmetics";
import { FRAME_ORNAMENT_KEYS, STALL_ORNAMENT_KEYS } from "../components/CosmeticOrnaments";

// Well-formedness guard (the PERMISSIONS-catalog pattern): every registry entry
// is renderable, and every style key the schema.sql seed references exists here
// so the SQL seed and the client registry can't drift silently.

describe("cosmetic style registries", () => {
  it("frame entries are well-formed with kebab-case keys", () => {
    for (const [key, style] of Object.entries(FRAME_STYLES)) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(style.label.trim().length).toBeGreaterThan(0);
      expect(style.className.trim().length).toBeGreaterThan(0);
    }
  });

  it("stall entries are well-formed with kebab-case keys", () => {
    for (const [key, style] of Object.entries(STALL_STYLES)) {
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(style.label.trim().length).toBeGreaterThan(0);
      expect(style.cardClassName.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers every style key the schema seed references", () => {
    for (const key of SEEDED_FRAME_KEYS) expect(FRAME_STYLES[key], `frame ${key}`).toBeTruthy();
    for (const key of SEEDED_STALL_KEYS) expect(STALL_STYLES[key], `stall ${key}`).toBeTruthy();
  });

  it("every declared ornament has a renderer in CosmeticOrnaments", () => {
    for (const [key, style] of Object.entries(FRAME_STYLES)) {
      if (style.ornament) expect(FRAME_ORNAMENT_KEYS, `frame ${key}`).toContain(style.ornament);
    }
    for (const [key, style] of Object.entries(STALL_STYLES)) {
      if (style.ornament) expect(STALL_ORNAMENT_KEYS, `stall ${key}`).toContain(style.ornament);
    }
  });

  it("ornamented stall styles position their own overlay context", () => {
    // Hosts render StallOrnament as a plain child — the style's classes must
    // carry `relative overflow-hidden` for the absolute layers to sit right,
    // and `isolate` so the card-scale negative-z decoration layer stays above
    // the card's own background while sitting behind names and avatars.
    for (const [key, style] of Object.entries(STALL_STYLES)) {
      if (!style.ornament) continue;
      expect(style.cardClassName, `stall ${key}`).toContain("relative");
      expect(style.cardClassName, `stall ${key}`).toContain("overflow-hidden");
      expect(style.cardClassName, `stall ${key}`).toContain("isolate");
    }
  });
});

describe("resolvers", () => {
  it("resolve known keys", () => {
    expect(resolveFrameStyle("gilded")).toBe(FRAME_STYLES.gilded);
    expect(resolveStallStyle("snowfall")).toBe(STALL_STYLES.snowfall);
  });

  it("degrade unknown/null keys to null instead of crashing", () => {
    expect(resolveFrameStyle("not-a-style")).toBeNull();
    expect(resolveFrameStyle(null)).toBeNull();
    expect(resolveFrameStyle(undefined)).toBeNull();
    expect(resolveStallStyle("not-a-style")).toBeNull();
    expect(resolveStallStyle("")).toBeNull();
  });
});
