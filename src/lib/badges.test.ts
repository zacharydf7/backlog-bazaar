import { describe, it, expect } from "vitest";
import { Award, FlaskConical } from "lucide-react";
import {
  resolveBadgeIcon,
  DEFAULT_BADGE_ICON,
  sortBadges,
  resolveTitle,
  badgePrestigeClass,
} from "./badges";
import type { Badge } from "../types";

function badge(over: Partial<Badge> = {}): Badge {
  return {
    id: "b1",
    slug: "beta-tester",
    name: "Beta Tester",
    description: null,
    icon: "flask-conical",
    prestige: 10,
    ...over,
  };
}

describe("resolveBadgeIcon", () => {
  it("maps a known icon name to its lucide component", () => {
    expect(resolveBadgeIcon("flask-conical")).toBe(FlaskConical);
  });

  it("falls back to the default award icon for an unknown name", () => {
    expect(resolveBadgeIcon("does-not-exist")).toBe(DEFAULT_BADGE_ICON);
    expect(DEFAULT_BADGE_ICON).toBe(Award);
  });
});

describe("sortBadges", () => {
  it("orders by prestige (desc) then name, without mutating the input", () => {
    const input = [
      badge({ id: "a", name: "Zeta", prestige: 5 }),
      badge({ id: "b", name: "Alpha", prestige: 10 }),
      badge({ id: "c", name: "Beta", prestige: 10 }),
    ];
    const sorted = sortBadges(input);
    expect(sorted.map((b) => b.id)).toEqual(["b", "c", "a"]);
    // original array order is preserved (pure)
    expect(input.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("resolveTitle", () => {
  const held = [badge({ id: "x" }), badge({ id: "y", slug: "founder", name: "Founder" })];

  it("returns null when nothing is selected", () => {
    expect(resolveTitle(held, null)).toBeNull();
  });

  it("returns the held badge matching the selected id", () => {
    expect(resolveTitle(held, "y")?.slug).toBe("founder");
  });

  it("returns null when the selected badge is no longer held (e.g. revoked)", () => {
    expect(resolveTitle(held, "gone")).toBeNull();
  });
});

describe("badgePrestigeClass", () => {
  it("uses the accent tier for high prestige", () => {
    expect(badgePrestigeClass(10)).toContain("text-accent");
  });

  it("steps down tiers as prestige drops", () => {
    expect(badgePrestigeClass(5)).toContain("text-ink");
    expect(badgePrestigeClass(0)).toContain("text-muted");
  });
});
