// Pure logic for the interactive onboarding walkthrough ("Jumpstart" tour) that
// guides a brand-new player through the core loop: put a real game on your Bazaar
// board, then spend a Free Game Voucher to move it into Now Playing. Kept free of
// React/Supabase so the step machine is unit-testable; the UI (OnboardingCoach)
// and persistence live elsewhere.

export type OnboardingStep = "add-game" | "use-voucher" | "done";

/** The two actionable steps, in order (the celebratory "done" is the finale). */
export const ONBOARDING_ACTION_STEPS: OnboardingStep[] = ["add-game", "use-voucher"];

export interface OnboardingInput {
  /** The user finished or skipped the tour (persisted). */
  completed: boolean;
  /** The tour has begun for this user (persisted) — keeps it running even after
   *  the voucher is spent. */
  started: boolean;
  vouchers: number;
  hasGames: boolean; // any game in the library
  hasPlaying: boolean; // any game currently in Now Playing
}

/** The step to show, or null when the tour shouldn't run. The tour only ever
 *  *begins* for a fresh account — one that still holds onboarding vouchers — so
 *  established players are never nagged; once begun it sees the loop through. */
export function computeOnboardingStep(i: OnboardingInput): OnboardingStep | null {
  if (i.completed) return null;
  if (!i.started && i.vouchers <= 0) return null;
  if (i.hasPlaying) return "done"; // a game reached Now Playing — celebrate + finish
  if (!i.hasGames) return "add-game"; // empty board — add the first game
  if (i.vouchers > 0) return "use-voucher"; // a Bazaar game + a voucher to spend
  return null;
}

export interface OnboardingCopy {
  index: number; // 1-based action-step number ("Step X of 2"); 0 for the finale
  total: number; // number of action steps
  title: string;
  body: string;
  cta: string | null; // primary button label (null = no direct action, just guidance)
}

/** Display copy for a step. The finale (`done`) has no step number. */
export function onboardingCopy(step: OnboardingStep): OnboardingCopy {
  const total = ONBOARDING_ACTION_STEPS.length;
  switch (step) {
    case "add-game":
      return {
        index: 1,
        total,
        title: "Add a game you're playing",
        body: "Search for a game you already own and add it to your Bazaar board — it's the shelf for everything waiting to be started.",
        cta: "Add a game",
      };
    case "use-voucher":
      return {
        index: 2,
        total,
        title: "Use a voucher to start it",
        body: "Open the game on your Bazaar board and tap “Use voucher” to move it into Now Playing for free — no coins needed.",
        cta: null,
      };
    case "done":
      return {
        index: 0,
        total,
        title: "You're all set! 🎉",
        body: "That's the core loop: buy or activate a game to start it, log your time, then mark it finished to earn coins. Enjoy the Bazaar!",
        cta: "Finish",
      };
  }
}
