import { useEffect, useState } from "react";
import {
  Ticket,
  X,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  HelpCircle,
  Gamepad2,
  Gauge,
} from "lucide-react";
import { useStore } from "../store";
import { CoinIcon } from "./CoinIcon";
import {
  onboardingMode,
  onboardingCopy,
  FRESH_TOUR_STEPS,
  type OnboardingStep,
  type OnboardingMode,
} from "../lib/onboarding";

/** Drives the onboarding tour off live store state. A fresh signup walks the
 *  linear FRESH_TOUR_STEPS (index tracked here, this session); an existing
 *  account granted a voucher gets the short board-state-driven granted intro.
 *  Gated on sessionLoaded so it never acts on the transient cross-account state
 *  mid auth-switch. */
function useOnboardingTour(): {
  mode: OnboardingMode | null;
  step: OnboardingStep | null;
  /** Vouchers to advertise on the finale — the amount about to be granted for a
   *  fresh signup (the balance is still 0 until Finish), else the held balance. */
  grantCount: number;
  atFirst: boolean;
  atLast: boolean;
  next: () => void;
  back: () => void;
  complete: () => void;
} {
  const sessionLoaded = useStore((s) => s.sessionLoaded);
  const completed = useStore((s) => s.onboardingCompletedAt) != null;
  const pending = useStore((s) => s.onboardingVouchersPending);
  const vouchers = useStore((s) => s.vouchers);
  const onboardingVouchers = useStore((s) => s.onboardingVouchers);
  const isAdmin = useStore((s) => s.isAdmin);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const [index, setIndex] = useState(0);

  const mode = onboardingMode({ loaded: sessionLoaded, completed, pending, vouchers, isAdmin });
  const last = FRESH_TOUR_STEPS.length - 1;
  let step: OnboardingStep | null = null;
  if (mode === "fresh") step = FRESH_TOUR_STEPS[Math.min(index, last)];
  else if (mode === "granted") step = "granted";

  return {
    mode,
    step,
    grantCount: mode === "fresh" ? onboardingVouchers : vouchers,
    atFirst: index === 0,
    atLast: step === "done",
    next: () => setIndex((i) => Math.min(i + 1, last)),
    back: () => setIndex((i) => Math.max(i - 1, 0)),
    complete: () => void completeOnboarding(),
  };
}

/** The board each tour card describes, so the app can follow along. */
const STEP_VIEW: Partial<Record<OnboardingStep, string>> = {
  bazaar: "backlog",
  "now-playing": "playing",
  finished: "finished",
  wishlist: "wishlist",
  caravan: "market",
  ledger: "master-ledger",
  demo: "backlog",
};

/** A tiny faked card that demonstrates Buy & Start → Use voucher, entirely
 *  client-side (no real game, no real voucher) — it resets when the tour ends.
 *  Calls onPlayed once the voucher is "used" so the surrounding copy can update. */
function OnboardingDemo({ onPlayed }: { onPlayed: () => void }) {
  const [state, setState] = useState<"idle" | "choosing" | "played">("idle");
  return (
    <div className="mt-3 rounded-xl border border-line bg-panel/40 p-3">
      <div className="flex items-center gap-2.5">
        <div className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand/30 to-accent/20 text-lg">
          🎮
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">Example Quest</div>
          <div className="text-[11px] text-subtle">On your Bazaar</div>
        </div>
      </div>

      {state === "idle" && (
        <button
          onClick={() => setState("choosing")}
          className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105"
        >
          <Gamepad2 size={14} /> Buy &amp; Start
        </button>
      )}

      {state === "choosing" && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            Cover the activation fee
          </div>
          <button
            onClick={() => {
              setState("played");
              onPlayed();
            }}
            className="inline-flex items-center justify-between rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105"
          >
            <span className="inline-flex items-center gap-1.5">
              <Ticket size={14} /> Use voucher
            </span>
            <span className="rounded-full bg-brand-fg/15 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Free
            </span>
          </button>
          <button
            disabled
            className="inline-flex cursor-not-allowed items-center justify-between rounded-lg border border-line px-3 py-2 text-sm font-medium text-subtle opacity-70"
          >
            <span className="inline-flex items-center gap-1.5">
              <CoinIcon size={13} /> Pay with coins
            </span>
            <span className="inline-flex items-center gap-1 text-xs">
              <CoinIcon size={12} /> 80
            </span>
          </button>
        </div>
      )}

      {state === "played" && (
        <div className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-success/15 px-3 py-2 text-sm font-semibold text-success">
          <Gamepad2 size={14} /> Now Playing — that's it!
        </div>
      )}
    </div>
  );
}

