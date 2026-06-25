import { useCallback, useEffect, useState } from "react";
import { Ticket, X, ArrowRight, Sparkles } from "lucide-react";
import { useStore } from "../store";
import {
  computeOnboardingStep,
  onboardingCopy,
  type OnboardingStep,
} from "../lib/onboarding";

interface OnboardingFlags {
  started: boolean;
  completed: boolean;
}

// v2: the v1 gate could latch "started" on established accounts; bump the key so
// those stale flags are ignored and the corrected empty-board gate governs.
const KEY = (userId: string | null) => `bb:onboarding:v2:${userId ?? "local"}`;

function loadFlags(userId: string | null): OnboardingFlags {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (raw) {
      const d = JSON.parse(raw);
      return { started: Boolean(d.started), completed: Boolean(d.completed) };
    }
  } catch {
    /* ignore */
  }
  return { started: false, completed: false };
}

function saveFlags(userId: string | null, flags: OnboardingFlags): void {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

/** Drives the onboarding tour: the current step plus persisted started/completed
 *  flags. Reads live board state so the step auto-advances as the player acts. */
export function useOnboardingStep(): {
  step: OnboardingStep | null;
  markStarted: () => void;
  complete: () => void;
} {
  const userId = useStore((s) => s.userId);
  const vouchers = useStore((s) => s.vouchers);
  const games = useStore((s) => s.games);
  const [flags, setFlags] = useState<OnboardingFlags>(() => loadFlags(userId));

  // Reload the per-user flags whenever the signed-in user changes.
  useEffect(() => {
    setFlags(loadFlags(userId));
  }, [userId]);

  const hasGames = games.some((g) => g.status === "backlog");
  const hasPlaying = games.some((g) => g.status === "playing");

  const step = computeOnboardingStep({
    completed: flags.completed,
    started: flags.started,
    vouchers,
    hasGames,
    hasPlaying,
  });

  // Latch "started" the first time the tour shows a step, so it keeps running
  // even after the voucher is spent.
  useEffect(() => {
    if (step && !flags.started) {
      const next = { ...flags, started: true };
      setFlags(next);
      saveFlags(userId, next);
    }
  }, [step, flags, userId]);

  const complete = useCallback(() => {
    const next = { started: true, completed: true };
    setFlags(next);
    saveFlags(userId, next);
  }, [userId]);

  const markStarted = useCallback(() => {
    setFlags((f) => {
      const next = { ...f, started: true };
      saveFlags(userId, next);
      return next;
    });
  }, [userId]);

  return { step, markStarted, complete };
}

/** A floating, dismissible coach card that walks a new player through placing a
 *  game on the Bazaar and spending their first Free Game Voucher to start it.
 *  Auto-advances off live board state; persists per-user so it shows once. */
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
