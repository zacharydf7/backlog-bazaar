import { useState } from "react";
import {
  Shield,
  Coins,
  Inbox,
  ChevronRight,
  Wrench,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { COIN_VARIANTS } from "../lib/coins";

// One consolidated home for everything admin: quick links to the full Manage
// Users / Economy / Submissions pages, plus the site & economy levers that used
// to be buried in the Account panel. Gated to admins; non-admins never get here
// (the nav entry is admin-only) but we guard anyway.

export function AdminPage({
  onUsers,
  onEconomy,
  onSubmissions,
}: {
  onUsers: () => void;
  onEconomy: () => void;
  onSubmissions: () => void;
}) {
  const isAdmin = useStore((s) => s.isAdmin);
  const submissionCount = useStore((s) => s.submissionCount);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-line py-16 text-center text-sm text-muted">
        This page is admin-only.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div>
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Shield size={18} className="text-accent" /> Admin
        </h2>
        <p className="mt-1 text-sm text-muted">
          Manage players, tune the economy, review contributions, and run the site — all in one
          place.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ToolCard
          icon={Shield}
          title="Manage Users"
          desc="View, edit, block, hide, and award badges to players."
          onClick={onUsers}
        />
        <ToolCard
          icon={Coins}
          title="Economy"
          desc="Tune the buy-price and finish-bounty formulas."
          onClick={onEconomy}
        />
        <ToolCard
          icon={Inbox}
          title="Submissions"
          desc="Review community catalog edits and new-game suggestions."
          badge={submissionCount}
          onClick={onSubmissions}
        />
      </div>

      <AdminSettings />
    </div>
  );
}

function ToolCard({
  icon: Icon,
  title,
  desc,
  badge = 0,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand/50 hover:bg-panel"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-accent">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg text-ink">{title}</h3>
          {badge > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-semibold text-brand-fg">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted">{desc}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-subtle" />
    </button>
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
    shelveRefundPct,
    setShelveRefundPct,
    replayBonusPct,
    setReplayBonusPct,
    submissionReward,
    setSubmissionReward,
    defaultCoin,
    setDefaultCoin,
    coins,
    setCoins,
    activityOverride,
    setActivityOverride,
  } = useStore();

  const [maintMsg, setMaintMsg] = useState(maintenanceMessage ?? "");
  const [shelveInput, setShelveInput] = useState(String(shelveRefundPct));
  const [replayInput, setReplayInput] = useState(String(replayBonusPct));
  const [rewardInput, setRewardInput] = useState(String(submissionReward));
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
              placeholder="e.g. Viewing the Leaderboard"
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
            Overrides the status others see (leaderboard, your Bazaar) instead of the one that
            follows your navigation. Clear it to go back to automatic.
          </p>
        </div>
      </Card>

      <Card icon={SlidersHorizontal} title="Economy levers">
        <div>
          <label className="mb-1 block text-sm text-ink">
            Shelve-It refund <span className="text-xs text-subtle">currently {shelveRefundPct}%</span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                max={100}
                value={shelveInput}
                onChange={(e) => setShelveInput(e.target.value)}
                className={fieldClass + " pr-7"}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
                %
              </span>
            </div>
            <button
              onClick={async () => {
                const n = Math.max(0, Math.min(100, Math.round(Number(shelveInput))));
                if (!Number.isFinite(n)) return;
                await setShelveRefundPct(n);
                setShelveInput(String(n));
              }}
              disabled={
                shelveInput.trim() === "" || Math.round(Number(shelveInput)) === shelveRefundPct
              }
              className={setBtnClass}
            >
              Set
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            The % of a game&apos;s purchase price refunded when it&apos;s dropped from Now Playing
            without finishing (the rest is forfeited to the Bazaar).
          </p>
        </div>

        <div className="border-t border-line pt-3">
          <label className="mb-1 block text-sm text-ink">
            Replay Bonus <span className="text-xs text-subtle">currently {replayBonusPct}%</span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min={0}
                max={100}
                value={replayInput}
                onChange={(e) => setReplayInput(e.target.value)}
                className={fieldClass + " pr-7"}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-subtle">
                %
              </span>
            </div>
            <button
              onClick={async () => {
                const n = Math.max(0, Math.min(100, Math.round(Number(replayInput))));
                if (!Number.isFinite(n)) return;
                await setReplayBonusPct(n);
                setReplayInput(String(n));
              }}
              disabled={
                replayInput.trim() === "" || Math.round(Number(replayInput)) === replayBonusPct
              }
              className={setBtnClass}
            >
              Set
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            The % of the normal completion bonus paid when you finish a linked edition after the
            family&apos;s first clear (re-clears on other platforms).
          </p>
        </div>

        <div className="border-t border-line pt-3">
          <label className="mb-1 block text-sm text-ink">
            Contribution reward{" "}
            <span className="text-xs text-subtle">currently {submissionReward} coins</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={1000}
              value={rewardInput}
              onChange={(e) => setRewardInput(e.target.value)}
              className={fieldClass + " flex-1"}
            />
            <button
              onClick={async () => {
                const n = Math.max(0, Math.min(1000, Math.round(Number(rewardInput))));
                if (!Number.isFinite(n)) return;
                await setSubmissionReward(n);
                setRewardInput(String(n));
              }}
              disabled={
                rewardInput.trim() === "" || Math.round(Number(rewardInput)) === submissionReward
              }
              className={setBtnClass}
            >
              Set
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            Coins awarded to a player when their catalog edit or new-game suggestion is approved in
            the Submissions queue.
          </p>
        </div>

        <div className="border-t border-line pt-3">
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
        </div>
      </Card>
    </div>
  );
}
