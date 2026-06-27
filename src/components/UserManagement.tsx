import { useEffect, useMemo, useState } from "react";
import {
  X,
  ChevronLeft,
  Search,
  Shield,
  Ban,
  EyeOff,
  Gamepad2,
  Trash2,
  Coins,
  Ticket,
  RotateCcw,
  Timer,
  Infinity as InfinityIcon,
  Mail,
  Check,
  Plus,
  Layers,
  Award,
  UserCog,
} from "lucide-react";
import { CoinIcon } from "./CoinIcon";
import { Avatar } from "./Avatar";
import { AvatarWithPresence } from "./PresenceDot";
import { TitleBadge } from "./TitleBadge";
import { isOnline } from "../lib/presence";
import { sortBadges } from "../lib/badges";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";
import { summarizeUserChanges, buildChangeBody, appendNote } from "../lib/adminChanges";
import { canAssignRole } from "../lib/permissions";
import type { AdminUser, Badge, Role, UserRole } from "../types";
import { slotCriteriaSummary, type SlotDefinition, type SlotKind, type TargetedSlot } from "../lib/slots";
import { PLATFORMS } from "../lib/platforms";

// Icon + label per slot kind, mirroring the Now Playing board, so the admin user
// list can reflect the different targeted slot types a user holds at a glance.
const SLOT_KIND_META: Record<SlotKind, { icon: typeof Timer; label: string }> = {
  standard: { icon: Timer, label: "Targeted" },
  endless: { icon: InfinityIcon, label: "Endless" },
  replay: { icon: RotateCcw, label: "Replay" },
};
const SLOT_KIND_ORDER: SlotKind[] = ["standard", "endless", "replay"];

/** A compact row of "kind icon + count" chips summarizing a user's granted targeted
 *  slots (e.g. one Endless + one Replay), with the slot names in the tooltip. */
function TargetedSlotSummary({ slots }: { slots: AdminUser["targetedSlots"] }) {
  if (slots.length === 0) return null;
  return (
    <>
      {SLOT_KIND_ORDER.map((kind) => {
        const ofKind = slots.filter((s) => s.kind === kind);
        if (ofKind.length === 0) return null;
        const { icon: Icon, label } = SLOT_KIND_META[kind];
        return (
          <span
            key={kind}
            className="inline-flex items-center gap-1"
            title={`${label} slot${ofKind.length === 1 ? "" : "s"}: ${ofKind.map((s) => s.name).join(", ")}`}
          >
            <Icon size={12} className="text-accent" /> {ofKind.length}
          </span>
        );
      })}
    </>
  );
}

// The slot behaviours an admin can choose when defining a slot type.
const SLOT_KINDS: { value: SlotKind; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "Matches games by the criteria below (length, era, genre, platform, score)." },
  { value: "endless", label: "Endless", hint: "Ongoing/live-service slot; any game, never auto-filled." },
  { value: "replay", label: "Replay", hint: "Pulls a finished game back into play for free." },
];

// Segmented control to pick a slot kind (shared by the create form + edit row).
function SlotKindPicker({ kind, onChange }: { kind: SlotKind; onChange: (k: SlotKind) => void }) {
  return (
    <div className="inline-flex w-full overflow-hidden rounded-lg border border-line">
      {SLOT_KINDS.map((k) => {
        const active = kind === k.value;
        return (
          <button
            key={k.value}
            type="button"
            aria-pressed={active}
            title={k.hint}
            onClick={() => onChange(k.value)}
            className={
              "flex-1 px-2 py-1.5 text-xs font-medium transition " +
              (active ? "bg-brand text-brand-fg" : "bg-panel text-muted hover:text-ink")
            }
          >
            {k.label}
          </button>
        );
      })}
    </div>
  );
}


