// Pure logic + copy for the onboarding tour. Two entry points:
//  • A fresh signup runs the full guided tour — a welcome, a quick pass over the
//    core sections, and a simulated demo of starting a game with a voucher — and
//    is credited its starter vouchers when the tour ends.
//  • An existing account that's been granted a voucher gets a short, contextual
//    "you were granted a voucher" intro instead.
// Kept free of React/Supabase so the step model is unit-testable; the UI
// (OnboardingCoach) and persistence live elsewhere.

export type OnboardingStep =
  // The fresh-signup tour, in order:
  | "welcome"
  | "bazaar"
  | "now-playing"
  | "finished"
  | "wishlist"
  | "caravan"
  | "ledger"
  | "demo"
  | "done"
  // The existing-account (granted-a-voucher) intro:
  | "granted";

/** The fresh-signup tour as an ordered list — the coach walks these one card at a
 *  time. The existing-account path ("granted") is separate and board-state driven. */
export const FRESH_TOUR_STEPS: OnboardingStep[] = [
  "welcome",
  "bazaar",
  "now-playing",
  "finished",
  "wishlist",
  "caravan",
  "ledger",
  "demo",
  "done",
];

export type OnboardingMode = "fresh" | "granted";

export interface OnboardingModeInput {
  /** The account's profile + library have loaded (guards the auth-switch race). */
  loaded: boolean;
  /** The tour has been finished/dismissed (durable onboarding_completed_at). */
  completed: boolean;
  /** A fresh signup whose starter vouchers are still pending (the full tour). */
  pending: boolean;
  /** Vouchers currently held (an existing account granted some → the short intro). */
  vouchers: number;
}

/** Which onboarding experience to run, or null for none. A fresh signup (vouchers
 *  pending) gets the full tour; an established account that simply holds vouchers
 *  gets the short granted intro; everyone else (incl. accounts that never receive
 *  a voucher) gets nothing. */
export function onboardingMode(i: OnboardingModeInput): OnboardingMode | null {
  if (!i.loaded) return null;
  if (i.completed) return null;
  if (i.pending) return "fresh";
  if (i.vouchers > 0) return "granted";
  return null;
}

/** The step for the existing-account path: the short intro, then the celebration
 *  once they've actually moved a game into Now Playing with their voucher. */
export function grantedStep(hasPlaying: boolean): OnboardingStep {
  return hasPlaying ? "done" : "granted";
}

export interface OnboardingCopy {
  eyebrow: string; // short uppercase label
  title: string;
  body: string;
}

/** Display copy for a step. `vouchers` personalises the welcome/finale. */
export function onboardingCopy(step: OnboardingStep, vouchers = 0): OnboardingCopy {
  const n = vouchers;
  const plural = n === 1 ? "" : "s";
  switch (step) {
    case "welcome":
      return {
        eyebrow: "Welcome",
        title: "Welcome to Backlog Bazaar! 👋",
        body: "Turn your backlog into a game: spend coins to start a game, then earn coins back — and more — when you finish it. Beat games, earn coins, play more. Take this quick tour and we'll drop free vouchers in your wallet at the end.",
      };
    case "bazaar":
      return {
        eyebrow: "Bazaar",
        title: "Your backlog shelf",
        body: "Every game you own but haven't started waits here, each with a coin price. Spend coins — or a voucher — to move one into Now Playing and start it.",
      };
    case "now-playing":
      return {
        eyebrow: "Now Playing",
        title: "Where your active games live",
        body: "Games you're currently playing sit here. You only get a few slots, so finish or shelve one before starting another — it keeps you focused on what you're actually playing.",
      };
    case "finished":
      return {
        eyebrow: "Finished",
        title: "Games you've beaten",
        body: "Completed games move here. Finishing a game pays its coin bounty — the payout that funds your next pickup, so the backlog keeps itself going.",
      };
    case "wishlist":
      return {
        eyebrow: "Wishlist",
        title: "Games you don't own yet",
        body: "Eyeing something you haven't bought in real life? Park it on the Wishlist. It stays out of your priced Bazaar until you actually own it and bring it in.",
      };
    case "caravan":
      return {
        eyebrow: "The Caravan",
        title: "Discover new games",
        body: "Browse The Caravan to find games and add them — straight to your Bazaar if you own them, or to your Wishlist with the ♡ button if you don't.",
      };
    case "ledger":
      return {
        eyebrow: "Master Ledger",
        title: "Your whole collection at a glance",
        body: "The Master Ledger gathers every game you own — across the Bazaar, Now Playing and Finished — into one filterable dashboard.",
      };
    case "demo":
      return {
        eyebrow: "Try it",
        title: "Start a game with a voucher",
        body: "Here's the move: on a game, hit “Buy & Start”, then choose “Use voucher” to send it to Now Playing for free. Give it a try below 👇",
      };
    case "done":
      return {
        eyebrow: "You're all set",
        title: "Enjoy the Bazaar! 🎉",
        body: `To help you get started, we've dropped ${n} free voucher${plural} 🎟️ in your wallet. Use them on real games from your Bazaar with “Buy & Start” → “Use voucher”, and have fun clearing that backlog!`,
      };
    case "granted":
      return {
        eyebrow: "New voucher",
        title: "You were granted a voucher! 🎟️",
        body: "A Free Game Voucher activates a game for free. On your Bazaar board, hit a game's “Buy & Start” button and choose “Use voucher” to move it into Now Playing without spending coins.",
      };
  }
}
