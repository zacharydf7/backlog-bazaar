import type { AcquisitionType, CopyFormat, Game, GameCopy, ModifierAcquisition } from "../types";

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

/** DLC copies are owned CONTENT, not owned playable versions: they show in
 *  ownership summaries (with a "DLC" tag) and roll into spend totals, but are
 *  excluded from version semantics — playtime pickers, duplicate detection and
 *  copy counts never treat a DLC row as a base copy. */
function nonDlcCopies(copies: GameCopy[] | undefined): GameCopy[] {
  return (copies ?? []).filter((c) => c.format !== "dlc");
}

/** A platform you own a game on, plus which formats (physical/digital/DLC) you
 *  have it in. Multiple copies on the same platform collapse into one entry here. */
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
    // Tolerate a missing platform (e.g. a compilation copy saved with no
    // platform stores null in the cloud) — never let it crash the render.
    const p = (c.platform ?? "").trim();
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
 *  physical and a digital copy of the same platform are tracked separately.
 *  DLC copies are not versions — they're excluded here, which also keeps them
 *  out of duplicate-version checks and "you own another version" hints. */
export function ownedVersions(copies: GameCopy[] | undefined): OwnedVersion[] {
  const seen = new Set<string>();
  const out: OwnedVersion[] = [];
  for (const c of nonDlcCopies(copies)) {
    const platform = (c.platform ?? "").trim();
    if (!platform) continue;
    const key = versionKey(platform, c.format);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform, format: c.format });
  }
  return out;
}

/** Whether two versions collide as "the same copy" for duplicate checks: the
 *  same platform with equal formats — or with EITHER format unrecorded, since a
 *  format-less copy is ambiguous and could be the one already owned (e.g. a
 *  bare "PlayStation 4" row duplicates an owned "PlayStation 4 (Digital)").
 *  Stricter than versionKey equality, which keeps the format-less bucket
 *  separate for playtime accounting. */
export function versionsConflict(a: OwnedVersion, b: OwnedVersion): boolean {
  if (a.platform !== b.platform) return false;
  const af = a.format ?? null;
  const bf = b.format ?? null;
  return af == null || bf == null || af === bf;
}

/** The versions to offer when logging or editing play time, honouring the user's
 *  edition-level tracking preference. With it on, each owned copy (platform +
 *  format) is a distinct loggable version; with it off (the default), copies are
 *  aggregated by platform — a platform owned in two formats collapses to one
 *  format-less entry, so the picker just asks which platform you played on. */
export function loggableVersions(
  copies: GameCopy[] | undefined,
  trackEditions: boolean,
): OwnedVersion[] {
  if (trackEditions) return ownedVersions(copies);
  // Aggregate by platform from base copies only — a platform owned solely as
  // DLC is not somewhere you can play the game.
  return ownedPlatforms(nonDlcCopies(copies)).map((platform) => ({ platform, format: undefined }));
}

const FORMAT_LABELS: Record<CopyFormat, string> = {
  physical: "Physical",
  digital: "Digital",
  dlc: "DLC",
};

/** Capitalised label for a copy format, e.g. "Physical". */
export function formatLabel(format: CopyFormat): string {
  return FORMAT_LABELS[format] ?? "Digital";
}

/** Canonical display order for copy formats (physical, digital, then DLC), so a
 *  platform tag's format glyphs always read left-to-right in the same order
 *  regardless of the order copies were added. */
export const FORMAT_ORDER: CopyFormat[] = ["physical", "digital", "dlc"];

/** A platform's distinct owned formats in canonical order — the little
 *  physical/digital/DLC markers shown on the compact platform tags. All three
 *  appear when a platform is owned in all three forms. */
export function orderedFormats(formats: CopyFormat[]): CopyFormat[] {
  return FORMAT_ORDER.filter((f) => formats.includes(f));
}

/** Acquisition catalog, in editor/display order (owned first). The icon name is
 *  a lucide-react export resolved at the call site, keeping this module free of
 *  React — the same pattern FINISH_TAGS uses. "owned" carries no icon (it's the
 *  unremarkable default). */
export const ACQUISITIONS: { value: AcquisitionType; label: string; icon: string; blurb: string }[] = [
  { value: "owned", label: "Owned", icon: "", blurb: "A copy that's permanently yours." },
  {
    value: "subscription",
    label: "Subscription",
    icon: "Cloud",
    blurb: "Available through a subscription (Game Pass, PS Plus…) — not permanently yours.",
  },
  { value: "borrowed", label: "Borrowed", icon: "Handshake", blurb: "On loan from a friend or a library." },
  {
    value: "player2",
    label: "Player 2",
    icon: "Users",
    blurb:
      "Playing on someone else's copy — couch co-op, screen share, or a partner's license for a Co-op Pact. Never counts toward your spend.",
  },
];

/** Coerce an unknown value to an AcquisitionType, or null. */
export function coerceAcquisition(v: unknown): AcquisitionType | null {
  return typeof v === "string" && ACQUISITIONS.some((a) => a.value === v)
    ? (v as AcquisitionType)
    : null;
}

/** The label for an acquisition ("Owned" for null/unknown). */
export function acquisitionLabel(a: AcquisitionType | null | undefined): string {
  return ACQUISITIONS.find((x) => x.value === a)?.label ?? "Owned";
}

