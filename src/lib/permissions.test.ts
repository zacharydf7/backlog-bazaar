import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_GROUPS,
  MODERATOR_PRESET,
  QA_PRESET,
  isPermission,
  hasPermission,
  hasAnyAdminPermission,
  canAssignRole,
  permissionInfo,
} from "./permissions";

describe("PERMISSIONS catalog", () => {
  it("has unique keys, each with a label, description and known group", () => {
    const seen = new Set<string>();
    for (const p of PERMISSIONS) {
      expect(seen.has(p.key), `duplicate key ${p.key}`).toBe(false);
      seen.add(p.key);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(PERMISSION_GROUPS).toContain(p.group);
    }
  });

  it("derives PERMISSION_KEYS from the catalog", () => {
    expect(PERMISSION_KEYS).toHaveLength(PERMISSIONS.length);
    expect(PERMISSION_KEYS).toContain("roles.assign");
    expect(PERMISSION_KEYS).toContain("submissions.games.moderate");
  });

  it("presets reference only real catalog keys", () => {
    for (const k of [...MODERATOR_PRESET, ...QA_PRESET]) {
      expect(isPermission(k)).toBe(true);
    }
  });

  it("includes the reports.moderate key, bundled into the Moderator preset", () => {
    expect(PERMISSION_KEYS).toContain("reports.moderate");
    expect(MODERATOR_PRESET).toContain("reports.moderate");
  });

  it("no longer carries the retired playtime.stopwatch soft-launch key", () => {
    // The stopwatch went public on 2026-07-24; its gate was removed, so the key
    // must not linger as a dead, assignable permission (or reappear as a gate).
    expect(PERMISSION_KEYS as string[]).not.toContain("playtime.stopwatch");
  });
});

describe("isPermission", () => {
  it("accepts catalog keys and rejects unknown ones", () => {
    expect(isPermission("stats.view")).toBe(true);
    expect(isPermission("totally.made.up")).toBe(false);
  });
});

describe("hasPermission", () => {
  it("is true when the key is held", () => {
    expect(hasPermission(["stats.view"], "stats.view", false)).toBe(true);
  });

  it("is false when the key is absent for a non-admin", () => {
    expect(hasPermission(["stats.view"], "users.delete", false)).toBe(false);
  });

  it("is always true for a super-admin, regardless of the held set", () => {
    expect(hasPermission([], "users.delete", true)).toBe(true);
  });
});

describe("hasAnyAdminPermission", () => {
  it("is true for a super-admin or anyone holding at least one permission", () => {
    expect(hasAnyAdminPermission([], true)).toBe(true);
    expect(hasAnyAdminPermission(["stats.view"], false)).toBe(true);
  });

  it("is false for a plain user with no permissions", () => {
    expect(hasAnyAdminPermission([], false)).toBe(false);
  });
});

describe("canAssignRole (subset guard)", () => {
  it("lets a super-admin assign any role", () => {
    expect(canAssignRole([], true, ["users.delete", "economy.edit"])).toBe(true);
  });

  it("lets a delegate assign a role within their own permissions", () => {
    expect(
      canAssignRole(["stats.view", "users.view"], false, ["stats.view"]),
    ).toBe(true);
  });

  it("blocks a delegate from assigning a role with a permission they lack", () => {
    expect(canAssignRole(["stats.view"], false, ["stats.view", "users.delete"])).toBe(false);
  });

  it("treats an empty role as assignable by anyone", () => {
    expect(canAssignRole([], false, [])).toBe(true);
  });
});

describe("permissionInfo", () => {
  it("returns the catalog entry for a key, or undefined when stale", () => {
    expect(permissionInfo("stats.view")?.label).toMatch(/stats/i);
    expect(permissionInfo("gone.stale")).toBeUndefined();
  });
});
