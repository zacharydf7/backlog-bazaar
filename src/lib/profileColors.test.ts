import { describe, it, expect } from "vitest";
import {
  normalizeHex,
  mixHex,
  relativeLuminance,
  isLightColor,
  PROFILE_PRESETS,
  matchPreset,
  profileColorVars,
} from "./profileColors";
import { THEMES } from "./theme";

describe("normalizeHex", () => {
  it("lowercases a 6-digit hex", () => {
    expect(normalizeHex("#A855F7")).toBe("#a855f7");
  });
  it("expands a 3-digit hex", () => {
    expect(normalizeHex("#fa0")).toBe("#ffaa00");
  });
  it("trims whitespace", () => {
    expect(normalizeHex("  #131a2b ")).toBe("#131a2b");
  });
  it("rejects garbage, blanks and null", () => {
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("131a2b")).toBeNull();
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
    expect(normalizeHex(undefined)).toBeNull();
  });
});

describe("mixHex", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    expect(mixHex("#131a2b", "#ffffff", 0)).toBe("#131a2b");
    expect(mixHex("#131a2b", "#ffffff", 1)).toBe("#ffffff");
  });
  it("mixes midway", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("clamps t outside [0,1]", () => {
    expect(mixHex("#000000", "#ffffff", 2)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", -1)).toBe("#000000");
  });
});

describe("relativeLuminance / isLightColor", () => {
  it("has the poles right", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
  });
  it("treats white as light and near-black as dark", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#131a2b")).toBe(false);
  });
  it("puts mid-gray on the dark-text side (WCAG crossover)", () => {
    // Black text on #808080 has higher contrast than white text.
    expect(isLightColor("#808080")).toBe(true);
  });
});

describe("PROFILE_PRESETS", () => {
  it("leads with Classic (no override)", () => {
    expect(PROFILE_PRESETS[0]).toEqual({ id: "classic", name: "Classic", bg: null, accent: null });
  });
  it("mirrors every app theme as a bg+accent pair", () => {
    for (const t of THEMES) {
      const p = PROFILE_PRESETS.find((x) => x.id === t.id);
      expect(p, t.id).toBeDefined();
      expect(p!.name).toBe(t.name);
      expect(p!.bg).toBe(t.swatches[0]);
      expect(p!.accent).toBe(t.swatches[3]);
    }
  });
  it("has unique ids and valid colors", () => {
    const ids = PROFILE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROFILE_PRESETS.slice(1)) {
      expect(normalizeHex(p.bg), p.id).not.toBeNull();
      expect(normalizeHex(p.accent), p.id).not.toBeNull();
    }
  });
});

describe("matchPreset", () => {
  it("matches Classic for both-null", () => {
    expect(matchPreset(null, null)?.id).toBe("classic");
  });
  it("matches a theme pair case-insensitively", () => {
    const mana = PROFILE_PRESETS.find((p) => p.id === "mana")!;
    expect(matchPreset(mana.bg!.toUpperCase(), mana.accent)?.id).toBe("mana");
  });
  it("returns null for a custom mix", () => {
    expect(matchPreset("#123456", "#abcdef")).toBeNull();
    expect(matchPreset("#131a2b", null)).toBeNull();
  });
});

describe("profileColorVars", () => {
  it("is empty when nothing is set (theme untouched)", () => {
    expect(profileColorVars(null, null)).toEqual({});
    expect(profileColorVars(undefined, undefined)).toEqual({});
    expect(profileColorVars("not-a-color", "nope")).toEqual({});
  });

  it("derives a dark palette with light ink from a dark background", () => {
    const vars = profileColorVars("#131a2b", null) as Record<string, string>;
    expect(vars["--canvas"]).toBe("#131a2b");
    expect(vars.colorScheme).toBe("dark");
    // Ink must be readable: far lighter than the background.
    expect(relativeLuminance(vars["--ink"])).toBeGreaterThan(0.6);
    // Panels rise from the canvas, like the built-in dark themes.
    expect(relativeLuminance(vars["--panel"])).toBeGreaterThan(relativeLuminance("#131a2b"));
    // No accent override without an accent.
    expect(vars["--accent"]).toBeUndefined();
    expect(vars["--brand"]).toBeUndefined();
  });

  it("derives a light palette with dark ink from a light background", () => {
    const vars = profileColorVars("#efe7d6", null) as Record<string, string>;
    expect(vars.colorScheme).toBe("light");
    expect(relativeLuminance(vars["--ink"])).toBeLessThan(0.2);
    // Surface lifts toward white, panel dips darker — the built-in light-theme shape.
    expect(relativeLuminance(vars["--surface"])).toBeGreaterThan(relativeLuminance("#efe7d6"));
    expect(relativeLuminance(vars["--panel"])).toBeLessThan(relativeLuminance("#efe7d6"));
  });

  it("colors accent chrome AND buttons from the accent, with contrasted button text", () => {
    const dark = profileColorVars(null, "#131a2b") as Record<string, string>;
    expect(dark["--accent"]).toBe("#131a2b");
    expect(dark["--brand"]).toBe("#131a2b");
    expect(dark["--brand-fg"]).toBe("#ffffff");
    const light = profileColorVars(null, "#fcd34d") as Record<string, string>;
    expect(light["--brand-fg"]).toBe("#15181f");
    // Accent-only leaves the neutral palette to the theme.
    expect(light["--canvas"]).toBeUndefined();
    expect(light["--ink"]).toBeUndefined();
  });

  it("resolves curated accent ids (legacy stored values)", () => {
    const vars = profileColorVars(null, "gold") as Record<string, string>;
    expect(vars["--accent"]).toBe("#f59e0b");
  });

  it("keeps every preset readable: ink vs background ≥ 4.5:1", () => {
    const contrast = (a: string, b: string) => {
      const la = relativeLuminance(a);
      const lb = relativeLuminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    for (const p of PROFILE_PRESETS.slice(1)) {
      const vars = profileColorVars(p.bg, p.accent) as Record<string, string>;
      expect(contrast(vars["--ink"], vars["--canvas"]), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars["--ink"], vars["--panel"]), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars["--brand-fg"], vars["--brand"]), p.id).toBeGreaterThanOrEqual(3);
    }
  });
});