/** The lucide icon name for an acquisition ("" for owned/unknown — no icon). */
export function acquisitionIcon(a: AcquisitionType | null | undefined): string {
  return ACQUISITIONS.find((x) => x.value === a)?.icon ?? "";
}

/** A "modifier" acquisition worth flagging — anything other than plain owned. A
 *  copy with no acquisition recorded is treated as owned. */
export function isModifierAcquisition(
  a: AcquisitionType | null | undefined,
): a is ModifierAcquisition {
  return a === "subscription" || a === "borrowed" || a === "player2";
}

/** The one acquisition to surface on a game's card, or null when every copy is
 *  plainly owned. Player 2 wins outright — it's the strongest not-yours state
 *  (you're on someone ELSE'S copy, issue 3eb956ff); then subscription over
 *  borrowed (the more distinctive "rented" state), so a game you have on Game
 *  Pass AND borrowed physically reads as Subscription. */
export function primaryAcquisition(copies: GameCopy[] | undefined): ModifierAcquisition | null {
  const list = copies ?? [];
  if (list.some((c) => c.acquisition === "player2")) return "player2";
  if (list.some((c) => c.acquisition === "subscription")) return "subscription";
  if (list.some((c) => c.acquisition === "borrowed")) return "borrowed";
  return null;
}

/** The provider label to show for a game's primary acquisition, if any copy of
 *  that kind recorded one (e.g. "Game Pass Ultimate"). null when none did. */
export function primaryProvider(copies: GameCopy[] | undefined): string | null {
  const kind = primaryAcquisition(copies);
  if (!kind) return null;
  const withProvider = (copies ?? []).find(
    (c) => c.acquisition === kind && c.provider && c.provider.trim(),
  );
  return withProvider?.provider?.trim() ?? null;
}

/** A one-line label for an owned platform, e.g. "Nintendo Switch (Physical, Digital)"
 *  or just "PC" when no format was recorded. */
export function ownershipLabel(o: PlatformOwnership): string {
  if (o.formats.length === 0) return o.platform;
  return `${o.platform} (${o.formats.map(formatLabel).join(", ")})`;
}

/** True when a platform is owned ONLY as DLC — surfaces use this to make sure
 *  such a platform never reads as an owned base copy (e.g. a "DLC" tag on the
 *  board card's platform chip). */
export function isDlcOnly(o: PlatformOwnership): boolean {
  return o.formats.length > 0 && o.formats.every((f) => f === "dlc");
}

/** Copy-count summary with DLC tallied separately, e.g. "2 copies · 1 DLC",
 *  "1 copy" or just "1 DLC" — so an expansion never inflates the number of
 *  base copies you appear to own. Accepts anything format-bearing (saved
 *  copies or editor drafts). */
export function copyCountSummary(copies: Pick<GameCopy, "format">[] | undefined): string {
  const all = copies ?? [];
  const dlc = all.filter((c) => c.format === "dlc").length;
  const base = all.length - dlc;
  const parts: string[] = [];
  if (base > 0 || dlc === 0) parts.push(`${base} ${base === 1 ? "copy" : "copies"}`);
  if (dlc > 0) parts.push(`${dlc} DLC`);
  return parts.join(" · ");
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

/** One line of the per-copy spend breakdown: a copy plus a stable key (the
 *  owning instance's id keeps same-platform copies on different instances
 *  apart). */
export interface SpendRow {
  key: string;
  copy: GameCopy;
}

/** A run of spend rows sharing a source: `compilation: null` for copies bought
 *  standalone, otherwise the bundle those instances came in. */
export interface SpendRowGroup {
  compilation: { id: string; name: string } | null;
  rows: SpendRow[];
}

/** Group a hub's per-copy spend rows by where each copy came from — standalone
 *  purchases first, then one group per compilation in first-seen order — so
 *  two otherwise-identical platform rows are distinguishable (issue 2ebfcb7a).
 *  A game owned via several bundles lists each bundle as its own group.
 *  Wishlist instances never carry spend, so they're skipped. */
export function spendRowGroups(members: Game[]): SpendRowGroup[] {
  const standalone: SpendRow[] = [];
  const compOrder: string[] = [];
  const byComp = new Map<string, SpendRowGroup>();
  for (const m of members) {
    if (m.status === "wishlist") continue;
    const rows = (m.copies ?? []).map((c) => ({ key: `${m.id}:${c.id}`, copy: c }));
    if (rows.length === 0) continue;
    if (m.compilationId) {
      let group = byComp.get(m.compilationId);
      if (!group) {
        group = {
          compilation: {
            id: m.compilationId,
            name: m.compilationName?.trim() || "a compilation",
          },
          rows: [],
        };
        byComp.set(m.compilationId, group);
        compOrder.push(m.compilationId);
      }
      group.rows.push(...rows);
    } else {
      standalone.push(...rows);
    }
  }
  const groups: SpendRowGroup[] = [];
  if (standalone.length > 0) groups.push({ compilation: null, rows: standalone });
  for (const id of compOrder) groups.push(byComp.get(id)!);
  return groups;
}

/** Format a USD amount the way the UI shows acquisition cost: thousands
 *  grouped ("$1,234.56"), whole dollars without the trailing ".00" ("$20"). */
export function formatUsd(amount: number): string {
  const s = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${s.replace(/\.00$/, "")}`;
}
