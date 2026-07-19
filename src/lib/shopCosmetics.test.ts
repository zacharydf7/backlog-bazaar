import { describe, expect, it } from "vitest";
import {
  FRAME_STYLES,
  SEEDED_FRAME_KEYS,
  SEEDED_STALL_KEYS,
  STALL_STYLES,
  resolveFrameStyle,
  resolveStallStyle,
} from "./shopCosmetics";

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
