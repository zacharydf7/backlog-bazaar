import type { Game } from "../types";

// Pure logic + copy for onboarding. Two experiences:
//  • A fresh signup gets two short cards (welcome → primer), claims its starter
//    vouchers up front, then an interactive "Getting Started" checklist: four
//    quests that auto-complete off the player's REAL library — the tutorial is
//    doing the loop, not reading about it. Quest completion derives from live
//    game state (no separate progress storage); the coach navigates to each
//    quest's board and highlights the real control (CoachTarget).
//  • An existing account that's been granted a voucher gets a short, contextual
//    "you were granted a voucher" intro instead.
// Kept free of React/Supabase so the model is unit-testable; the UI
// (OnboardingCoach) and persistence live elsewhere.

/** The non-quest cards the coach can show. */
export type OnboardingStep = "welcome" | "primer" | "finale" | "granted";

export type QuestId = "stock" | "start" | "log" | "finish";

/** The real control a quest highlights (components ring themselves when the
 *  derived selector matches — see coachTargetFor / selectCoachTarget). */
export type CoachTarget = "add-game" | "activate" | "log-time" | "finish";

export interface Quest {
  id: QuestId;
  /** The App view the coach navigates to for this quest. */
  view: string;
  target: CoachTarget;
}

/** The Getting Started checklist, in presentation order. Quests complete
 *  independently and out of order; the ACTIVE quest is the first incomplete. */
export const ONBOARDING_QUESTS: Quest[] = [
  { id: "stock", view: "backlog", target: "add-game" },
  { id: "start", view: "backlog", target: "activate" },
  { id: "log", view: "playing", target: "log-time" },
  { id: "finish", view: "playing", target: "finish" },
];

/** The slice of a game the quest predicates need (structurally satisfied by
 *  the store's Game rows). */
export type QuestGame = Pick<Game, "status" | "playedHours" | "finishTag">;

export interface QuestInput {
  games: QuestGame[];
}

/** Whether a quest is complete, derived purely from live library state — so
 *  checkmarks self-correct (e.g. deleting your only game un-checks "stock"
 *  rather than pointing quest 2 at an empty shelf). */
export function questDone(id: QuestId, i: QuestInput): boolean {
  const { games } = i;
  switch (id) {
    case "stock":
      // Any OWNED game (backlog/playing/finished) — a wishlist-only library
      // hasn't stocked the Bazaar yet.
      return games.some((g) => g.status !== "wishlist");
    case "start":
      // Finished implies started, so an imported/finished library still counts.
      return games.some((g) => g.status === "playing" || g.status === "finished");
    case "log":
      // Hours on a wishlist row (pre-owned history) don't count.
      return games.some((g) => g.status !== "wishlist" && (g.playedHours ?? 0) > 0);
    case "finish":
      // A Retired game is a drop, not a clear — it pays no bounty, so it can't
      // teach the finish-for-coins loop this quest is about.
      return games.some((g) => g.status === "finished" && g.finishTag !== "retired");
  }
}

export interface QuestProgress {
  done: Record<QuestId, boolean>;
  completedCount: number;
  total: number;
  /** First incomplete quest in order; null = all done (show the finale). */
  activeQuest: Quest | null;
}

export function questProgress(i: QuestInput): QuestProgress {
  const done = {
    stock: questDone("stock", i),
    start: questDone("start", i),
    log: questDone("log", i),
    finish: questDone("finish", i),
  };
  return {
    done,
    completedCount: ONBOARDING_QUESTS.filter((q) => done[q.id]).length,
    total: ONBOARDING_QUESTS.length,
    activeQuest: ONBOARDING_QUESTS.find((q) => !done[q.id]) ?? null,
  };
}

export type OnboardingMode = "fresh" | "granted";

