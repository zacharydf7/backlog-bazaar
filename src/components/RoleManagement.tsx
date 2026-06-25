import { useEffect, useMemo, useState } from "react";
import { UserCog, Plus, Pencil, Trash2, X, Lock, Users as UsersIcon, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  MODERATOR_PRESET,
  QA_PRESET,
  type Permission,
} from "../lib/permissions";
import type { Role } from "../types";

/** Turn a role name into a stable slug key for a new role. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Admin Roles tab: list the role catalog and (for super-admins) create, edit and
 *  delete roles. A roles.assign delegate sees the list read-only so they know what
 *  each role grants before assigning it in User Management. */
export function RoleManagement() {
  const fetchRoles = useStore((s) => s.fetchRoles);
  const deleteRole = useStore((s) => s.deleteRole);
  const isAdmin = useStore((s) => s.isAdmin);

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  async function load() {
    setRoles(await fetchRoles());
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <UserCog size={16} className="text-accent" /> Roles
          </h3>
          <p className="mt-0.5 text-[11px] text-subtle">
            Bundle individual admin capabilities into a role, then assign it to users in User
            Management.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105"
          >
            <Plus size={15} /> New role
          </button>
        )}
      </div>

      {roles === null ? (
        <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-muted">
          Loading roles…
        </div>
      ) : roles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-12 text-center text-sm text-muted">
          No roles yet.{isAdmin ? " Create one to get started." : ""}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {roles.map((r) => (
            <div key={r.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base text-ink">{r.name}</span>
                    {r.isSystem && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-panel px-1.5 py-0.5 text-[10px] font-medium text-subtle">
                        <Lock size={9} /> System
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
                      <UsersIcon size={11} /> {r.memberCount ?? 0}
                    </span>
                  </div>
                  {r.description && (
                    <p className="mt-0.5 text-xs text-muted">{r.description}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => setEditing(r)}
                      className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink transition hover:bg-panel"
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    {!r.isSystem &&
                      (pendingDelete === r.id ? (
                        <>
                          <button
                            onClick={async () => {
                              const ok = await deleteRole(r.id);
                              if (ok) {
                                setPendingDelete(null);
                                await load();
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-105"
                          >
                            <Trash2 size={13} /> Confirm
                          </button>
                          <button
                            onClick={() => setPendingDelete(null)}
                            className="rounded-lg border border-line px-2 py-1.5 text-xs text-muted transition hover:bg-panel"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setPendingDelete(r.id)}
                          title="Delete role"
                          className="inline-flex items-center rounded-lg border border-line p-1.5 text-subtle transition hover:text-danger"
                        >
                          <Trash2 size={13} />
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {r.permissions.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {r.permissions.map((p) => {
                    const info = PERMISSIONS.find((x) => x.key === p);
                    return (
                      <span
                        key={p}
                        title={info?.description}
                        className="inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-accent"
                      >
                        {info?.label ?? p}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-subtle">No permissions yet.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && isAdmin && (
        <RoleEditor
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** Create/edit modal for a role. */
function RoleEditor({
  role,
  onClose,
  onSaved,
}: {
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  useScrollLock(true);
  const upsertRole = useStore((s) => s.upsertRole);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<Permission>>(new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(
    () => PERMISSION_GROUPS.map((g) => ({ group: g, items: PERMISSIONS.filter((p) => p.group === g) })),
    [],
  );

  function toggle(key: Permission) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSave() {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await upsertRole({
      id: role?.id ?? null,
      key: role?.key ?? (slugify(name) || `role-${Date.now()}`),
      name: name.trim(),
      description: description.trim(),
      permissions: Array.from(perms),
    });
    setSaving(false);
    if (ok) onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line p-4">
          <h3 className="inline-flex items-center gap-2 font-display text-lg text-ink">
            <UserCog size={16} className="text-accent" /> {role ? "Edit role" : "New role"}
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-subtle transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-ink">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Moderator"
              className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
            />
          </label>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-ink">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this role is for (optional)"
              className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
            />
          </label>

          {!role && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-subtle">
                <Sparkles size={12} /> Start from
              </span>
              <button
                onClick={() => setPerms(new Set(MODERATOR_PRESET))}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:bg-panel hover:text-ink"
              >
                Moderator
              </button>
              <button
                onClick={() => setPerms(new Set(QA_PRESET))}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:bg-panel hover:text-ink"
              >
                QA
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  {group}
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((p) => (
                    <label
                      key={p.key}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-panel/40 p-2.5 transition hover:bg-panel"
                    >
                      <input
                        type="checkbox"
                        checked={perms.has(p.key)}
                        onChange={() => toggle(p.key)}
                        className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-ink">{p.label}</span>
                        <span className="block text-[11px] text-subtle">{p.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line p-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
          >
            {role ? "Save role" : "Create role"}
          </button>
        </div>
      </div>
    </div>
  );
}