function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function UserManagement() {
  const { fetchUsers, adminUpdateUser, adminDeleteUser, fetchSlotDefinitions, userId } = useStore();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [defs, setDefs] = useState<SlotDefinition[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setUsers(null);
    setLoadError(false);
    try {
      const [u, d] = await Promise.all([fetchUsers(), fetchSlotDefinitions()]);
      setUsers(u);
      setDefs(d);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const selected = users?.find((u) => u.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelectedId(null)}
                className="grid place-items-center rounded-md p-1 text-muted transition hover:bg-panel hover:text-ink"
                title="Back to users"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
              {selected ? (
                <>
                  <Avatar url={selected.avatarUrl} name={selected.displayName} size={24} />
                  {selected.displayName}
                </>
              ) : (
                <>
                  <Shield size={18} className="text-accent" /> Users
                </>
              )}
            </h2>
          </div>
        </div>

        <div className="p-4">
          {selected ? (
            <UserEditor
              key={selected.id}
              user={selected}
              isSelf={selected.id === userId}
              defs={defs}
              onSaved={async () => {
                await load();
                setSelectedId(null);
              }}
              onDeleted={async () => {
                await load();
                setSelectedId(null);
              }}
              save={adminUpdateUser}
              remove={adminDeleteUser}
            />
          ) : (
            <>
              <div className="relative mb-3">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full rounded-lg border border-line bg-panel py-2 pl-8 pr-3 text-sm text-ink outline-none focus:border-brand"
                />
              </div>

              {loadError && (
                <p className="text-sm text-danger">Couldn&apos;t load users.</p>
              )}
              {!users && !loadError && <p className="text-sm text-muted">Loading…</p>}
              {users && filtered.length === 0 && (
                <p className="text-sm text-muted">No users match.</p>
              )}

              <div className="flex flex-col gap-2">
                {filtered.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedId(u.id)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 p-3 text-left transition hover:border-brand/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <AvatarWithPresence
                        url={u.avatarUrl}
                        name={u.displayName}
                        size={36}
                        online={isOnline(u.lastSeenAt)}
                      />
                      <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-ink">{u.displayName}</span>
                        {u.isAdmin && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                            <Shield size={10} /> Admin
                          </span>
                        )}
                        {u.blocked && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                            <Ban size={10} /> Blocked
                          </span>
                        )}
                        {u.hidden && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-line px-1.5 py-0.5 text-[10px] font-semibold text-subtle">
                            <EyeOff size={10} /> Hidden
                          </span>
                        )}
                        {!u.isAdmin &&
                          u.roles.map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex items-center gap-0.5 rounded-full bg-panel px-1.5 py-0.5 text-[10px] font-medium text-muted"
                            >
                              <UserCog size={10} /> {r.name}
                            </span>
                          ))}
                      </div>
                      <div className="truncate text-xs text-subtle">
                        {isOnline(u.lastSeenAt) ? (
                          <span className="text-success">{u.activity ?? "Online"}</span>
                        ) : (
                          (u.email ?? "—")
                        )}
                      </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1" title="Coins">
                        <CoinIcon size={12} /> {u.coins}
                      </span>
                      {u.vouchers > 0 && (
                        <span className="inline-flex items-center gap-1" title="Free Game Vouchers">
                          <Ticket size={12} className="text-brand" /> {u.vouchers}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1" title="General slots">
                        <Gamepad2 size={12} /> {u.generalSlots}
                      </span>
                      <TargetedSlotSummary slots={u.targetedSlots} />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
  );
}

/** The standalone "Slots" admin tab: define Now Playing slot types and the default
 *  loadout. Slots used to be a sub-tab of Users; they're a feature of their own now.
 *  (Granting a slot type to a specific user still lives in that user's editor.) */
export function SlotManagement() {
  const fetchSlotDefinitions = useStore((s) => s.fetchSlotDefinitions);
  const [defs, setDefs] = useState<SlotDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setDefs(await fetchSlotDefinitions());
  }
  useEffect(() => {
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Layers size={18} className="text-accent" /> Slot types
        </h2>
      </div>
      <div className="p-4">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <SlotTypes defs={defs} reload={reload} />
        )}
      </div>
    </div>
  );
}

