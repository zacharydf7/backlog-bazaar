import { Ticket, X, ArrowRight, Sparkles } from "lucide-react";
import { useStore } from "../store";
import { computeOnboardingStep, onboardingCopy, type OnboardingStep } from "../lib/onboarding";

/** The current onboarding step (or null), derived from live store state. The tour
 *  shows for any signed-in account that holds vouchers and hasn't completed it —
 *  gated on sessionLoaded so it never acts on the transient state mid auth-switch.
 *  Completion is durable (server onboarding_completed_at). */
export function useOnboardingStep(): {
  step: OnboardingStep | null;
  complete: () => void;
} {
  const sessionLoaded = useStore((s) => s.sessionLoaded);
  const vouchers = useStore((s) => s.vouchers);
  const games = useStore((s) => s.games);
  const onboardingCompletedAt = useStore((s) => s.onboardingCompletedAt);
  const completeOnboarding = useStore((s) => s.completeOnboarding);

  const step = computeOnboardingStep({
    loaded: sessionLoaded,
    completed: onboardingCompletedAt != null,
    vouchers,
    hasGames: games.some((g) => g.status === "backlog"),
    hasPlaying: games.some((g) => g.status === "playing"),
  });

  return { step, complete: () => void completeOnboarding() };
}

/** A floating, dismissible coach card that walks a player through placing a game
 *  on the Bazaar and spending their first Free Game Voucher to start it.
 *  Auto-advances off live board state; shows at most once per account. */
export function OnboardingCoach({ onAddGame }: { onAddGame: () => void }) {
  const { step, complete } = useOnboardingStep();
  if (!step) return null;

  const copy = onboardingCopy(step);
  const isDone = step === "done";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-brand/40 bg-surface p-4 shadow-2xl ring-1 ring-brand/20">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            {isDone ? <Sparkles size={16} /> : <Ticket size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
                {isDone ? "Getting started" : `Step ${copy.index} of ${copy.total}`}
              </span>
              {!isDone && (
                <button
                  onClick={complete}
                  className="-mr-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-subtle transition hover:text-ink"
                >
                  Skip tour <X size={12} />
                </button>
              )}
            </div>
            <h3 className="mt-0.5 font-display text-base leading-tight text-ink">{copy.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{copy.body}</p>

            <div className="mt-3 flex justify-end">
              {step === "add-game" && (
                <button
                  onClick={onAddGame}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
                >
                  {copy.cta} <ArrowRight size={15} />
                </button>
              )}
              {step === "use-voucher" && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-medium text-accent">
                  <Ticket size={13} className="text-brand" /> Tap “Use voucher” on a game
                </span>
              )}
              {isDone && (
                <button
                  onClick={complete}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105 active:brightness-95"
                >
                  {copy.cta}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
