// Jira-style links between issues. A relation is stored as one directed row
// (from → to) with a `kind`; the label a viewer sees depends on which side they
// are on. "blocks"/"duplicates" are directed (the other side reads "blocked
// by"/"duplicated by"); "relates" is symmetric. Pure helpers so the perspective
// math and the canonical storage form are unit-tested without React/Supabase.

import type { RelationKind } from "../types";

/** How a relation reads from one issue's vantage point — also the set of choices
 *  offered when adding a link. */
export type RelationPerspective =
  | "blocks"
  | "blocked_by"
  | "relates"
  | "duplicates"
  | "duplicated_by";

/** Picker options, in display order. */
export const RELATION_PERSPECTIVES: { value: RelationPerspective; label: string }[] = [
  { value: "blocks", label: "Blocks" },
  { value: "blocked_by", label: "Blocked by" },
  { value: "relates", label: "Relates to" },
  { value: "duplicates", label: "Duplicates" },
  { value: "duplicated_by", label: "Duplicated by" },
];

export const RELATION_LABEL = Object.fromEntries(
  RELATION_PERSPECTIVES.map((p) => [p.value, p.label]),
) as Record<RelationPerspective, string>;

/** Translate a viewer-chosen perspective into the canonical directed row to
 *  store. `sourceId` is the issue being viewed, `targetId` the one picked. The
 *  symmetric "relates" is ordered (least→greatest id) so it can't be duplicated
 *  whichever side initiates it. */
export function toCanonicalRelation(
  perspective: RelationPerspective,
  sourceId: string,
  targetId: string,
): { fromRequest: string; toRequest: string; kind: RelationKind } {
  switch (perspective) {
    case "blocks":
      return { fromRequest: sourceId, toRequest: targetId, kind: "blocks" };
    case "blocked_by":
      return { fromRequest: targetId, toRequest: sourceId, kind: "blocks" };
    case "duplicates":
      return { fromRequest: sourceId, toRequest: targetId, kind: "duplicates" };
    case "duplicated_by":
      return { fromRequest: targetId, toRequest: sourceId, kind: "duplicates" };
    case "relates": {
      const [a, b] = sourceId <= targetId ? [sourceId, targetId] : [targetId, sourceId];
      return { fromRequest: a, toRequest: b, kind: "relates" };
    }
  }
}

/** Read a stored relation from one issue's side: how it reads, and which issue is
 *  "the other one". Returns null when the viewer isn't part of the relation. */
export function relationFromPerspective(
  rel: { fromRequest: string; toRequest: string; kind: RelationKind },
  viewerId: string,
): { perspective: RelationPerspective; otherId: string } | null {
  const isFrom = rel.fromRequest === viewerId;
  const isTo = rel.toRequest === viewerId;
  if (!isFrom && !isTo) return null;
  const otherId = isFrom ? rel.toRequest : rel.fromRequest;
  let perspective: RelationPerspective;
  if (rel.kind === "relates") perspective = "relates";
  else if (rel.kind === "blocks") perspective = isFrom ? "blocks" : "blocked_by";
  else perspective = isFrom ? "duplicates" : "duplicated_by";
  return { perspective, otherId };
}
