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
  Mail,
  Check,
  Plus,
  Users,
  Layers,
  Award,
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
import type { AdminUser, Badge } from "../types";
import type { SlotDefinition, TargetedSlot } from "../lib/slots";

function rangeLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "any length";
  if (min != null && max != null) return `${min}–${max}h`;
  if (max != null) return `up to ${max}h`;
  return `${min}h and up`;
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
  const [view, setView] = useState<"users" | "slots">("users");
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

  async function reloadDefs() {
    setDefs(await fetchSlotDefinitions());
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
                  <Shield size={18} className="text-accent" /> Admin
                </>
              )}
            </h2>
          </div>
        </div>

        {!selected && (
          <div className="flex gap-1 border-b border-line px-4 pb-3 pt-1">
            {(
              [
                { id: "users", label: "Users", icon: Users },
                { id: "slots", label: "Slot types", icon: Layers },
              ] as const
            ).map((t) => {
              const active = view === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setView(t.id)}
                  className={
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                    (active ? "bg-panel text-ink" : "text-muted hover:text-ink")
                  }
                >
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
        )}

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
          ) : view === "slots" ? (
            <SlotTypes defs={defs} reload={reloadDefs} />
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
                      <span className="inline-flex items-center gap-1" title="Now Playing slots">
                        <Gamepad2 size={12} /> {u.generalSlots}
                      </span>
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
  const { fetchUserSlots, grantUserSlot, revokeUserSlot, notifyUser, fetchBadges, grantBadge, revokeBadge } =
    useStore();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [coins, setCoins] = useState(String(user.coins));
  const [vouchers, setVouchers] = useState(String(user.vouchers));
  const [slots, setSlots] = useState(String(user.generalSlots));
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

  async function loadGrants() {
    setGrants(await fetchUserSlots(user.id));
  }

  useEffect(() => {
    void loadGrants();
    void fetchBadges().then(setCatalog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Badges this user doesn't already hold — the grantable set.
  const grantableBadges = catalog.filter((b) => !userBadges.some((ub) => ub.id === b.id));

  const activeDefs = defs.filter((d) => d.active);

  async function onSave() {
    setWorking(true);
    const after = {
      coins: Math.max(0, Math.floor(Number(coins) || 0)),
      vouchers: Math.max(0, Math.min(100, Math.floor(Number(vouchers) || 0))),
      generalSlots: Math.max(0, Math.min(99, Math.floor(Number(slots) || 0))),
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
                  <span className="text-xs text-subtle">
                    · {rangeLabel(g.definition.minHours, g.definition.maxHours)}
                  </span>
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
                {d.name} ({rangeLabel(d.minHours, d.maxHours)})
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

// Admin catalog of targeted-slot rules. Each rule has a name and an optional
// hour range; a game fits the slot only if its length falls inside the range.
function SlotTypes({ defs, reload }: { defs: SlotDefinition[]; reload: () => Promise<void> }) {
  const { createSlotDefinition } = useStore();
  const [name, setName] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [working, setWorking] = useState(false);

  function parseBound(v: string): number | null {
    const n = Number(v);
    return v.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n));
  }

  async function create() {
    if (!name.trim()) return;
    setWorking(true);
    const ok = await createSlotDefinition(name.trim(), parseBound(min), parseBound(max));
    setWorking(false);
    if (ok) {
      setName("");
      setMin("");
      setMax("");
      await reload();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-subtle">
        Define targeted Now Playing slots. Leave a bound blank for no limit — e.g. a “Quick Clear”
        slot with max 10h only accepts games up to 10 hours long. Grant them to players from the
        Users tab.
      </p>

      <div className="rounded-xl border border-line p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">New slot type</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Quick Clear)"
          className="mb-2 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-muted">
            Min hours
            <input
              type="number"
              min={0}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
            />
          </label>
          <label className="flex-1 text-xs text-muted">
            Max hours
            <input
              type="number"
              min={0}
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
            />
          </label>
          <button
            onClick={create}
            disabled={!name.trim() || working}
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

function SlotDefRow({ def, reload }: { def: SlotDefinition; reload: () => Promise<void> }) {
  const { updateSlotDefinition, deleteSlotDefinition } = useStore();
  const [name, setName] = useState(def.name);
  const [min, setMin] = useState(def.minHours == null ? "" : String(def.minHours));
  const [max, setMax] = useState(def.maxHours == null ? "" : String(def.maxHours));
  const [active, setActive] = useState(def.active);
  const [working, setWorking] = useState(false);

  function parseBound(v: string): number | null {
    const n = Number(v);
    return v.trim() === "" || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n));
  }

  const dirty =
    name !== def.name ||
    parseBound(min) !== def.minHours ||
    parseBound(max) !== def.maxHours ||
    active !== def.active;

  async function save() {
    setWorking(true);
    const ok = await updateSlotDefinition({
      ...def,
      name: name.trim() || def.name,
      minHours: parseBound(min),
      maxHours: parseBound(max),
      active,
    });
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
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
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
      <div className="mt-2 flex items-end gap-2">
        <label className="flex-1 text-[11px] text-subtle">
          Min h
          <input
            type="number"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="—"
            className="mt-0.5 w-full rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex-1 text-[11px] text-subtle">
          Max h
          <input
            type="number"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="—"
            className="mt-0.5 w-full rounded-lg border border-line bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
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
