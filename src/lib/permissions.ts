// Fine-grained permission catalog + pure helpers for the roles system.
//
// Authorization is server-authoritative — every admin RPC/RLS policy re-checks
// the caller via the SQL has_permission() (see supabase/schema.sql). These keys
// and helpers are the CLIENT mirror: they gate what the UI shows and what role
// the admin tools let you build. The key list here MUST stay in sync with
// all_permission_keys() in schema.sql (the single SQL source of truth used to
// validate role definitions). Kept free of React/Supabase so it's unit-testable.

/** Every individually grantable capability. Mirrors all_permission_keys() in SQL. */
export type Permission =
  | "submissions.games.moderate"
  | "submissions.compilations.moderate"
  | "catalog.manage"
  | "taxonomy.manage"
  | "users.view"
  | "users.economy"
  | "users.block"
  | "users.delete"
  | "users.notify"
  | "users.onboarding"
  | "badges.grant"
  | "economy.edit"
  | "slots.manage"
  | "site.maintenance"
  | "issues.moderate"
  | "reports.moderate"
  | "stats.view"
  | "roles.assign";

/** UI grouping for the role editor's permission checklist. */
export type PermissionGroup = "Submissions" | "Users" | "Economy & Site" | "Other";

export interface PermissionInfo {
  key: Permission;
  label: string;
  description: string;
  group: PermissionGroup;
}

/** The catalog, in display order. Source of truth for the role editor + the
 *  per-user role chips. The keys here are exactly all_permission_keys() in SQL. */
export const PERMISSIONS: PermissionInfo[] = [
  {
    key: "submissions.games.moderate",
    label: "Moderate game submissions",
    description: "Approve, reject and remove community catalog game submissions.",
    group: "Submissions",
  },
  {
    key: "submissions.compilations.moderate",
    label: "Moderate compilation submissions",
    description: "Approve, reject and remove shared compilation template submissions.",
    group: "Submissions",
  },
  {
    key: "catalog.manage",
    label: "Manage the community catalog",
    description:
      "Open the Catalog tab to directly edit and delete community-added games (bypassing the submission queue); edits cascade to every copy.",
    group: "Submissions",
  },
  {
    key: "taxonomy.manage",
    label: "Manage platforms & genres",
    description:
      "Add to the controlled master lists of platforms and genres that drive every dropdown (keeps catalog data clean for analytics).",
    group: "Submissions",
  },
  {
    key: "users.view",
    label: "View users",
    description: "See the user list and account details in User Management.",
    group: "Users",
  },
  {
    key: "users.economy",
    label: "Adjust user economy",
    description: "Change a user's coins, vouchers and Now Playing slots.",
    group: "Users",
  },
  {
    key: "users.block",
    label: "Block & hide users",
    description: "Block an account from the app or hide it from the Market Square.",
    group: "Users",
  },
  {
    key: "users.delete",
    label: "Delete users",
    description: "Permanently delete a user account and all of its data.",
    group: "Users",
  },
  {
    key: "users.notify",
    label: "Notify users",
    description: "Send a user a direct notification about an account action.",
    group: "Users",
  },
  {
    key: "users.onboarding",
    label: "Reset onboarding",
    description: "Reset a user's tutorial so the full onboarding tour runs again.",
    group: "Users",
  },
  {
    key: "badges.grant",
    label: "Grant & revoke badges",
    description: "Award or remove prestige badges and titles.",
    group: "Users",
  },
  {
    key: "reports.moderate",
    label: "Handle reports",
    description:
      "Open the Reports queue to review user/content reports and act on them — dismiss, strip a custom cover, or suspend an account (suspending also needs Block & hide users).",
    group: "Users",
  },
  {
    key: "economy.edit",
    label: "Edit the economy",
    description: "Change the price/bounty formulas, rewards and other economy levers.",
    group: "Economy & Site",
  },
  {
    key: "slots.manage",
    label: "Manage slots",
    description: "Define targeted Now Playing slot types and grant them to users.",
    group: "Economy & Site",
  },
  {
    key: "site.maintenance",
    label: "Site settings",
    description: "Toggle maintenance mode and the site-wide appearance settings.",
    group: "Economy & Site",
  },
  {
    key: "issues.moderate",
    label: "Moderate the issue board",
    description: "Triage, edit and remove issues, comments and attachments.",
    group: "Other",
  },
  {
    key: "stats.view",
    label: "View stats",
    description: "Open the admin Stats dashboard and per-user analytics.",
    group: "Other",
  },
  {
    key: "roles.assign",
    label: "Assign roles",
    description:
      "Assign existing roles to users — limited to roles within your own permissions.",
    group: "Other",
  },
];

/** All permission keys, derived from the catalog. */
export const PERMISSION_KEYS: Permission[] = PERMISSIONS.map((p) => p.key);

/** The ordered groups, for rendering the role editor in sections. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  "Submissions",
  "Users",
  "Economy & Site",
  "Other",
];

/** The seeded preset roles (must match the schema.sql seed). Surfaced in the
 *  create-role modal as "start from a preset". */
export const MODERATOR_PRESET: Permission[] = [
  "submissions.games.moderate",
  "submissions.compilations.moderate",
  "catalog.manage",
  "taxonomy.manage",
  "issues.moderate",
  "reports.moderate",
];
export const QA_PRESET: Permission[] = ["stats.view", "users.view", "site.maintenance"];

/** Is `key` a real, current permission? Guards against stale keys lingering on a
 *  role after the catalog changes. */
export function isPermission(key: string): key is Permission {
  return (PERMISSION_KEYS as string[]).includes(key);
}

/** Does this caller hold a permission? A super-admin implicitly holds every one;
 *  otherwise it must be in their effective set. Mirrors SQL has_permission(). */
export function hasPermission(
  perms: readonly string[],
  key: Permission,
  isAdmin: boolean,
): boolean {
  return isAdmin || perms.includes(key);
}

/** True if the caller holds ANY admin-tier permission (drives whether the Admin
 *  console/menu is reachable at all). */
export function hasAnyAdminPermission(perms: readonly string[], isAdmin: boolean): boolean {
  return isAdmin || perms.length > 0;
}

/** May this caller assign a role with `rolePerms`? A super-admin always can; a
 *  delegate may only grant a role whose permissions are a SUBSET of their own, so
 *  they can never escalate. Mirrors the subset guard in assign_role(). */
export function canAssignRole(
  callerPerms: readonly string[],
  callerIsAdmin: boolean,
  rolePerms: readonly string[],
): boolean {
  if (callerIsAdmin) return true;
  return rolePerms.every((p) => callerPerms.includes(p));
}

/** The catalog entry for a key (for chips/tooltips); undefined if it's stale. */
export function permissionInfo(key: string): PermissionInfo | undefined {
  return PERMISSIONS.find((p) => p.key === key);
}
