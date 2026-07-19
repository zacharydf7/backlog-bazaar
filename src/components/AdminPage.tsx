import { useState } from "react";
import {
  Shield,
  Coins,
  Inbox,
  Library,
  Layers,
  Wrench,
  SlidersHorizontal,
  Palette,
  BarChart3,
  UserCog,
  Tags,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { COIN_VARIANTS } from "../lib/coins";
import type { View } from "./Sidebar";
import { UserManagement } from "./UserManagement";
import { EconomyAdmin } from "./EconomyAdmin";
import { SubmissionQueue } from "./SubmissionQueue";
import { CatalogManager } from "./CatalogManager";
import { TaxonomyManager } from "./TaxonomyManager";
import { StatsAdmin } from "./StatsAdmin";
import { RoleManagement } from "./RoleManagement";
import { ReportsQueue } from "./ReportsQueue";
import type { Permission } from "../lib/permissions";

// One consolidated admin console. Rather than bouncing to separate full pages,
// every admin area lives behind a tab here: Users, Economy, Submissions, and the
// site/economy Settings that used to be buried in the Account panel. Each of the
// four admin views renders this same component (with its tab active), so deep
// links and the browser Back button keep working while the console stays put.

// Each tab is shown only if the caller holds at least one of its permissions
// (super-admins hold them all). The Roles tab is reachable by a roles.assign
// delegate or a super-admin.
const TABS: { view: View; label: string; icon: LucideIcon; perms: Permission[] }[] = [
  { view: "users", label: "Users", icon: Shield, perms: ["users.view"] },
  { view: "economy", label: "Economy", icon: Coins, perms: ["economy.edit"] },
  {
    view: "submissions",
    label: "Submissions",
    icon: Inbox,
    perms: ["submissions.games.moderate", "submissions.compilations.moderate"],
  },
  { view: "catalog", label: "Catalog", icon: Library, perms: ["catalog.manage"] },
  { view: "taxonomy", label: "Taxonomy", icon: Tags, perms: ["taxonomy.manage"] },
  { view: "reports", label: "Reports", icon: Flag, perms: ["reports.moderate"] },
  { view: "stats", label: "Stats", icon: BarChart3, perms: ["stats.view"] },
  { view: "roles", label: "Roles", icon: UserCog, perms: ["roles.assign"] },
  { view: "admin", label: "Settings", icon: SlidersHorizontal, perms: ["site.maintenance"] },
];

export function AdminPage({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (v: View) => void;
}) {
  const isAdmin = useStore((s) => s.isAdmin);
  const can = useStore((s) => s.can);
  const submissionCount = useStore((s) => s.submissionCount);
  const reportCount = useStore((s) => s.reportCount);

  // Per-tab "needs attention" badge counts.
  const badgeCount = (v: View): number =>
    v === "submissions" ? submissionCount : v === "reports" ? reportCount : 0;

  // Tabs this caller may see. Roles is also visible to super-admins (who manage
  // roles) even though roles.assign is a delegate permission.
  const tabs = TABS.filter(
    (t) => t.perms.some((p) => can(p)) || (t.view === "roles" && isAdmin),
  );

  if (tabs.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
        You don&apos;t have access to this area.
      </div>
    );
  }

  // If the requested view isn't one this caller may see, land on their first tab.
  const active = tabs.find((t) => t.view === view) ?? tabs[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
        <Shield size={18} className="text-accent" /> Manage
      </h2>

      {/* Tab bar — wraps on narrow screens so nothing clips on a phone. */}
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {tabs.map((t) => {
          const isActive = active.view === t.view;
          const Icon = t.icon;
          return (
            <button
              key={t.view}
              role="tab"
              aria-selected={isActive}
              onClick={() => onNavigate(t.view)}
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                (isActive
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-panel text-muted hover:text-ink")
              }
            >
              <Icon size={15} /> {t.label}
              {badgeCount(t.view) > 0 && (
                <span
                  className={
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold " +
                    (isActive ? "bg-brand-fg text-brand" : "bg-brand text-brand-fg")
                  }
                >
                  {badgeCount(t.view) > 99 ? "99+" : badgeCount(t.view)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        {active.view === "users" ? (
          <UserManagement />
        ) : active.view === "economy" ? (
          <EconomyAdmin />
        ) : active.view === "submissions" ? (
          <SubmissionQueue />
        ) : active.view === "catalog" ? (
          <CatalogManager />
        ) : active.view === "taxonomy" ? (
          <TaxonomyManager />
        ) : active.view === "reports" ? (
          <ReportsQueue />
        ) : active.view === "stats" ? (
          <StatsAdmin />
        ) : active.view === "roles" ? (
          <RoleManagement />
        ) : (
          <AdminSettings />
        )}
      </div>
    </div>
  );
}

/** Section wrapper for the settings cards. */
function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="mb-3 inline-flex items-center gap-2 font-display text-lg text-ink">
        <Icon size={16} className="text-accent" /> {title}
      </h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand";
const setBtnClass =
  "rounded-md bg-brand px-3 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50";

/** The site & economy levers relocated from the Account panel. Each control is
 *  self-contained and writes through the store's admin-guarded actions. */
function AdminSettings() {
  const {
    maintenanceFlag,
    maintenanceMessage,
    setMaintenance,
    defaultCoin,
    setDefaultCoin,
    coins,
    setCoins,
    activityOverride,
    setActivityOverride,
  } = useStore();

  const [maintMsg, setMaintMsg] = useState(maintenanceMessage ?? "");
  const [coinInput, setCoinInput] = useState(String(coins));
  const [activityInput, setActivityInput] = useState(activityOverride ?? "");

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <Card icon={Wrench} title="Site">
        <div>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
            <span>
              Maintenance mode <span className="text-xs text-subtle">closes backlogbazaar.com</span>
            </span>
            <input
              type="checkbox"
              checked={maintenanceFlag}
              onChange={(e) => setMaintenance(e.target.checked, maintMsg || null)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={maintMsg}
              onChange={(e) => setMaintMsg(e.target.value)}
              placeholder="Custom closed-page message (optional)"
              className={fieldClass + " flex-1"}
            />
            <button
              onClick={() => setMaintenance(maintenanceFlag, maintMsg || null)}
              className="rounded-md border border-line px-2 text-xs text-muted transition hover:bg-panel hover:text-ink"
            >
              Save
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            As an admin you always see the full site, even during maintenance.
          </p>
        </div>

        <div className="border-t border-line pt-3">
          <label className="mb-1 block text-sm text-ink">
            My coin balance{" "}
            <span className="inline-flex items-center gap-1 text-xs text-subtle">
              currently <CoinIcon size={12} /> {coins}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              value={coinInput}
              onChange={(e) => setCoinInput(e.target.value)}
              className={fieldClass + " flex-1"}
            />
            <button
              onClick={async () => {
                const n = Math.max(0, Math.floor(Number(coinInput)));
                if (!Number.isFinite(n)) return;
                await setCoins(n);
                setCoinInput(String(n));
              }}
              disabled={coinInput.trim() === "" || Number(coinInput) === coins}
              className={setBtnClass}
            >
              Set
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            Sets your balance to an exact amount — handy for testing the economy.
          </p>
        </div>

        <div className="border-t border-line pt-3">
          <label className="mb-1 block text-sm text-ink">
            Custom activity status{" "}
            <span className="text-xs text-subtle">
              {activityOverride ? "overriding auto" : "automatic"}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              value={activityInput}
              onChange={(e) => setActivityInput(e.target.value)}
              placeholder="e.g. Browsing the Market Square"
              className={fieldClass + " flex-1"}
            />
            <button
              onClick={() => setActivityOverride(activityInput)}
              disabled={activityInput.trim() === (activityOverride ?? "")}
              className={setBtnClass}
            >
              Set
            </button>
            {activityOverride && (
              <button
                onClick={() => {
                  setActivityOverride(null);
                  setActivityInput("");
                }}
                className="rounded-md border border-line px-3 text-xs text-muted transition hover:bg-panel hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            Overrides the status others see (Market Square, your Bazaar) instead of the one that
            follows your navigation. Clear it to go back to automatic.
          </p>
        </div>
      </Card>

      <Card icon={Palette} title="Appearance">
        <div>
          <label className="mb-1.5 block text-sm text-ink">Default coin skin</label>
          <div className="flex flex-wrap gap-2">
            {COIN_VARIANTS.map((c) => (
              <button
                key={c.id}
                onClick={() => setDefaultCoin(c.id)}
                aria-pressed={defaultCoin === c.id}
                className={
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition " +
                  (defaultCoin === c.id
                    ? "border-brand bg-brand/10 font-semibold text-accent"
                    : "border-line text-muted hover:bg-panel hover:text-ink")
                }
              >
                <CoinIcon size={18} variant={c.id} /> {c.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            Sets the coin shown across the app (and the browser tab icon) for everyone.
          </p>
          <p className="mt-2 text-[11px] text-subtle">
            Looking for refunds, bonuses and contribution rewards? They now live on the{" "}
            <span className="text-ink">Economy</span> tab alongside the buy and finish formulas.
          </p>
        </div>
      </Card>
    </div>
  );
}
