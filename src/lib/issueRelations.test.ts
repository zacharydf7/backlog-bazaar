import { describe, it, expect } from "vitest";
import {
  toCanonicalRelation,
  relationFromPerspective,
  RELATION_LABEL,
  type RelationPerspective,
} from "./issueRelations";

describe("toCanonicalRelation", () => {
  it("keeps directed perspectives pointing from source to target", () => {
    expect(toCanonicalRelation("blocks", "A", "B")).toEqual({
      fromRequest: "A",
      toRequest: "B",
      kind: "blocks",
    });
    expect(toCanonicalRelation("duplicates", "A", "B")).toEqual({
      fromRequest: "A",
      toRequest: "B",
      kind: "duplicates",
    });
  });

  it("flips the inverse perspectives so the row stays canonical", () => {
    expect(toCanonicalRelation("blocked_by", "A", "B")).toEqual({
      fromRequest: "B",
      toRequest: "A",
      kind: "blocks",
    });
    expect(toCanonicalRelation("duplicated_by", "A", "B")).toEqual({
      fromRequest: "B",
      toRequest: "A",
      kind: "duplicates",
    });
  });

  it("orders a symmetric relates link so it dedupes from either side", () => {
    const forward = toCanonicalRelation("relates", "A", "B");
    const reverse = toCanonicalRelation("relates", "B", "A");
    expect(forward).toEqual({ fromRequest: "A", toRequest: "B", kind: "relates" });
    expect(reverse).toEqual(forward); // same canonical row regardless of initiator
  });
});

describe("relationFromPerspective", () => {
  const rel = (kind: "blocks" | "duplicates" | "relates", from: string, to: string) => ({
    fromRequest: from,
    toRequest: to,
    kind,
  });

  it("reads a directed link differently from each side", () => {
    expect(relationFromPerspective(rel("blocks", "A", "B"), "A")).toEqual({
      perspective: "blocks",
      otherId: "B",
    });
    expect(relationFromPerspective(rel("blocks", "A", "B"), "B")).toEqual({
      perspective: "blocked_by",
      otherId: "A",
    });
    expect(relationFromPerspective(rel("duplicates", "A", "B"), "B")).toEqual({
      perspective: "duplicated_by",
      otherId: "A",
    });
  });

  it("reads a symmetric link the same way from either side", () => {
    expect(relationFromPerspective(rel("relates", "A", "B"), "A")).toEqual({
      perspective: "relates",
      otherId: "B",
    });
    expect(relationFromPerspective(rel("relates", "A", "B"), "B")).toEqual({
      perspective: "relates",
      otherId: "A",
    });
  });

  it("returns null when the viewer isn't part of the relation", () => {
    expect(relationFromPerspective(rel("blocks", "A", "B"), "C")).toBeNull();
  });
});

describe("RELATION_LABEL", () => {
  it("has a human label for every perspective", () => {
    const all: RelationPerspective[] = [
      "blocks",
      "blocked_by",
      "relates",
      "duplicates",
      "duplicated_by",
    ];
    for (const p of all) expect(RELATION_LABEL[p]).toBeTruthy();
  });
});