/** A small icon to head each card, by step. */
function StepIcon({ step }: { step: OnboardingStep }) {
  if (step === "done") return <Sparkles size={16} />;
  if (step === "ledger") return <Gauge size={16} />;
  if (step === "now-playing" || step === "demo") return <Gamepad2 size={16} />;
  return <Ticket size={16} />;
}

/** The onboarding coach card. A fresh signup gets the full guided tour (welcome →
 *  core sections → a simulated demo → finish, which credits their vouchers); an
 *  existing account granted a voucher gets a short contextual intro. */
export function OnboardingCoach({
  onHowItWorks,
  onNavigate,
}: {
  onHowItWorks: () => void;
  onNavigate: (view: string) => void;
}) {
  const { mode, step, grantCount, atFirst, atLast, next, back, complete } = useOnboardingTour();
  // While stepping through the fresh tour, follow along on the board each card
  // describes so the player sees what it's talking about.
  useEffect(() => {
    if (mode === "fresh" && step && STEP_VIEW[step]) onNavigate(STEP_VIEW[step]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step]);
  const [demoPlayed, setDemoPlayed] = useState(false);

  if (!step || !mode) return null;

  const isWelcome = step === "welcome";
  const isDemo = step === "demo";
  const isDone = step === "done";
  const isGranted = step === "granted";
  // Copy: the demo updates once the voucher's been "used"; everything else is its
  // standard copy.
  const copy =
    isDemo && demoPlayed
      ? { eyebrow: "Try it", title: "Nice — that's it! 🎮", body: "That's the whole move: Buy & Start, then Use voucher. Hit Next to wrap up." }
      : onboardingCopy(step, grantCount);
  const wantsVoucherTap = isGranted;
  const pos = FRESH_TOUR_STEPS.indexOf(step);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-brand/40 bg-surface p-4 shadow-2xl ring-1 ring-brand/20">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            <StepIcon step={step} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {copy.eyebrow}
              </span>
              {!isDone && (
                <button
                  onClick={complete}
                  className="-mr-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-subtle transition hover:text-ink"
                >
                  {isGranted ? "Dismiss" : "Skip tour"} <X size={12} />
                </button>
              )}
            </div>
            <h3 className="mt-0.5 font-display text-base leading-tight text-ink">{copy.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{copy.body}</p>

            {isDemo && <OnboardingDemo onPlayed={() => setDemoPlayed(true)} />}

            {wantsVoucherTap && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-accent">
                  <Ticket size={13} className="text-brand" /> “Buy &amp; Start” → “Use voucher”
                </span>
              </div>
            )}

            {/* Link to the full How it works page from either intro card. */}
            {(isWelcome || isGranted) && (
              <button
                onClick={onHowItWorks}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:text-ink"
              >
                <HelpCircle size={13} /> Read how it works
              </button>
            )}

            {/* Footer: fresh-tour navigation, or a single finish/dismiss action. */}
            {mode === "fresh" ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {FRESH_TOUR_STEPS.map((s, i) => (
                    <span
                      key={s}
                      className={
                        "h-1.5 rounded-full transition-all " +
                        (i === pos ? "w-4 bg-brand" : "w-1.5 bg-line")
                      }
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {!atFirst && !isDone && (
                    <button
                      onClick={back}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition hover:text-ink"
                    >
                      <ArrowLeft size={14} /> Back
                    </button>
                  )}
                  {isDone ? (
                    <button
                      onClick={complete}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
                    >
                      Finish
                    </button>
                  ) : (
                    <button
                      onClick={next}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
                    >
                      {isWelcome ? "Show me around" : "Next"} <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              isDone && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={complete}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
                  >
                    Finish
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
