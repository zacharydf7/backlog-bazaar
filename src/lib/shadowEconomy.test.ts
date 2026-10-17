import { describe, it, expect } from "vitest";
import {
  clampShadowConfig,
  DEFAULT_SHADOW_CONFIG,
  rowToShadowAdjustment,
  rowToShadowConfig,
  rowToShadowPlayer,
  shadowStandingLabel,
  type ShadowPlayer,
} from "./shadowEconomy";

const player = (over: Partial<ShadowPlayer> = {}): ShadowPlayer => ({
  userId: "u",
  displayName: "Pat",
  overrideMode: null,
  overridePct: null,
  overrideNote: null,
  pct: 0,
  source: null,
  recentClears: 10,
  verifiedClears: 9,
  adjustedCoins: 0,
  adjustments: 0,
  ...over,
});

describe("shadow economy rows", () => {
  it("maps the config, defaulting what's missing", () => {
    expect(rowToShadowConfig({ enabled: true, buff_pct: 15 })).toEqual({
      ...DEFAULT_SHADOW_CONFIG,
      enabled: true,
      buffPct: 15,
    });
  });

  it("maps a player's standing and override", () => {
    expect(
      rowToShadowPlayer({
        user_id: "u1",
        display_name: "CptFrybeard",
        override_mode: "nerf",
        override_pct: 20,
        override_note: "zero-time batch",
        pct: -20,
        source: "override",
        recent_clears: 10,
        verified_clears: 2,
        adjusted_coins: -120,
        adjustments: 3,
      }),
    ).toMatchObject({ overrideMode: "nerf", overridePct: 20, pct: -20, source: "override", adjustedCoins: -120 });
    expect(rowToShadowPlayer({ user_id: "u2", override_mode: "bogus" }).overrideMode).toBeNull();
  });

  it("maps an adjustment", () => {
    expect(
      rowToShadowAdjustment({
        id: "a",
        created_at: "2026-10-17T12:00:00Z",
        display_name: "Pat",
        game_title: "Doom",
        kind: "reversed",
        source: "auto",
        pct: 10,
        base: 300,
        adjusted: 330,
        delta: -30,
      }),
    ).toMatchObject({ kind: "reversed", base: 300, adjusted: 330, delta: -30 });
  });
});

describe("clampShadowConfig", () => {
  it("keeps every value inside the database's bounds", () => {
    expect(
      clampShadowConfig({ enabled: true, buffPct: 150, nerfPct: -5, windowClears: 0, minClears: 1000, verifiedShare: 80.6 }),
    ).toEqual({ enabled: true, buffPct: 100, nerfPct: 0, windowClears: 1, minClears: 100, verifiedShare: 81 });
  });
});

describe("shadowStandingLabel", () => {
  it("names an automatic buff, an admin override, an exemption, or nothing", () => {
    expect(shadowStandingLabel(player({ pct: 10, source: "auto" }))).toBe("+10% · engaged · 9/10 verified");
    expect(shadowStandingLabel(player({ pct: -20, source: "override", overrideMode: "nerf" }))).toBe(
      "-20% · set by an admin · 9/10 verified",
    );
    expect(shadowStandingLabel(player({ source: "override", overrideMode: "exempt" }))).toBe(
      "Exempt · 9/10 verified",
    );
    expect(shadowStandingLabel(player())).toBe("No adjustment · 9/10 verified");
  });
});
