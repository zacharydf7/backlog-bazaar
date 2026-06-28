// How a Finished game concluded — the status chip shown on the Finished board. A
// per-game tag (distinct from the profile prestige badges), auto-assigned by the lane
// a game left and freely overridable by the owner. See games.finish_tag in schema.sql.

export type FinishTag = "beaten" | "completed" | "endless";

/** All finish tags, in display order, with a label + blurb. The icon name is a
 *  lucide-react export resolved at the call site (kept as a string so this stays a
 *  pure, framework-free module). */
export const FINISH_TAGS: { value: FinishTag; label: string; icon: string; blurb: string }[] = [
  { value: "beaten", label: "Beaten", icon: "Flag", blurb: "Main campaign cleared — post-game content unplayed." },
  { value: "completed", label: "Completed", icon: "Trophy", blurb: "100% mastery — fully completed." },
  { value: "endless", label: "Endless", icon: "Infinity", blurb: "A live-service / ongoing game you've retired." },
];

const VALID = new Set<FinishTag>(["beaten", "completed", "endless"]);

/** Coerce an unknown value to a FinishTag, or null. */
export function coerceFinishTag(v: unknown): FinishTag | null {
  return typeof v === "string" && VALID.has(v as FinishTag) ? (v as FinishTag) : null;
}

/** The label for a tag (empty string for null/unknown). */
export function finishTagLabel(tag: FinishTag | null | undefined): string {
  return FINISH_TAGS.find((t) => t.value === tag)?.label ?? "";
}

/** The tag a finish should auto-assign, mirroring apply_finish in schema.sql:
 *  a completion run earns "completed"; any other finish defaults to "beaten" but
 *  preserves a tag the game already carried (so a replay keeps its prior tag, and a
 *  hybrid game keeps its narrative tag). */
export function autoFinishTag(opts: {
  completion: boolean;
  existing?: FinishTag | null;
}): FinishTag {
  if (opts.completion) return "completed";
  return opts.existing ?? "beaten";
}
