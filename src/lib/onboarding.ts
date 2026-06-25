// Pure logic for the interactive onboarding walkthrough ("Jumpstart" tour) that
// guides a brand-new player through the core loop: put a real game on your Bazaar
// board, then spend a Free Game Voucher to move it into Now Playing. Kept free of
// React/Supabase so the step machine is unit-testable; the UI (OnboardingCoach)
// and persistence live elsewhere.

export type OnboardingStep = "add-game" | "use-voucher" | "done";

/** The two actionable steps, in order (the celebratory "done" is the finale). */
export const ONBOARDING_ACTION_STEPS: OnboardingStep[] = ["add-game", "use-voucher"];

export interface OnboardingInput {
  /** The user finished or skipped the tour (durable: onboarding_completed_at). */
  completed: boolean;
  /** The signed-in account's profile + library have loaded — guards against the
   *  transient cross-account state during an auth switch. */
  loaded: boolean;
  vouchers: number;
  hasGames: boolean; // any game in the library
  hasPlaying: boolean; // any game currently in Now Playing
}

/** The step to show, or null when the tour shouldn't run. The tour runs for any
 *  account that holds onboarding vouchers and hasn't completed it yet — so a new
 *  signup AND an existing account granted its first voucher both get it once.
 *  Holding a voucher is the gate, so an established account that never receives
 *  one is never nagged. Only evaluated once the account's data has loaded. */
export function computeOnboardingStep(i: OnboardingInput): OnboardingStep | null {
  if (!i.loaded) return null;
  if (i.completed) return null;
  if (i.vouchers <= 0) return null; // only while there's a voucher to spend
  if (i.hasPlaying) return "done"; // a game reached Now Playing — celebrate + finish
  if (!i.hasGames) return "add-game"; // empty board — add the first game
  return "use-voucher"; // a Bazaar game + a voucher in hand
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
