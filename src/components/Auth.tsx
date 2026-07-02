import { useEffect, useRef, useState } from "react";
import { Store, Gamepad2, Trophy, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import { ThemeToggle } from "./ThemeToggle";
import { CoinIcon } from "./CoinIcon";

// The signed-out landing: as much storefront as sign-in form. The left column
// pitches the game — the coin loop in three stamps and a "specimen ledger" that
// quietly writes new entries so a visitor can see what playing feels like. The
// right column is the form: sign in / create account / reset password.

const inputClass =
  "mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/25";

const labelClass = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted";

type Mode = "signin" | "signup" | "reset";

export function Auth() {
  const { signIn, signUp, signInWithGoogle, resetPassword, busy, error, notice, clearMessages } =
    useStore();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signin") signIn(email.trim(), password);
    else if (mode === "signup")
      signUp(email.trim(), password, displayName.trim() || email.split("@")[0]);
    else void resetPassword(email.trim());
  }

  function switchMode(next: Mode) {
    clearMessages();
    setMode(next);
  }

  const heading =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password";
  const submitLabel =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Open your ledger" : "Email me a reset link";
  const busyLabel =
    mode === "signin" ? "Signing in…" : mode === "signup" ? "Opening your ledger…" : "Sending…";

  return (
    <div className="relative flex min-h-full flex-col overflow-x-hidden px-4 sm:px-6">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      {/* m-auto centers the composition vertically on tall viewports (the page
          would otherwise pool dead space at the bottom) while still scrolling
          normally when the content is taller than the screen. */}
      <div className="m-auto grid w-full max-w-5xl gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-14 lg:py-14 xl:max-w-6xl xl:gap-x-20">
        {/* Brand + headline — first on every screen size. */}
        <div className="order-1 pt-6 lg:col-start-1 lg:row-start-1 lg:pt-10">
          <h1 className="inline-flex items-center gap-2.5 font-display text-4xl font-semibold tracking-tight text-ink xl:text-5xl">
            <Store size={34} strokeWidth={1.75} className="text-accent" /> Backlog Bazaar
          </h1>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">
            Beat games · Earn coins · Play more
          </p>
          <h2 className="mt-6 max-w-lg text-balance font-display text-2xl font-semibold leading-snug text-ink sm:text-3xl xl:max-w-xl xl:text-4xl">
            Your backlog, turned into an economy.
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted xl:max-w-xl xl:text-base">
            Every unplayed game gets a coin price, and finishing one pays a bounty. When starting
            something new costs something, choosing what to play finally means something.
          </p>
        </div>

        {/* The form — right column on desktop, straight after the headline on
            mobile so returning players aren't scrolling past the pitch. */}
        <form
          onSubmit={submit}
          className="order-2 flex flex-col gap-3 rounded-xl border-[1.5px] border-edge bg-surface p-6 shadow-stamp lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-10"
        >
          <h2 className="font-display text-xl font-semibold text-ink">{heading}</h2>

          {mode !== "reset" && (
            <>
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="flex items-center justify-center gap-2 rounded-lg border border-edge bg-surface px-3 py-2 font-medium text-ink transition hover:bg-panel"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
                <span className="h-px flex-1 bg-line" />
                or use email
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          {mode === "reset" && (
            <p className="text-sm text-muted">
              Enter your account&apos;s email and we&apos;ll send a link to set a new password.
            </p>
          )}

          {mode === "signup" && (
            <label className={labelClass}>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should the leaderboard call you?"
                className={inputClass}
              />
            </label>
          )}

          <label className={labelClass}>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>

          {mode !== "reset" && (
            <label className={labelClass}>
              Password
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          {notice && <p className="text-sm text-success">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-lg bg-brand px-3 py-2.5 font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? busyLabel : submitLabel}
          </button>

          <div className="flex flex-col items-center gap-1.5">
            {mode === "signin" && (
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="text-sm text-muted transition hover:text-accent"
              >
                Forgot password?
              </button>
            )}
            <button
              type="button"
              onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              className="text-sm text-muted transition hover:text-accent"
            >
              {mode === "signin"
                ? "Need an account? Sign up"
                : mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Back to sign in"}
            </button>
          </div>
        </form>

        {/* The pitch: the loop in three stamps + the specimen ledger. */}
        <div className="order-3 flex flex-col gap-6 lg:col-start-1 lg:row-start-2 lg:mt-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <LoopStep title="Buy" icon={Store}>
              Every backlog game gets a coin price. Starting one costs you.
            </LoopStep>
            <LoopStep title="Play" icon={Gamepad2}>
              Your Now Playing slots are limited, so what&apos;s in them matters. Log your hours.
            </LoopStep>
            <LoopStep title="Finish" icon={Trophy}>
              Beat it and the bounty pays out to fund your next pick!
            </LoopStep>
          </div>

          <SpecimenLedger />
        </div>
      </div>

      {/* Same footer as the signed-in app (App.tsx), pinned under the centered
          composition. */}
      <footer className="mx-auto w-full max-w-5xl border-t border-line py-6 text-center text-xs text-subtle xl:max-w-6xl">
        © 2026 Backlog Bazaar. All rights reserved.
      </footer>
    </div>
  );
}

/** One step of the coin loop, set like a stamped label with its explanation. */
function LoopStep({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface/60 p-4">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-accent" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          {title}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

// ── Specimen ledger ────────────────────────────────────────────────────────
// A sample of what the app feels like, rendered with the real design system so
// it can never go stale the way a screenshot would. Entries cycle in every few
// seconds (skipped under prefers-reduced-motion).

interface SpecimenEntry {
  title: string;
  detail: string;
  stamp: string;
  /** Signed coin delta shown inside the stamp (omit for coinless events). */
  coins?: number;
  tone: "success" | "accent" | "ink" | "muted";
}

const SPECIMEN: SpecimenEntry[] = [
  { title: "Hades", detail: "Beaten after 21h", stamp: "Finished", coins: 90, tone: "success" },
  { title: "Silksong", detail: "Wishlist → Bazaar", stamp: "Imported", tone: "accent" },
  { title: "Elden Ring", detail: "2h 15m logged tonight", stamp: "Now playing", tone: "ink" },
  { title: "Chrono Trigger", detail: "Bought & started", stamp: "Bought", coins: -120, tone: "ink" },
  { title: "Stardew Valley", detail: "Back to the shelf", stamp: "Shelved", coins: 22, tone: "muted" },
  { title: "Celeste", detail: "Every strawberry", stamp: "Completed", coins: 135, tone: "success" },
];

const STAMP_TONE: Record<SpecimenEntry["tone"], string> = {
  success: "border-success/50 bg-success/10 text-success",
  accent: "border-accent/50 bg-accent/10 text-accent",
  ink: "border-edge/60 bg-panel text-ink",
  muted: "border-line bg-panel text-muted",
};

const VISIBLE_ROWS = 4;
const CYCLE_MS = 5000;

function SpecimenLedger() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  // Rows carry stable keys so React keeps existing DOM nodes still and only
  // the freshly-prepended row runs its entrance animation.
  const [rows, setRows] = useState(() =>
    SPECIMEN.slice(0, VISIBLE_ROWS).map((entry, i) => ({ key: i, entry })),
  );
  const nextIdx = useRef(VISIBLE_ROWS % SPECIMEN.length);
  const nextKey = useRef(VISIBLE_ROWS);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setRows((rs) => {
        const entry = SPECIMEN[nextIdx.current];
        nextIdx.current = (nextIdx.current + 1) % SPECIMEN.length;
        return [{ key: nextKey.current++, entry }, ...rs].slice(0, VISIBLE_ROWS);
      });
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border-[1.5px] border-edge bg-surface shadow-stamp lg:mx-0 lg:max-w-md xl:max-w-lg">
      <div className="flex items-center justify-between border-b-[1.5px] border-edge px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
          Specimen ledger
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
          Nº 0001
        </span>
      </div>
      <ul>
        {rows.map(({ key, entry }) => (
          <li
            key={key}
            className="animate-ledger-row-in flex items-center justify-between gap-3 border-b border-dashed border-line px-4 py-2.5 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-ink">{entry.title}</p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-subtle">
                {entry.detail}
              </p>
            </div>
            <span
              className={
                "animate-ledger-stamp-in inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] " +
                STAMP_TONE[entry.tone]
              }
            >
              {entry.stamp}
              {entry.coins != null && (
                <>
                  · {entry.coins > 0 ? "+" : "−"}
                  <CoinIcon size={10} /> {Math.abs(entry.coins)}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