export interface OnboardingModeInput {
  /** The account's profile + library have loaded (guards the auth-switch race). */
  loaded: boolean;
  /** The tour has been finished/dismissed (durable onboarding_completed_at). */
  completed: boolean;
  /** The tutorial phase is unfinished (onboarding_vouchers_pending — true from
   *  signup/reset/Fresh Start until complete_onboarding, so the checklist
   *  resumes across sessions). */
  pending: boolean;
  /** Vouchers currently held (an existing account granted some → the short intro). */
  vouchers: number;
  /** Admins manage vouchers (grant/self-grant) and don't need the player intro. */
  isAdmin: boolean;
}

/** Which onboarding experience to run, or null for none. A fresh signup
 *  (tutorial phase pending) gets the interactive checklist; a regular
 *  established account that's granted a voucher gets the short granted intro;
 *  admins (who manage vouchers themselves) and accounts that never receive a
 *  voucher get nothing. */
export function onboardingMode(i: OnboardingModeInput): OnboardingMode | null {
  if (!i.loaded) return null;
  if (i.completed) return null;
  if (i.pending) return "fresh";
  if (i.vouchers > 0 && !i.isAdmin) return "granted";
  return null;
}

export interface CoachTargetInput extends OnboardingModeInput {
  /** Starter vouchers already claimed (onboarding_vouchers_granted_at set) —
   *  i.e. the player is past the welcome cards and inside the checklist. */
  claimed: boolean;
  games: QuestGame[];
}

/** The control to highlight right now, or null. Derived (never stored) so a
 *  ring can't go stale: it clears the moment the quest completes, the tour is
 *  finished/skipped, or another account's data is loading. */
export function coachTargetFor(i: CoachTargetInput): CoachTarget | null {
  if (onboardingMode(i) !== "fresh" || !i.claimed) return null;
  return questProgress({ games: i.games }).activeQuest?.target ?? null;
}

export interface OnboardingCopy {
  eyebrow: string; // short uppercase label
  title: string;
  body: string;
}

/** Display copy for the non-quest cards. `vouchers` personalises the welcome;
 *  `economyOn = false` switches to the plain-tracker script (no coins,
 *  vouchers, prices or bounties are ever promised). Both modes mention the
 *  Account-settings toggle so players know the other mode exists. */
export function onboardingCopy(step: OnboardingStep, vouchers = 0, economyOn = true): OnboardingCopy {
  const n = vouchers;
  const plural = n === 1 ? "" : "s";
  if (!economyOn) {
    switch (step) {
      case "welcome":
        return {
          eyebrow: "Welcome",
          title: "Welcome to Backlog Bazaar! 👋",
          body: "Track your backlog from shelf to done: stock the games you own, start the ones you're playing, log your hours and mark your finishes. A few quick quests will walk you through it. (Want the full coin game — activation fees, finish bounties, a shop to spend in? Flip the coin economy on in Account settings any time.)",
        };
      case "primer":
        return {
          eyebrow: "The lay of the land",
          title: "Five stops on your route",
          body: "Your Bazaar holds the games you own but haven't started. Now Playing is your active shelf, Finished collects your clears, the Wishlist parks games you don't own yet, and The Caravan is where you discover new ones. That's the map — let's play.",
        };
      case "finale":
        return {
          eyebrow: "You're all set",
          title: "That's the whole loop! 🎉",
          body: "You stocked your Bazaar, started a game, logged your hours and finished it. That's the rhythm — enjoy clearing that backlog!",
        };
      case "granted":
        // Vouchers are an economy feature; the granted intro only runs for
        // economy-on accounts, but keep the copy sensible regardless.
        return {
          eyebrow: "New voucher",
          title: "You were granted a voucher! 🎟️",
          body: "Vouchers are part of the coin economy, which you've turned off. Flip it back on in Account settings to spend it.",
        };
    }
  }
  switch (step) {
    case "welcome":
      return {
        eyebrow: "Welcome",
        title: "Welcome to Backlog Bazaar! 👋",
        body: "Turn your backlog into a game: spend coins to start a game, then earn coins back — and more — when you finish it. Beat games, earn coins, play more. A few quick quests will teach you the loop hands-on, with free vouchers to spend along the way. (Prefer plain tracking with no coins? Turn the economy off in Account settings any time.)",
      };
    case "primer":
      return {
        eyebrow: "The lay of the land",
        title: "Five stops on your route",
        body: `Your Bazaar holds the games you own but haven't started, each with a coin price. Now Playing is your active shelf, Finished pays out each game's coin bounty, the Wishlist parks games you don't own yet, and The Caravan is where you discover new ones. That's the map — claim your ${n} free voucher${plural} 🎟️ and let's play.`,
      };
    case "finale":
      return {
        eyebrow: "You're all set",
        title: "That's the whole loop! 🎉",
        body: "You stocked your Bazaar, started a game, logged your hours and finished it — and the bounty paid out. Every finish funds the next pickup; that loop is the whole game. Enjoy clearing that backlog!",
      };
    case "granted":
      return {
        eyebrow: "New voucher",
        title: "You were granted a voucher! 🎟️",
        body: "A Free Game Voucher activates a game for free. On your Bazaar board, hit a game's “Buy & Start” button and choose “Use voucher” to move it into Now Playing without spending coins.",
      };
  }
}

