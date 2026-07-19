import { useState } from "react";
import { X, EyeOff, WifiOff, Lock, Coins, ImageOff, Layers, Sparkles, Trash2, Download, Gem, Tent } from "lucide-react";
import { useStore } from "../store";
import { buildLibraryExport, serializeExport, exportFilename } from "../lib/dataExport";
import { Avatar } from "./Avatar";
import { DangerConfirmModal } from "./DangerConfirmModal";
import { PLATFORMS } from "../lib/platforms";
import {
  isSpendHidden,
  isAppearOffline,
  isProfilePrivate,
  isFinancialFeedHidden,
  isCustomCoversHidden,
  isHiddenFromSquare,
  PRIVACY_KEYS,
} from "../lib/privacy";
import { sortBadges } from "../lib/badges";
import { TitleBadge } from "./TitleBadge";
import {
  cleanDisplayName,
  validateDisplayName,
  DISPLAY_NAME_MAX,
} from "../lib/displayName";

export function AccountModal() {
  const {
    email,
    displayName,
    setDisplayName,
    avatarUrl,
    setAvatar,
    removeAvatar,
    providers,
    linkGoogle,
    unlinkGoogle,
    error,
    myPlatforms,
    setMyPlatforms,
    customPlatforms,
    removeCustomPlatform,
    privacy,
    setPrivacy,
    economyEnabled,
    setEconomyEnabled,
    trackEditions,
    setTrackEditions,
    targetCostPerHour,
    setTargetCostPerHour,
    myBadges,
    selectedTitleId,
    setSelectedTitle,
    cloud,
    freshStart,
    deleteMyAccount,
    games,
    compilations,
    coins,
    vouchers,
    fetchListsExport,
  } = useStore();
  const [working, setWorking] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameInput, setNameInput] = useState(displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  // "Money Well Spent" target rate, committed on blur/Enter (a number input
  // saved per keystroke would fire a toast per digit).
  const [targetInput, setTargetInput] = useState(
    targetCostPerHour != null ? String(targetCostPerHour) : "",
  );
  const commitTarget = () => {
    const n = Number(targetInput);
    const v = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
    setTargetInput(v != null ? String(v) : "");
    if (v !== targetCostPerHour) void setTargetCostPerHour(v);
  };
  // Danger Zone: which typed-confirmation modal is open, and whether its
  // action is in flight (the modal disarms itself while busy).
  const [dangerOpen, setDangerOpen] = useState<"fresh" | "delete" | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);

  async function runDanger(kind: "fresh" | "delete") {
    setDangerBusy(true);
    const ok = kind === "fresh" ? await freshStart() : await deleteMyAccount();
    setDangerBusy(false);
    // On a successful delete the auth listener resets the app to the sign-in
    // screen; closing here just covers the fresh-start (and failure) paths.
    if (ok) setDangerOpen(null);
  }

  // Show the validation hint only once they've touched it into an invalid state,
  // never on the pristine prefilled value.
  const nameError = nameInput.trim() === "" ? null : validateDisplayName(nameInput);
  const nameChanged = cleanDisplayName(nameInput) !== (displayName ?? "");

  async function saveName() {
    if (nameError || !nameChanged) return;
    setSavingName(true);
    await setDisplayName(nameInput);
    setSavingName(false);
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    setUploadingAvatar(true);
    await setAvatar(file);
    setUploadingAvatar(false);
  }

  function togglePlatform(id: string) {
    const next = myPlatforms.includes(id)
      ? myPlatforms.filter((p) => p !== id)
      : [...myPlatforms, id];
    void setMyPlatforms(next);
  }

  // Download the user's own collection as a JSON file. Library data is already
  // loaded client-side; custom lists are fetched fresh so the export is
  // complete even before the Lists workspace was opened. The pure payload is
  // built/serialized in src/lib/dataExport; only the Blob download is here.
  async function exportMyData() {
    const listsData = await fetchListsExport();
    const data = buildLibraryExport({
      displayName,
      email,
      coins,
      vouchers,
      platforms: [...myPlatforms, ...customPlatforms],
      games,
      compilations,
      lists: listsData?.lists,
      listFolders: listsData?.folders,
    });
    const blob = new Blob([serializeExport(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const hasGoogle = providers.includes("google");
  const hasEmail = providers.includes("email");
  // Don't let someone remove their only way to sign in.
  const canUnlinkGoogle = hasGoogle && providers.length > 1;

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-display text-xl text-ink">Account</h2>
        </div>

        <div className="p-4">
          <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar url={avatarUrl} name={displayName ?? "You"} size={72} />
            <div className="flex flex-col items-start gap-2">
              <div className="flex flex-wrap gap-2">
                <label
                  className={
                    "cursor-pointer rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-brand-fg transition hover:brightness-105 " +
                    (uploadingAvatar ? "pointer-events-none opacity-60" : "")
                  }
                >
                  {uploadingAvatar ? "Uploading…" : avatarUrl ? "Change picture" : "Upload picture"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickAvatar}
                    disabled={uploadingAvatar}
                  />
                </label>
                {avatarUrl && !uploadingAvatar && (
                  <button
                    onClick={() => removeAvatar()}
                    className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition hover:bg-panel hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="text-[11px] text-subtle">
                A square JPG or PNG works best — we&apos;ll crop and shrink it for you.
              </p>
            </div>
          </div>
          <div>
            <label
              htmlFor="display-name"
              className="text-[10px] uppercase tracking-wide text-subtle"
            >
              Display name
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="display-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveName();
                  }
                }}
                maxLength={DISPLAY_NAME_MAX}
                placeholder="Your display name"
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25"
              />
              <button
                onClick={() => void saveName()}
                disabled={savingName || !nameChanged || nameError != null}
                className="rounded-md bg-brand px-4 text-xs font-semibold text-brand-fg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingName ? "Saving…" : "Save"}
              </button>
            </div>
            {nameError ? (
              <p className="mt-1.5 text-[11px] text-danger">{nameError}</p>
            ) : (
              <p className="mt-1.5 text-[11px] text-subtle">
                How you appear in the Market Square and to other players. Capitalization is kept
                exactly as you type it.
              </p>
            )}
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
            <p className="mt-2 text-[11px] text-subtle">
              Built-in consoles filter The Caravan to games you can play. Platforms now come from a
              shared, curated list — if one you own is missing, ask an admin to add it.
            </p>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">Time tracking</div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
              <span className="inline-flex items-center gap-2">
                <Layers size={15} className="text-accent" />
                Enable edition-level time tracking
              </span>
              <input
                type="checkbox"
                checked={trackEditions}
                onChange={(e) => setTrackEditions(e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
            </label>
            <p className="mt-1.5 text-[11px] text-subtle">
              Off by default — log play time against the platform you played on. Turn this on to
              track time against each specific copy you own (e.g. a physical vs. a digital copy on
              the same platform). Your total hours are the same either way.
            </p>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">
              Value tracking
            </div>
            <label className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
              <span className="inline-flex items-center gap-2">
                <Gem size={15} className="text-accent" />
                Target cost per hour
              </span>
              <span className="inline-flex items-center gap-1 text-sm text-muted">
                $
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  inputMode="decimal"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onBlur={commitTarget}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  placeholder="Off"
                  aria-label="Target cost per hour in dollars"
                  className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm text-ink outline-none focus:border-brand"
                />
                / hour
              </span>
            </label>
            <p className="mt-1.5 text-[11px] text-subtle">
              Set what an hour of play should cost for a purchase to feel worth it (e.g. $1.00).
              Games whose logged hours reach their price at that rate earn a &quot;Well spent&quot;
              badge, and the Master Ledger gains spend &amp; cost-per-hour stats. Leave empty to
              turn it off. Free and Player&nbsp;2 games are never judged.
            </p>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">Coin economy</div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
              <span className="inline-flex items-center gap-2">
                <Coins size={15} className="text-accent" />
                Play with the coin economy
              </span>
              <input
                type="checkbox"
                checked={economyEnabled}
                onChange={(e) => void setEconomyEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
            </label>
            <p className="mt-1.5 text-[11px] text-subtle">
              Turn it off to use Backlog Bazaar as a plain tracker: starting a game is free,
              finishing pays no bounty, and prices, coins, charters and vouchers disappear from
              the app. Your balance is kept safe and frozen — flip it back on any time to resume
              exactly where you left off. Turning it off returns any active game backings (yours
              and your friends&apos;), and games finished while it&apos;s off never pay out later.
            </p>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">Privacy</div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
              <span className="inline-flex items-center gap-2">
                <EyeOff size={15} className="text-accent" />
                Hide money spent from visitors
              </span>
              <input
                type="checkbox"
                checked={isSpendHidden(privacy)}
                onChange={(e) => setPrivacy(PRIVACY_KEYS.hideSpend, e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
            </label>
            <p className="mt-1.5 text-[11px] text-subtle">
              When on, other players visiting your Bazaar won&apos;t see what you paid in real money
              for your copies. Your coin economy stays visible.
            </p>

            <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
              <span className="inline-flex items-center gap-2">
                <WifiOff size={15} className="text-accent" />
                Appear offline
              </span>
              <input
                type="checkbox"
                checked={isAppearOffline(privacy)}
                onChange={(e) => setPrivacy(PRIVACY_KEYS.appearOffline, e.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
            </label>
            <p className="mt-1.5 text-[11px] text-subtle">
              When on, others won&apos;t see you as online or what you&apos;re doing in the
              Market Square or anywhere else.
            </p>

            {/* Social privacy controls (signed-in users). */}
            {cloud && (
              <>
                <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
                  <span className="inline-flex items-center gap-2">
                    <Lock size={15} className="text-accent" />
                    Make my profile private
                  </span>
                  <input
                    type="checkbox"
                    checked={isProfilePrivate(privacy)}
                    onChange={(e) => setPrivacy(PRIVACY_KEYS.privateProfile, e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                </label>
                <p className="mt-1.5 text-[11px] text-subtle">
                  When on, other players can&apos;t see you at all: you&apos;re out of the
                  Market Square and friend search, your profile and library can&apos;t be visited
                  (even by friends), and your reviews and activity are hidden. Friendships and
                  messages keep working.
                </p>

                <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
                  <span className="inline-flex items-center gap-2">
                    <Coins size={15} className="text-accent" />
                    Hide my coin rewards on the activity feed
                  </span>
                  <input
                    type="checkbox"
                    checked={isFinancialFeedHidden(privacy)}
                    onChange={(e) => setPrivacy(PRIVACY_KEYS.hideFinancialFeed, e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                </label>
                <p className="mt-1.5 text-[11px] text-subtle">
                  When on, the coins you earn finishing a game are hidden from your friends&apos;
                  activity feed (the milestone still shows). On by default.
                </p>

                <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
                  <span className="inline-flex items-center gap-2">
                    <Tent size={15} className="text-accent" />
                    Keep my clears out of the Market Square
                  </span>
                  <input
                    type="checkbox"
                    checked={isHiddenFromSquare(privacy)}
                    onChange={(e) => setPrivacy(PRIVACY_KEYS.hideFromSquare, e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                </label>
                <p className="mt-1.5 text-[11px] text-subtle">
                  When on, your finished games don&apos;t appear in the Market Square&apos;s
                  community feed or Stall of the Week. Your friends still see them in their own
                  activity feed.
                </p>

                <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-ink">
                  <span className="inline-flex items-center gap-2">
                    <ImageOff size={15} className="text-accent" />
                    Always show default game covers
                  </span>
                  <input
                    type="checkbox"
                    checked={isCustomCoversHidden(privacy)}
                    onChange={(e) => setPrivacy(PRIVACY_KEYS.hideCustomCovers, e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                </label>
                <p className="mt-1.5 text-[11px] text-subtle">
                  When on, you&apos;ll only ever see the standard catalog cover for other players&apos;
                  games — their custom uploaded cover art is hidden everywhere. Your own covers
                  aren&apos;t affected.
                </p>
              </>
            )}
          </div>

          {myBadges.length > 0 && (
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">Your badges</div>
              <div className="flex flex-col gap-2">
                {sortBadges(myBadges).map((b) => {
                  const isTitle = b.id === selectedTitleId;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2"
                    >
                      <div className="min-w-0">
                        <TitleBadge badge={b} />
                        {b.description && (
                          <p className="mt-1 text-[11px] text-subtle">{b.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void setSelectedTitle(isTitle ? null : b.id)}
                        aria-pressed={isTitle}
                        className={
                          "shrink-0 rounded-md border px-2 py-1 text-xs transition " +
                          (isTitle
                            ? "border-brand bg-brand/15 text-accent"
                            : "border-line text-muted hover:bg-surface hover:text-ink")
                        }
                      >
                        {isTitle ? "✓ Your title" : "Set as title"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-subtle">
                Pick one badge to show as your title next to your name — in the Market Square and
                when others visit your Bazaar. Click it again to hide it.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <p className="text-[11px] text-subtle">
            Linking Google lets you sign in either way — same account, same backlog and coins.
            You&apos;ll be sent to Google to confirm, then returned here.
          </p>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-subtle">Your data</div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-52">
                <div className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Download size={14} className="text-accent" aria-hidden /> Export my data
                </div>
                <p className="mt-0.5 text-[11px] text-subtle">
                  Download your collection — every game and compilation, your platforms, and coin
                  balance — as a JSON file you can keep.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void exportMyData()}
                className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface"
              >
                Export…
              </button>
            </div>
          </div>

          {/* Danger Zone: destructive account actions, each behind its own
              typed triple confirmation (open → acknowledge → type the phrase). */}
          <div className="rounded-2xl border border-danger/40 bg-danger/5 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-danger">Danger zone</div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2.5">
                <div className="min-w-0 flex-1 basis-52">
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Sparkles size={14} className="text-danger" aria-hidden /> Fresh Start
                  </div>
                  <p className="mt-0.5 text-[11px] text-subtle">
                    {cloud
                      ? "Wipe your games, coins and history and begin again from day one. Your profile, friends, messages and badges stay."
                      : "Clear this browser's games, coins and history and begin again from day one."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDangerOpen("fresh")}
                  className="shrink-0 rounded-md border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10"
                >
                  Fresh Start…
                </button>
              </div>

              {cloud && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel px-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-52">
                    <div className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                      <Trash2 size={14} className="text-danger" aria-hidden /> Delete account
                    </div>
                    <p className="mt-0.5 text-[11px] text-subtle">
                      Permanently delete your account and all of its data. This cannot be undone.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDangerOpen("delete")}
                    className="shrink-0 rounded-md border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10"
                  >
                    Delete account…
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>

        {dangerOpen === "fresh" && (
          <DangerConfirmModal
            title="Fresh Start"
            phrase="fresh start"
            confirmLabel="Wipe my data and start over"
            busyLabel="Starting over…"
            busy={dangerBusy}
            onConfirm={() => void runDanger("fresh")}
            onCancel={() => !dangerBusy && setDangerOpen(null)}
          >
            <p>
              This permanently erases your <strong className="text-ink">collection and economy</strong>{" "}
              — every game and wishlist entry, your compilations, coins, Import Charters, vouchers,
              extra slots, and your entire ledger and play history.
            </p>
            {cloud ? (
              <p>
                Your account itself survives: you stay signed in and keep your display name, profile
                page, badges and titles, custom lists, friends, messages, notifications, and anything
                you posted on the community boards. You&apos;ll restart with a brand-new account&apos;s coins and
                slots, and the welcome tour will be available again.
              </p>
            ) : (
              <p>
                This clears the data saved in this browser. You&apos;ll restart with a brand-new
                collection and the starting coin balance.
              </p>
            )}
          </DangerConfirmModal>
        )}

        {dangerOpen === "delete" && (
          <DangerConfirmModal
            title="Delete your account?"
            phrase="delete my account"
            confirmLabel="Permanently delete my account"
            busyLabel="Deleting…"
            busy={dangerBusy}
            onConfirm={() => void runDanger("delete")}
            onCancel={() => !dangerBusy && setDangerOpen(null)}
          >
            <p>
              This <strong className="text-ink">permanently deletes your account and all of its
              data</strong> — your library, coins, history, profile, badges, friends, messages and
              notifications. You&apos;ll be signed out immediately and won&apos;t be able to sign
              back in.
            </p>
            <p>
              Your bug reports and comments on the community boards remain for other players, shown
              without your name.
            </p>
          </DangerConfirmModal>
        )}
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
