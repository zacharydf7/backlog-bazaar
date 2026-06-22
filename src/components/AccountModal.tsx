import { useState } from "react";
import { X } from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import { useScrollLock } from "../lib/useScrollLock";
import { PLATFORMS } from "../lib/platforms";

export function AccountModal({ onClose }: { onClose: () => void }) {
  const {
    email,
    displayName,
    providers,
    linkGoogle,
    unlinkGoogle,
    error,
    myPlatforms,
    setMyPlatforms,
    customPlatforms,
    addCustomPlatform,
    removeCustomPlatform,
    isAdmin,
    maintenanceFlag,
    maintenanceMessage,
    setMaintenance,
    shelveRefundPct,
    setShelveRefundPct,
    replayBonusPct,
    setReplayBonusPct,
    coins,
    setCoins,
  } = useStore();
  const [working, setWorking] = useState(false);
  const [maintMsg, setMaintMsg] = useState(maintenanceMessage ?? "");
  const [coinInput, setCoinInput] = useState(String(coins));
  const [shelveInput, setShelveInput] = useState(String(shelveRefundPct));
  const [replayInput, setReplayInput] = useState(String(replayBonusPct));
  const [newPlatform, setNewPlatform] = useState("");

  function addPlatform() {
    const label = newPlatform.trim();
    if (!label) return;
    void addCustomPlatform(label);
    setNewPlatform("");
  }

  useScrollLock(true);

  function togglePlatform(id: string) {
    const next = myPlatforms.includes(id)
      ? myPlatforms.filter((p) => p !== id)
      : [...myPlatforms, id];
    void setMyPlatforms(next);
  }

  const hasGoogle = providers.includes("google");
  const hasEmail = providers.includes("email");
  // Don't let someone remove their only way to sign in.
  const canUnlinkGoogle = hasGoogle && providers.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-display text-xl text-ink">Account</h2>
          <button onClick={onClose} className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-subtle">Display name</div>
            <div className="text-ink">{displayName ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-subtle">Email</div>
            <div className="text-ink">{email ?? "—"}</div>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">
              Sign-in methods
            </div>
            <div className="flex flex-col gap-2">
              <Method label="Email & password" connected={hasEmail} />
              <Method
                label="Google"
                connected={hasGoogle}
                action={
                  hasGoogle ? (
                    <button
                      disabled={!canUnlinkGoogle || working}
                      onClick={async () => {
                        setWorking(true);
                        await unlinkGoogle();
                        setWorking(false);
                      }}
                      title={
                        canUnlinkGoogle
                          ? "Unlink Google"
                          : "You can't remove your only sign-in method"
                      }
                      className="rounded-md border border-line px-2 py-1 text-xs text-muted transition enabled:hover:bg-panel enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {working ? "Unlinking…" : "Unlink"}
                    </button>
                  ) : (
                    <button
                      disabled={working}
                      onClick={() => linkGoogle()}
                      className="rounded-md bg-brand px-2 py-1 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                    >
                      Link
                    </button>
                  )
                }
              />
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">My platforms</div>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const on = myPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition " +
                      (on
                        ? "border-brand bg-brand/15 text-accent"
                        : "border-line text-muted hover:border-brand/50")
                    }
                  >
                    {on ? "✓ " : ""}
                    {p.label}
                  </button>
                );
              })}
              {customPlatforms.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand/15 px-3 py-1 text-xs text-accent"
                >
                  ✓ {label}
                  <button
                    type="button"
                    onClick={() => removeCustomPlatform(label)}
                    aria-label={`Remove ${label}`}
                    className="-mr-1 rounded-full p-0.5 text-accent/70 transition hover:bg-brand/20 hover:text-accent"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newPlatform}
                onChange={(e) => setNewPlatform(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPlatform();
                  }
                }}
                placeholder="Add another platform (e.g. Nintendo Switch 2)"
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={addPlatform}
                disabled={!newPlatform.trim()}
                className="rounded-md bg-brand px-3 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-subtle">
              Built-in consoles filter The Market to games you can play. Custom platforms you add
              here (and while adding a game) show up as options everywhere.
            </p>
          </div>

          {isAdmin && (
            <div className="rounded-xl border border-brand/40 bg-brand/5 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-accent">Admin</div>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
                <span>
                  Maintenance mode{" "}
                  <span className="text-xs text-subtle">closes backlogbazaar.com</span>
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
                  className="flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
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

              <div className="mt-3 border-t border-brand/20 pt-3">
                <label className="mb-1 block text-sm text-ink">
                  Shelve-It refund{" "}
                  <span className="text-xs text-subtle">currently {shelveRefundPct}%</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={shelveInput}
                      onChange={(e) => setShelveInput(e.target.value)}
                      className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 pr-7 text-sm text-ink outline-none focus:border-brand"
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
                      shelveInput.trim() === "" ||
                      Math.round(Number(shelveInput)) === shelveRefundPct
                    }
                    className="rounded-md bg-brand px-3 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-subtle">
                  The % of a game's purchase price refunded when it's dropped from Now Playing
                  without finishing (the rest is forfeited to the Bazaar).
                </p>
              </div>

              <div className="mt-3 border-t border-brand/20 pt-3">
                <label className="mb-1 block text-sm text-ink">
                  Replay Bonus{" "}
                  <span className="text-xs text-subtle">currently {replayBonusPct}%</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={replayInput}
                      onChange={(e) => setReplayInput(e.target.value)}
                      className="w-full rounded-lg border border-line bg-panel px-2 py-1.5 pr-7 text-sm text-ink outline-none focus:border-brand"
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
                      replayInput.trim() === "" ||
                      Math.round(Number(replayInput)) === replayBonusPct
                    }
                    className="rounded-md bg-brand px-3 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-subtle">
                  The % of the normal completion bonus paid when you finish a linked edition after
                  the family's first clear (re-clears on other platforms).
                </p>
              </div>

              <div className="mt-3 border-t border-brand/20 pt-3">
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
                    className="flex-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-ink outline-none focus:border-brand"
                  />
                  <button
                    onClick={async () => {
                      const n = Math.max(0, Math.floor(Number(coinInput)));
                      if (!Number.isFinite(n)) return;
                      await setCoins(n);
                      setCoinInput(String(n));
                    }}
                    disabled={coinInput.trim() === "" || Number(coinInput) === coins}
                    className="rounded-md bg-brand px-3 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-subtle">
                  Sets your balance to an exact amount — handy for testing the economy.
                </p>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <p className="text-[11px] text-subtle">
            Linking Google lets you sign in either way — same account, same backlog and coins.
            You&apos;ll be sent to Google to confirm, then returned here.
          </p>
        </div>
      </div>
    </div>
  );
}

function Method({
  label,
  connected,
  action,
}: {
  label: string;
  connected: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={"h-2 w-2 rounded-full " + (connected ? "bg-success" : "bg-subtle")}
        />
        <span className="text-sm text-ink">{label}</span>
        <span className="text-xs text-subtle">{connected ? "connected" : "not connected"}</span>
      </div>
      {action}
    </div>
  );
}
