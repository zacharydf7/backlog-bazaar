// Game Milestones: a per-game, user-curated journey timeline — when a game
// was added, started, beat, completed, retired, and unretired. Date-only and
// freely backdatable so history from before the app can be entered by hand.
// The server auto-captures the first occurrence of the core kinds (and every
// retire/unretire cycle) via the games trigger; this module is the pure
// client-side vocabulary: types, labels, ordering, row coercion, and date
// validation. NOT an audit trail — game_status_events keeps the immutable
// history; milestones are display data the owner curates.

export type MilestoneKind =
  | "added"
  | "started"
  | "beat"
  | "completed"
  | "retired"
  | "unretired";

export type MilestoneSource = "auto" | "backfill" | "manual";

export interface GameMilestone {
  id: string;
  gameId: string;
  kind: MilestoneKind;
  occurredOn: string; // "YYYY-MM-DD" (date-only by design)
  source: MilestoneSource;
  createdAt: number; // epoch ms — sort tiebreak only
}

/** Catalog of kinds in display order, with their label and timeline-dot class
 *  (theme tokens only, so every theme renders them). */
export const MILESTONE_KINDS: { value: MilestoneKind; label: string; dotClass: string }[] = [
  { value: "added", label: "Added", dotClass: "bg-subtle" },
  { value: "started", label: "Started", dotClass: "bg-accent" },
  { value: "beat", label: "Beat", dotClass: "bg-success" },
  { value: "completed", label: "Completed", dotClass: "bg-brand" },
  { value: "retired", label: "Retired", dotClass: "bg-muted" },
  { value: "unretired", label: "Unretired", dotClass: "bg-accent" },
];

/** Same-date sort rank: the natural order of a single day's journey. */
export const KIND_RANK: Record<MilestoneKind, number> = {
  added: 0,
  started: 1,
  beat: 2,
  completed: 3,
  retired: 4,
  unretired: 5,
};

export function milestoneLabel(kind: MilestoneKind): string {
  return MILESTONE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function coerceMilestoneKind(v: unknown): MilestoneKind | null {
  return typeof v === "string" && v in KIND_RANK ? (v as MilestoneKind) : null;
}

function coerceSource(v: unknown): MilestoneSource {
  return v === "auto" || v === "backfill" ? v : "manual";
}

/** Map a raw supabase row to a typed milestone, or null when malformed —
 *  a bad row must never crash the section render. */
export function coerceMilestoneRow(r: Record<string, unknown>): GameMilestone | null {
  const kind = coerceMilestoneKind(r.kind);
  const id = typeof r.id === "string" ? r.id : null;
  const gameId = typeof r.game_id === "string" ? r.game_id : null;
  const occurredOn = typeof r.occurred_on === "string" ? r.occurred_on.slice(0, 10) : null;
  if (!kind || !id || !gameId || !occurredOn) return null;
  return {
    id,
    gameId,
    kind,
    occurredOn,
    source: coerceSource(r.source),
    createdAt: typeof r.created_at === "string" ? Date.parse(r.created_at) : 0,
  };
}

/** Chronological order: date asc, then the natural same-day kind order, then
 *  insertion time as the last resort. Non-mutating. */
export function sortMilestones(list: GameMilestone[]): GameMilestone[] {
  return [...list].sort(
    (a, b) =>
      a.occurredOn.localeCompare(b.occurredOn) ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.createdAt - b.createdAt,
  );
}

/** Whether the game currently counts as retired: more Retired rows than
 *  Unretired ones. Client mirror of the capture trigger's pairing rule. */
export function isCurrentlyRetired(list: GameMilestone[]): boolean {
  let balance = 0;
  for (const m of list) {
    if (m.kind === "retired") balance++;
    else if (m.kind === "unretired") balance--;
  }
  return balance > 0;
}

/** Local-today as "YYYY-MM-DD" — the date input's default and max. */
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Strict YYYY-MM-DD, a real calendar date, and not in the future. Retroactive
 *  freedom is the feature — the only hard rule is "no time travel forward". */
export function isValidMilestoneDate(s: string, today: string = todayISO()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, mo, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return false;
  }
  return s <= today;
}