function UserEditor({
  user,
  isSelf,
  defs,
  onSaved,
  onDeleted,
  save,
  remove,
}: {
  user: AdminUser;
  isSelf: boolean;
  defs: SlotDefinition[];
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  save: (u: AdminUser) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}) {
  const {
    fetchUserSlots,
    grantUserSlot,
    revokeUserSlot,
    notifyUser,
    fetchBadges,
    grantBadge,
    revokeBadge,
    adminResetOnboarding,
    fetchRoles,
    assignRole,
    revokeRole,
    isAdmin: callerIsAdmin,
    permissions: callerPerms,
  } = useStore();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [coins, setCoins] = useState(String(user.coins));
  const [vouchers, setVouchers] = useState(String(user.vouchers));
  const [slots, setSlots] = useState(String(user.generalSlots));
  const [rotSlots, setRotSlots] = useState(String(user.rotationSlots));
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [blocked, setBlocked] = useState(user.blocked);
  const [reason, setReason] = useState(user.blockedReason ?? "");
  const [hidden, setHidden] = useState(user.hidden);
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [grants, setGrants] = useState<TargetedSlot[] | null>(null);
  const [grantDef, setGrantDef] = useState("");

  const [catalog, setCatalog] = useState<Badge[]>([]);
  const [userBadges, setUserBadges] = useState<Badge[]>(user.badges);
  const [grantBadgeId, setGrantBadgeId] = useState("");

  const [roleCatalog, setRoleCatalog] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>(user.roles);
  const [grantRoleId, setGrantRoleId] = useState("");
  // Whether the caller can manage role assignments at all (drives the Roles
  // section). Super-admins manage everything; a delegate needs roles.assign.
  const canManageRoles = callerIsAdmin || callerPerms.includes("roles.assign");

  async function loadGrants() {
    setGrants(await fetchUserSlots(user.id));
  }

  useEffect(() => {
    void loadGrants();
    void fetchBadges().then(setCatalog);
    if (canManageRoles) void fetchRoles().then(setRoleCatalog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Badges this user doesn't already hold — the grantable set.
  const grantableBadges = catalog.filter((b) => !userBadges.some((ub) => ub.id === b.id));

  // Roles this user doesn't already hold, that the caller is allowed to grant
  // (super-admins: any; a delegate: only roles within their own permissions).
  const assignableRoles = roleCatalog.filter(
    (r) =>
      !userRoles.some((ur) => ur.id === r.id) &&
      canAssignRole(callerPerms, callerIsAdmin, r.permissions),
  );
  // May the caller remove this already-assigned role? (Same subset rule.)
  const canRemoveRole = (roleId: string) => {
    if (callerIsAdmin) return true;
    const r = roleCatalog.find((x) => x.id === roleId);
    return r ? canAssignRole(callerPerms, callerIsAdmin, r.permissions) : false;
  };

  const activeDefs = defs.filter((d) => d.active);
  const tutorialDone = user.onboardingCompletedAt != null;

  async function onSave() {
    setWorking(true);
    const after = {
      coins: Math.max(0, Math.floor(Number(coins) || 0)),
      vouchers: Math.max(0, Math.min(100, Math.floor(Number(vouchers) || 0))),
      generalSlots: Math.max(0, Math.min(99, Math.floor(Number(slots) || 0))),
      rotationSlots: Math.max(0, Math.min(99, Math.floor(Number(rotSlots) || 0))),
      isAdmin,
      blocked,
    };
    const ok = await save({
      ...user,
      displayName: displayName.trim() || user.displayName,
      ...after,
      blockedReason: reason.trim() || null,
      hidden,
    });
    if (ok) {
      // Tell the user what changed (with the optional note), unless it's yourself.
      const body = buildChangeBody(summarizeUserChanges(user, after), note);
      if (body && !isSelf) await notifyUser(user.id, "An admin updated your account", body);
    }
    setWorking(false);
    if (ok) await onSaved();
  }

  async function onDelete() {
    setWorking(true);
    const ok = await remove(user.id);
    setWorking(false);
    if (ok) await onDeleted();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Mail size={14} className="text-subtle" />
        <span className="truncate">{user.email ?? "—"}</span>
      </div>
      <div className="text-xs text-subtle">
        Joined {fmtDate(user.createdAt)} · {user.gamesCount} game
        {user.gamesCount === 1 ? "" : "s"}
      </div>

      {!isSelf && (
        <label className="block text-sm">
          <span className="mb-1 block text-ink">Reason / note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional — included in the notification this user receives for changes below"
            className="w-full resize-none rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-ink">Display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-ink outline-none focus:border-brand"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 text-ink">
            <Coins size={13} className="text-accent" /> Coins
          </span>
          <input
            type="number"
            min={0}
            value={coins}
            onChange={(e) => setCoins(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 text-ink">
            <Ticket size={13} className="text-brand" /> Vouchers
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={vouchers}
            onChange={(e) => setVouchers(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 text-ink">
            <Gamepad2 size={13} className="text-accent" /> General slots
          </span>
          <input
            type="number"
            min={0}
            max={99}
            value={slots}
            onChange={(e) => setSlots(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 flex items-center gap-1 text-ink">
            <Gamepad2 size={13} className="text-accent" /> Rotation lane size
          </span>
          <input
            type="number"
            min={0}
            max={99}
            value={rotSlots}
            onChange={(e) => setRotSlots(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-ink outline-none focus:border-brand"
          />
        </label>
      </div>

      <div className="rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm text-ink">
          <Layers size={14} className="text-accent" /> Targeted slots
        </div>
        {grants === null ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : grants.length === 0 ? (
          <p className="text-xs text-subtle">None granted.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {grants.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-panel px-2 py-1.5 text-sm"
              >
                <span className="text-ink">
                  {g.definition.name}{" "}
                  <span className="text-xs text-subtle">· {slotCriteriaSummary(g.definition)}</span>
                </span>
                <button
                  onClick={async () => {
                    if (await revokeUserSlot(g.id)) {
                      if (!isSelf)
                        await notifyUser(
                          user.id,
                          "A Now Playing slot was removed",
                          appendNote(`Your "${g.definition.name}" slot was removed.`, note),
                        );
                      await loadGrants();
                    }
                  }}
                  title="Revoke slot"
                  className="rounded-md p-1 text-muted transition hover:bg-surface hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <select
            value={grantDef}
            onChange={(e) => setGrantDef(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="">
              {activeDefs.length ? "Grant a slot type…" : "No slot types — create one first"}
            </option>
            {activeDefs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({slotCriteriaSummary(d)})
              </option>
            ))}
          </select>
          <button
            disabled={!grantDef}
            onClick={async () => {
              if (await grantUserSlot(user.id, grantDef)) {
                const def = activeDefs.find((d) => d.id === grantDef);
                if (def && !isSelf)
                  await notifyUser(
                    user.id,
                    "You were granted a Now Playing slot",
                    appendNote(`New slot: "${def.name}".`, note),
                  );
                setGrantDef("");
                await loadGrants();
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
          >
            <Plus size={14} /> Grant
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-line p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm text-ink">
          <Award size={14} className="text-accent" /> Badges
        </div>
        {userBadges.length === 0 ? (
          <p className="text-xs text-subtle">None granted.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {sortBadges(userBadges).map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1 rounded-lg bg-panel px-1.5 py-1"
              >
                <TitleBadge badge={b} size="xs" />
                <button
                  onClick={async () => {
                    await revokeBadge(user.id, b.id);
                    setUserBadges((prev) => prev.filter((x) => x.id !== b.id));
                  }}
                  title={`Revoke ${b.name}`}
                  aria-label={`Revoke ${b.name}`}
                  className="rounded-full p-0.5 text-muted transition hover:bg-surface hover:text-danger"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <select
            value={grantBadgeId}
            onChange={(e) => setGrantBadgeId(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="">
              {grantableBadges.length ? "Grant a badge…" : "No more badges to grant"}
            </option>
            {grantableBadges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            disabled={!grantBadgeId}
            onClick={async () => {
              const b = catalog.find((x) => x.id === grantBadgeId);
              await grantBadge(user.id, grantBadgeId);
              if (b) setUserBadges((prev) => [...prev, b]);
              setGrantBadgeId("");
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
          >
            <Plus size={14} /> Grant
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">
          Granting a badge notifies the user. Revoking keeps the historical record and removes it
          from their profile.
        </p>
      </div>

      {canManageRoles && (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 inline-flex items-center gap-1.5 text-sm text-ink">
            <UserCog size={14} className="text-accent" /> Roles
          </div>
          {userRoles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {userRoles.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-accent"
                >
                  {r.name}
                  {canRemoveRole(r.id) && (
                    <button
                      title={`Remove ${r.name}`}
                      onClick={async () => {
                        const ok = await revokeRole(user.id, r.id);
                        if (ok) setUserRoles((prev) => prev.filter((x) => x.id !== r.id));
                      }}
                      className="rounded-full p-0.5 text-subtle transition hover:text-danger"
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-subtle">No roles assigned.</p>
          )}
          {assignableRoles.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={grantRoleId}
                onChange={(e) => setGrantRoleId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="">Assign a role…</option>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!grantRoleId}
                onClick={async () => {
                  const r = roleCatalog.find((x) => x.id === grantRoleId);
                  const ok = await assignRole(user.id, grantRoleId);
                  if (ok && r) {
                    setUserRoles((prev) => [...prev, { id: r.id, key: r.key, name: r.name }]);
                    setGrantRoleId("");
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
              >
                <Plus size={14} /> Assign
              </button>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-subtle">
            Roles grant fine-grained admin capabilities. You can only assign roles within your own
            permissions.
          </p>
        </div>
      )}

      {/* The full Administrator (super-admin) toggle is reserved for super-admins. */}
      {callerIsAdmin && (
        <label
          className={
            "flex items-center justify-between gap-3 text-sm " +
            (isSelf ? "cursor-not-allowed opacity-60" : "cursor-pointer")
          }
        >
          <span className="inline-flex items-center gap-1.5 text-ink">
            <Shield size={14} className="text-accent" /> Administrator
          </span>
          <input
            type="checkbox"
            checked={isAdmin}
            disabled={isSelf}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
        </label>
      )}

      <div className="rounded-xl border border-line p-3">
        <label
          className={
            "flex items-center justify-between gap-3 text-sm " +
            (isSelf ? "cursor-not-allowed opacity-60" : "cursor-pointer")
          }
        >
          <span className="inline-flex items-center gap-1.5 text-ink">
            <Ban size={14} className="text-danger" /> Blocked (locked out)
          </span>
          <input
            type="checkbox"
            checked={blocked}
            disabled={isSelf}
            onChange={(e) => setBlocked(e.target.checked)}
            className="h-4 w-4 accent-[var(--danger)]"
          />
        </label>
        {blocked && (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason shown to the user (optional)"
            className="mt-2 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        )}
      </div>

      <div className="rounded-xl border border-line p-3">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-ink">
            <EyeOff size={14} className="text-muted" /> Hidden from leaderboard
          </span>
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
        </label>
        <p className="mt-1.5 text-[11px] text-subtle">
          Keeps this account off the leaderboard and out of its stats. The account
          still works normally — use this for test or bot accounts.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3">
        <div className="min-w-0">
          <div className="inline-flex flex-wrap items-center gap-1.5 text-sm text-ink">
            <Ticket size={14} className="text-brand" /> Onboarding tutorial
            {tutorialDone ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                <Check size={10} /> Completed
              </span>
            ) : (
              <span className="rounded-full bg-panel px-2 py-0.5 text-[10px] font-medium text-muted">
                Not completed
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-subtle">
            {tutorialDone
              ? `Finished ${fmtDate(user.onboardingCompletedAt!)}. Reset to run the full new-player tour again, as if they'd just signed up — they'll be re-granted the starter vouchers when they finish.`
              : "They haven't finished the tour yet, so there's nothing to reset."}
          </p>
        </div>
        <button
          onClick={() => void adminResetOnboarding(user.id)}
          disabled={working || !tutorialDone}
          title={tutorialDone ? "Reset their onboarding" : "They haven't completed the tutorial yet"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={14} className="text-accent" /> Reset tutorial
        </button>
      </div>

      {isSelf && (
        <p className="text-[11px] text-subtle">
          You can&apos;t remove your own admin rights or block yourself.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {confirmDelete ? (
          <div className="flex w-full flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-2.5">
            <p className="text-xs text-danger">
              Permanently delete {user.displayName} and all their data? This can&apos;t be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={onDelete}
                disabled={working}
                className="flex-1 rounded-lg bg-danger px-2 py-1.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
              >
                Delete user
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-line px-2 py-1.5 text-sm text-muted transition hover:bg-panel hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isSelf || working}
              title={isSelf ? "You can't delete your own account here" : "Delete user"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-sm text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} /> Delete
            </button>
            <button
              onClick={onSave}
              disabled={working}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
            >
              <Check size={15} /> {working ? "Saving…" : "Save changes"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Slot-type editor ──────────────────────────────────────────────────────
// A slot definition's editable fields as form strings/lists. Shared by the
// create form and each edit row so the criteria editor lives in one place.
interface SlotDraft {
  name: string;
  kind: SlotKind;
  minHours: string;
  maxHours: string;
  minYear: string;
  maxYear: string;
  minMc: string;
  maxMc: string;
  genres: string[];
  platforms: string[];
  grant: string; // default grant count for new accounts
}

function parseBound(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n));
}

function emptyDraft(): SlotDraft {
  return {
    name: "",
    kind: "standard",
    minHours: "",
    maxHours: "",
    minYear: "",
    maxYear: "",
    minMc: "",
    maxMc: "",
    genres: [],
    platforms: [],
    grant: "0",
  };
}

function draftFromDef(def: SlotDefinition): SlotDraft {
  const s = (n: number | null) => (n == null ? "" : String(n));
  return {
    name: def.name,
    kind: def.kind,
    minHours: s(def.minHours),
    maxHours: s(def.maxHours),
    minYear: s(def.minYear),
    maxYear: s(def.maxYear),
    minMc: s(def.minMetacritic),
    maxMc: s(def.maxMetacritic),
    genres: def.genres,
    platforms: def.platforms,
    grant: String(def.defaultGrantCount),
  };
}

/** The persistable shape of a draft (without id/active), used for both saving and
 *  normalized dirty-comparison. */
function draftToDef(draft: SlotDraft): Omit<SlotDefinition, "id" | "active"> {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    minHours: parseBound(draft.minHours),
    maxHours: parseBound(draft.maxHours),
    minYear: parseBound(draft.minYear),
    maxYear: parseBound(draft.maxYear),
    minMetacritic: parseBound(draft.minMc),
    maxMetacritic: parseBound(draft.maxMc),
    genres: draft.genres,
    platforms: draft.platforms,
    defaultGrantCount: Math.max(0, Math.floor(Number(draft.grant) || 0)),
  };
}

// A min/max numeric pair (hours / year / score).
function BoundPair({
  label,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
}) {
  const cls =
    "mt-0.5 w-full rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-brand";
  return (
    <div className="flex-1">
      <div className="text-[11px] text-subtle">{label}</div>
      <div className="mt-0.5 flex items-center gap-1">
        <input type="number" value={min} onChange={(e) => onMin(e.target.value)} placeholder="min" className={cls} />
        <span className="text-subtle">–</span>
        <input type="number" value={max} onChange={(e) => onMax(e.target.value)} placeholder="max" className={cls} />
      </div>
    </div>
  );
}

// An add/remove tag input for a string list (genres, platforms).
function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  listId,
  options,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  listId?: string;
  options?: string[];
}) {
  const [text, setText] = useState("");
  function add(raw: string) {
    const t = raw.trim();
    if (t && !values.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...values, t]);
    setText("");
  }
  return (
    <div className="flex-1">
      <div className="text-[11px] text-subtle">{label}</div>
      {values.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-accent">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="text-accent/70 transition hover:text-danger"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={text}
        list={listId}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => add(text)}
        className="mt-1 w-full rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-brand"
      />
      {options && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </div>
  );
}

// The criteria + default-grant fields, shared by create + edit. Criteria inputs
// show only for the standard kind (endless/replay match any game).
function SlotDefFields({ draft, set }: { draft: SlotDraft; set: (patch: Partial<SlotDraft>) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <SlotKindPicker kind={draft.kind} onChange={(k) => set({ kind: k })} />
      {draft.kind === "standard" ? (
        <>
          <div className="flex flex-wrap items-start gap-2">
            <BoundPair label="Hours" min={draft.minHours} max={draft.maxHours} onMin={(v) => set({ minHours: v })} onMax={(v) => set({ maxHours: v })} />
            <BoundPair label="Release year" min={draft.minYear} max={draft.maxYear} onMin={(v) => set({ minYear: v })} onMax={(v) => set({ maxYear: v })} />
            <BoundPair label="Metacritic" min={draft.minMc} max={draft.maxMc} onMin={(v) => set({ minMc: v })} onMax={(v) => set({ maxMc: v })} />
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <ChipInput label="Genres (any of)" values={draft.genres} onChange={(v) => set({ genres: v })} placeholder="Add a genre…" />
            <ChipInput
              label="Platforms (any of — e.g. a “Handheld” group)"
              values={draft.platforms}
              onChange={(v) => set({ platforms: v })}
              placeholder="Add a platform…"
              listId="slot-platform-options"
              options={PLATFORMS.map((p) => p.label)}
            />
          </div>
        </>
      ) : (
        <p className="text-[11px] text-subtle">{SLOT_KINDS.find((k) => k.value === draft.kind)!.hint}</p>
      )}
      <label className="flex items-center gap-2 text-[11px] text-subtle">
        Default grant for new accounts
        <input
          type="number"
          min={0}
          value={draft.grant}
          onChange={(e) => set({ grant: e.target.value })}
          className="w-16 rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-brand"
        />
      </label>
    </div>
  );
}

// Admin catalog of slot types: the default loadout for new accounts plus the
// per-type rules (criteria, behaviour, default grant). Granted to players from
// the Users tab.
function SlotTypes({ defs, reload }: { defs: SlotDefinition[]; reload: () => Promise<void> }) {
  const { createSlotDefinition, defaultGeneralSlots, setDefaultGeneralSlots, can } = useStore();
  const [draft, setDraft] = useState<SlotDraft>(emptyDraft());
  const [working, setWorking] = useState(false);
  const set = (patch: Partial<SlotDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function create() {
    if (!draft.name.trim()) return;
    setWorking(true);
    const ok = await createSlotDefinition({ ...draftToDef(draft), active: true });
    setWorking(false);
    if (ok) {
      setDraft(emptyDraft());
      await reload();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {can("economy.edit") && (
        <DefaultGeneralSlots value={defaultGeneralSlots} onSave={setDefaultGeneralSlots} />
      )}

      <p className="text-xs text-subtle">
        Define Now Playing slots and grant them to players from the Users tab. A{" "}
        <span className="text-ink">Standard</span> slot matches games by your criteria (length, era,
        genre, platform, score). An <span className="text-ink">Endless</span> slot holds one ongoing
        game without using a general slot. A <span className="text-ink">Replay</span> slot lets a
        player revisit a finished game for free. A slot's <span className="text-ink">default grant</span>{" "}
        is how many copies every new account starts with.
      </p>

      <div className="rounded-xl border border-line p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">New slot type</div>
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Name (e.g. Quick Clear, Classic RPG, Handheld)"
          className="mb-2 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        <SlotDefFields draft={draft} set={set} />
        <div className="mt-2 flex justify-end">
          <button
            onClick={create}
            disabled={!draft.name.trim() || working}
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {defs.length === 0 ? (
        <p className="text-sm text-muted">No slot types yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {defs.map((d) => (
            <SlotDefRow key={d.id} def={d} reload={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// The "default loadout" general-slot count applied to brand-new accounts.
function DefaultGeneralSlots({ value, onSave }: { value: number; onSave: (n: number) => Promise<boolean> }) {
  const [n, setN] = useState(String(value));
  const [working, setWorking] = useState(false);
  const dirty = parseBound(n) !== value && n.trim() !== "";
  async function save() {
    setWorking(true);
    await onSave(Math.max(0, Math.floor(Number(n) || 0)));
    setWorking(false);
  }
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-subtle">Default loadout (new accounts)</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          General slots
          <input
            type="number"
            min={0}
            value={n}
            onChange={(e) => setN(e.target.value)}
            className="mt-1 block w-20 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <button
          onClick={save}
          disabled={!dirty || working}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-40"
        >
          Save
        </button>
        <p className="flex-1 text-[11px] text-subtle">
          New accounts start with this many general slots, plus each slot type's default grant below.
          Existing accounts are unchanged.
        </p>
      </div>
    </div>
  );
}

function SlotDefRow({ def, reload }: { def: SlotDefinition; reload: () => Promise<void> }) {
  const { updateSlotDefinition, deleteSlotDefinition } = useStore();
  const [draft, setDraft] = useState<SlotDraft>(draftFromDef(def));
  const [active, setActive] = useState(def.active);
  const [working, setWorking] = useState(false);
  const set = (patch: Partial<SlotDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const dirty =
    JSON.stringify(draftToDef(draft)) !== JSON.stringify(draftToDef(draftFromDef(def))) ||
    active !== def.active;

  async function save() {
    setWorking(true);
    const fields = draftToDef(draft);
    const ok = await updateSlotDefinition({ ...def, ...fields, name: fields.name || def.name, active });
    setWorking(false);
    if (ok) await reload();
  }

  async function remove() {
    setWorking(true);
    const ok = await deleteSlotDefinition(def.id);
    setWorking(false);
    if (ok) await reload();
  }

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          className="flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        <label
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs text-muted"
          title="Active slots can be granted and matched"
        >
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Active
        </label>
      </div>
      <SlotDefFields draft={draft} set={set} />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={save}
          disabled={!dirty || working}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={remove}
          disabled={working}
          title="Delete slot type"
          className="rounded-lg border border-danger/40 p-1.5 text-danger transition hover:bg-danger/10 disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