/** Copy for a quest row, adapted to what the player actually holds — quest 2
 *  talks vouchers only while they have one to spend, and economy-off mode
 *  never mentions coins, fees or bounties at all. */
export function questCopy(
  id: QuestId,
  ctx: { vouchers: number; coins: number; economyOn?: boolean },
): OnboardingCopy & { cta: string } {
  const economyOn = ctx.economyOn !== false;
  switch (id) {
    case "stock":
      return {
        eyebrow: "Quest 1 · Stock your Bazaar",
        title: "Add your first game",
        body: economyOn
          ? "Add a game you own — search the whole catalog with the Add button, or browse The Caravan for ideas. It lands in your Bazaar with a coin price on its tag."
          : "Add a game you own — search the whole catalog with the Add button, or browse The Caravan for ideas. It lands in your Bazaar, ready to start.",
        cta: "Show me",
      };
    case "start":
      if (!economyOn) {
        return {
          eyebrow: "Quest 2 · Start playing",
          title: "Start your first game",
          body: "On your new game's card, hit “Start playing” — it's free, and the game moves into Now Playing.",
          cta: "Show me",
        };
      }
      return ctx.vouchers > 0
        ? {
            eyebrow: "Quest 2 · Start playing",
            title: "Start it with a free voucher",
            body: "On your new game's card, hit “Buy & Start” and choose “Use voucher” — starting it costs you nothing, and the game moves into Now Playing.",
            cta: "Show me",
          }
        : {
            eyebrow: "Quest 2 · Start playing",
            title: "Start your first game",
            body: `On your new game's card, hit “Buy & Start” and pay the activation fee with your coins (you have ${ctx.coins}) — the game moves into Now Playing.`,
            cta: "Show me",
          };
    case "log":
      return {
        eyebrow: "Quest 3 · Log your time",
        title: "Log your first play session",
        body: "Played a bit? Type it into the “Add time” box on your Now Playing card — like “1h 30m” — and hit Log. Your hours build your stats and history.",
        cta: "Show me",
      };
    case "finish":
      return {
        eyebrow: economyOn ? "Quest 4 · Claim a bounty" : "Quest 4 · Finish a game",
        title: "Finish your first game",
        body: economyOn
          ? "Whenever you beat it — today or next month — hit “Mark Finished”. The game's coin bounty pays out and funds your next pickup. This checklist will wait for you."
          : "Whenever you beat it — today or next month — hit “Mark Finished” and it joins your Finished shelf. This checklist will wait for you.",
        cta: "Show me",
      };
  }
}
