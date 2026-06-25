// Pure logic for the interactive onboarding walkthrough ("Jumpstart" tour) that
// guides a brand-new player through the core loop: put a real game on your Bazaar
// board, then spend a Free Game Voucher to move it into Now Playing. Kept free of
// React/Supabase so the step machine is unit-testable; the UI (OnboardingCoach)
// and persistence live elsewhere.

export type OnboardingStep = "welcome" | "add-game" | "use-voucher" | "granted" | "done";

/** The two numbered steps of the fresh-signup sequence (the "granted" intro and
 *  the celebratory "done" are standalone, unnumbered cards). */
export const ONBOARDING_ACTION_STEPS: OnboardingStep[] = ["add-game", "use-voucher"];

/** How recently an account must have been created to count as a brand-new signup
 *  (vs. an existing account that's just been granted a voucher). Within this
 *  window the tour runs the guided add→use sequence; outside it, the "you were
 *  granted a voucher" intro. */
export const NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day

export interface OnboardingInput {
  /** The user finished or skipped the tour (durable: onboarding_completed_at). */
  completed: boolean;
  /** The signed-in account's profile + library have loaded — guards against the
   *  transient cross-account state during an auth switch. */
  loaded: boolean;
  /** A genuinely fresh signup (created within NEW_ACCOUNT_WINDOW_MS) vs. an
   *  established account that's just been granted a voucher. */
  isNewAccount: boolean;
  /** The user clicked through the welcome card (ephemeral, this session). */
  engaged: boolean;
  vouchers: number;
  hasGames: boolean; // any game in the library
  hasPlaying: boolean; // any game currently in Now Playing
}

/** The step to show, or null when the tour shouldn't run. The tour runs for any
 *  account that holds onboarding vouchers and hasn't completed it yet — so a new
 *  signup AND an existing account granted its first voucher both get it once, but
 *  via different entry points. Holding a voucher is the gate, so an established
 *  account that never receives one is never nagged. Only evaluated once loaded. */
export function computeOnboardingStep(i: OnboardingInput): OnboardingStep | null {
  if (!i.loaded) return null;
  if (i.completed) return null;
  if (i.vouchers <= 0) return null; // only while there's a voucher to spend
  if (i.hasPlaying) return "done"; // a game reached Now Playing — celebrate + finish
  if (!i.hasGames) {
    // Fresh signup: open with a brief welcome before the first task; an existing
    // account with an empty board just goes straight to adding a game.
    return i.isNewAccount && !i.engaged ? "welcome" : "add-game";
  }
  // Has a game + a voucher: fresh signups continue the guided sequence; an
  // established account gets the contextual "you were granted a voucher" intro.
  return i.isNewAccount ? "use-voucher" : "granted";
}

export interface OnboardingCopy {
  index: number; // 1-based action-step number ("Step X of 2"); 0 for the finale
  total: number; // number of action steps
  title: string;
  body: string;
  cta: string | null; // primary button label (null = no direct action, just guidance)
}

/** Display copy for a step. The intro (`welcome`/`granted`) and finale (`done`)
 *  have no step number. `vouchers` personalises the welcome greeting. */
export function onboardingCopy(step: OnboardingStep, vouchers = 0): OnboardingCopy {
  const total = ONBOARDING_ACTION_STEPS.length;
  switch (step) {
    case "welcome":
      return {
        index: 0,
        total,
        title: "Welcome to Backlog Bazaar! 👋",
        body: `Looks like you've got ${vouchers} free voucher${vouchers === 1 ? "" : "s"} 🎟️ — each one starts a game you're already playing, no coins needed. Here's a quick tour to put one to use.`,
        cta: "Show me around",
      };
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
    case "granted":
      return {
        index: 0,
        total,
        title: "You were granted a voucher! 🎟️",
        body: "A Free Game Voucher activates a game for free — open one on your Bazaar board and tap “Use voucher” to move it into Now Playing without spending coins.",
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
