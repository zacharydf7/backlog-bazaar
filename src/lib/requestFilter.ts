import type { FeatureKind, FeatureRequest, FeatureStatus } from "../types";
import { priorityRank } from "./priority";

export type RequestSort = "votes" | "newest" | "comments" | "priority";
export type StatusFilter = "open" | "all" | FeatureStatus;

export interface RequestQuery {
  search: string;
  type: "all" | FeatureKind;
  status: StatusFilter;
  mineOnly: boolean;
  sort: RequestSort;
  userId: string | null;
}

/** "Open" = everything except finished/declined (the board's historical default). */
function isOpen(r: FeatureRequest): boolean {
  return r.status !== "done" && r.status !== "declined";
}

function matchesSearch(r: FeatureRequest, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${r.title} ${r.description ?? ""} ${r.requesterName ?? ""}`.toLowerCase();
  return hay.includes(needle);
}

/** Filter + sort the request list for the board. Pure; returns a new array. */
export function filterSortRequests(reqs: FeatureRequest[], q: RequestQuery): FeatureRequest[] {
  const filtered = reqs.filter((r) => {
    if (q.type !== "all" && r.kind !== q.type) return false;
    if (q.status === "open" && !isOpen(r)) return false;
    if (q.status !== "open" && q.status !== "all" && r.status !== q.status) return false;
    if (q.mineOnly && r.userId !== q.userId) return false;
    if (!matchesSearch(r, q.search)) return false;
    return true;
  });

  const byNewest = (a: FeatureRequest, b: FeatureRequest) => b.createdAt - a.createdAt;
  return filtered.sort((a, b) => {
    if (q.sort === "newest") return byNewest(a, b);
    if (q.sort === "comments") return b.commentCount - a.commentCount || byNewest(a, b);
    if (q.sort === "priority")
      return priorityRank(b.priority) - priorityRank(a.priority) || byNewest(a, b);
    return b.voteCount - a.voteCount || byNewest(a, b); // "votes" (default)
  });
}

/** True when any narrowing control is active (drives the "clear filters" affordance). */
export function hasActiveFilters(q: RequestQuery): boolean {
  return (
    q.search.trim() !== "" || q.type !== "all" || q.status !== "open" || q.mineOnly
  );
}
