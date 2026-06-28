import { useState } from "react";
import { X, EyeOff, WifiOff, Lock, Coins, ImageOff } from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./Avatar";
import { PLATFORMS } from "../lib/platforms";
import {
  isSpendHidden,
  isAppearOffline,
  isProfilePrivate,
  isFinancialFeedHidden,
  isCustomCoversHidden,
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
    myBadges,
    selectedTitleId,
    setSelectedTitle,
    cloud,
  } = useStore();
  const [working, setWorking] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameInput, setNameInput] = useState(displayName ?? "");
  const [savingName, setSavingName] = useState(false);

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
                How you appear on the leaderboard and to other players. Capitalization is kept
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
              When on, others won&apos;t see you as online or what you&apos;re doing on the
              leaderboard or anywhere else.
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
                  When on, you won&apos;t appear in friend search and others can&apos;t send you
                  friend requests.
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
                Pick one badge to show as your title next to your name — on the leaderboard and when
                others visit your Bazaar. Click it again to hide it.
              </p>
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
