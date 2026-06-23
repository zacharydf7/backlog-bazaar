import type { CopyFormat, GameCopy } from "../types";

/** A new random id for a copy. Falls back to a cheap unique string where
 *  crypto.randomUUID isn't available (older browsers / some test envs). */
export function newCopyId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** A platform you own a game on, plus which formats (physical/digital) you have
 *  it in. Multiple copies on the same platform collapse into one entry here. */
export interface PlatformOwnership {
  platform: string;
  formats: CopyFormat[];
}

/** Group copies by platform (first-seen order), collecting the distinct formats
 *  recorded for each. Used to show "Nintendo Switch (Physical, Digital)". */
export function ownedPlatformSummary(copies: GameCopy[] | undefined): PlatformOwnership[] {
  const order: string[] = [];
  const byPlatform = new Map<string, Set<CopyFormat>>();
  for (const c of copies ?? []) {
    const p = c.platform.trim();
    if (!p) continue;
    if (!byPlatform.has(p)) {
      byPlatform.set(p, new Set());
      order.push(p);
    }
    if (c.format) byPlatform.get(p)!.add(c.format);
  }
  return order.map((platform) => ({
    platform,
    formats: [...byPlatform.get(platform)!],
  }));
}

/** The distinct platforms you own a game on (trimmed, deduped, first-seen order),
 *  as plain strings. Used by the "log time" platform picker to attribute a play
 *  session to a platform when you own the game on more than one. */
export function ownedPlatforms(copies: GameCopy[] | undefined): string[] {
  return ownedPlatformSummary(copies).map((o) => o.platform);
}

/** A specific version you own a game on, for attributing play time: a platform
 *  plus its format. Two copies on the same platform but different formats (a
 *  physical and a digital PlayStation 4 copy) are distinct versions. */
export interface OwnedVersion {
  platform: string;
  format?: CopyFormat; // undefined when no format was recorded (e.g. PC)
}

/** A stable identity string for a (platform, format) version — used as a map key
 *  and a React key. JSON-encoded so no platform label can collide with another
 *  pair. A missing format is its own bucket (distinct from a formatted one),
 *  matching how legacy time logged before formats existed is kept apart. */
export function versionKey(platform: string, format?: CopyFormat | null): string {
  return JSON.stringify([platform, format ?? null]);
}

/** A display label for a version, e.g. "PlayStation 4 (Physical)", or just the
 *  platform when no format is recorded. */
export function versionLabel(platform: string, format?: CopyFormat | null): string {
  return format ? `${platform} (${formatLabel(format)})` : platform;
}

/** The distinct versions (platform + format) you own a game on, in first-seen
 *  order. Used by the "log time" picker and the per-version playtime editor so a
 *  physical and a digital copy of the same platform are tracked separately. */
export function ownedVersions(copies: GameCopy[] | undefined): OwnedVersion[] {
  const seen = new Set<string>();
  const out: OwnedVersion[] = [];
  for (const c of copies ?? []) {
    const platform = c.platform.trim();
    if (!platform) continue;
    const key = versionKey(platform, c.format);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform, format: c.format });
  }
  return out;
}

/** Capitalised label for a copy format, e.g. "Physical". */
export function formatLabel(format: CopyFormat): string {
  return format === "physical" ? "Physical" : "Digital";
}

/** A one-line label for an owned platform, e.g. "Nintendo Switch (Physical, Digital)"
 *  or just "PC" when no format was recorded. */
export function ownershipLabel(o: PlatformOwnership): string {
  if (o.formats.length === 0) return o.platform;
  return `${o.platform} (${o.formats.map(formatLabel).join(", ")})`;
}

/** Sum of recorded acquisition costs across all copies (copies with no cost
 *  count as 0). */
export function totalCost(copies: GameCopy[] | undefined): number {
  return (copies ?? []).reduce((sum, c) => sum + (c.cost ?? 0), 0);
}

/** True if any copy has a recorded cost (used to decide whether to show the
 *  spend breakdown at all). */
export function hasAnyCost(copies: GameCopy[] | undefined): boolean {
  return (copies ?? []).some((c) => typeof c.cost === "number" && c.cost > 0);
}

/** Format a USD amount the way the UI shows acquisition cost. */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2).replace(/\.00$/, "")}`;
}
