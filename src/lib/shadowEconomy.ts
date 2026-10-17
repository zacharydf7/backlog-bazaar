// The shadow economy (owner-designed 2026-10-17): unannounced buffs/nerfs on
// finish bounties. Engaged players — most recent paid clears Verified — get an
// automatic buff; a nerf, custom buff or exemption is only set per player by an
// admin. Players never see it: everything lives in admin-only tables behind the
// economy.shadow RPCs (supabase/schema.sql), and apply_finish applies it. This
// module is the admin client's types, row mapping and display helpers.

export interface ShadowConfig {
  enabled: boolean;
  buffPct: number;
  nerfPct: number;
  /** Engaged = at least `verifiedShare`% of the last `windowClears` paid clears
   *  Verified, with at least `minClears` of them to judge by. */
  windowClears: number;
  minClears: number;
  verifiedShare: number;
}

export type ShadowOverrideMode = "buff" | "nerf" | "exempt";

export interface ShadowPlayer {
  userId: string;
  displayName: string;
  overrideMode: ShadowOverrideMode | null;
  overridePct: number | null;
  overrideNote: string | null;
  /** The signed % a finish would apply (switch aside): +buff, −nerf, 0. */
  pct: number;
  source: "auto" | "override" | null;
  recentClears: number;
  verifiedClears: number;
  /** Net coins adjustments have moved for this player so far. */
  adjustedCoins: number;
  adjustments: number;
}

export interface ShadowAdjustment {
  id: string;
  createdAt: number;
  displayName: string;
  gameTitle: string | null;
  kind: "applied" | "reversed";
  source: "auto" | "override";
  pct: number;
  base: number;
  adjusted: number;
  delta: number;
}

export const DEFAULT_SHADOW_CONFIG: ShadowConfig = {
  enabled: false,
  buffPct: 10,
  nerfPct: 10,
  windowClears: 10,
  minClears: 3,
  verifiedShare: 80,
};

export function rowToShadowConfig(r: Record<string, unknown>): ShadowConfig {
  const n = (k: string, d: number) => (typeof r[k] === "number" ? (r[k] as number) : d);
  return {
    enabled: r.enabled === true,
    buffPct: n("buff_pct", DEFAULT_SHADOW_CONFIG.buffPct),
    nerfPct: n("nerf_pct", DEFAULT_SHADOW_CONFIG.nerfPct),
    windowClears: n("window_clears", DEFAULT_SHADOW_CONFIG.windowClears),
    minClears: n("min_clears", DEFAULT_SHADOW_CONFIG.minClears),
    verifiedShare: n("verified_share", DEFAULT_SHADOW_CONFIG.verifiedShare),
  };
}

export function rowToShadowPlayer(r: Record<string, unknown>): ShadowPlayer {
  const mode = r.override_mode;
  const source = r.source;
  return {
    userId: String(r.user_id),
    displayName: typeof r.display_name === "string" ? r.display_name : "Unnamed player",
    overrideMode: mode === "buff" || mode === "nerf" || mode === "exempt" ? mode : null,
    overridePct: typeof r.override_pct === "number" ? r.override_pct : null,
    overrideNote: typeof r.override_note === "string" ? r.override_note : null,
    pct: typeof r.pct === "number" ? r.pct : 0,
    source: source === "auto" || source === "override" ? source : null,
    recentClears: typeof r.recent_clears === "number" ? r.recent_clears : 0,
    verifiedClears: typeof r.verified_clears === "number" ? r.verified_clears : 0,
    adjustedCoins: typeof r.adjusted_coins === "number" ? r.adjusted_coins : 0,
    adjustments: typeof r.adjustments === "number" ? r.adjustments : 0,
  };
}

export function rowToShadowAdjustment(r: Record<string, unknown>): ShadowAdjustment {
  return {
    id: String(r.id),
    createdAt: Date.parse(String(r.created_at)),
    displayName: typeof r.display_name === "string" ? r.display_name : "Deleted player",
    gameTitle: typeof r.game_title === "string" ? r.game_title : null,
    kind: r.kind === "reversed" ? "reversed" : "applied",
    source: r.source === "override" ? "override" : "auto",
    pct: Number(r.pct) || 0,
    base: Number(r.base) || 0,
    adjusted: Number(r.adjusted) || 0,
    delta: Number(r.delta) || 0,
  };
}

/** Clamp an edited config to the bounds the database enforces. */
export function clampShadowConfig(c: ShadowConfig): ShadowConfig {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  return {
    enabled: c.enabled,
    buffPct: clamp(c.buffPct, 0, 100),
    nerfPct: clamp(c.nerfPct, 0, 100),
    windowClears: clamp(c.windowClears, 1, 100),
    minClears: clamp(c.minClears, 1, 100),
    verifiedShare: clamp(c.verifiedShare, 0, 100),
  };
}

/** A player's standing in a few words, e.g. "+10% · auto (9/10 verified)". */
export function shadowStandingLabel(p: ShadowPlayer): string {
  const clears = `${p.verifiedClears}/${p.recentClears} verified`;
  if (p.source === "override") {
    if (p.overrideMode === "exempt") return `Exempt · ${clears}`;
    return `${p.pct > 0 ? "+" : ""}${p.pct}% · set by an admin · ${clears}`;
  }
  if (p.source === "auto") return `+${p.pct}% · engaged · ${clears}`;
  return `No adjustment · ${clears}`;
}
