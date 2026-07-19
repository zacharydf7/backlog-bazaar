import { describe, it, expect } from "vitest";
import {
  onboardingMode,
  onboardingCopy,
  questDone,
  questProgress,
  questCopy,
  coachTargetFor,
  ONBOARDING_QUESTS,
  type OnboardingModeInput,
  type QuestGame,
  type QuestId,
} from "./onboarding";

function modeInput(over: Partial<OnboardingModeInput> = {}): OnboardingModeInput {
  return { loaded: true, completed: false, pending: false, vouchers: 0, isAdmin: false, ...over };
}

const g = (status: QuestGame["status"], playedHours?: number): QuestGame => ({
  status,
  playedHours,
});

describe("onboardingMode", () => {
  it("runs the fresh tutorial for a signup in the pending tutorial phase", () => {
    expect(onboardingMode(modeInput({ pending: true }))).toBe("fresh");
  });

  it("shows the short granted intro for an existing account holding vouchers", () => {
    expect(onboardingMode(modeInput({ vouchers: 2 }))).toBe("granted");
  });

  it("shows nothing for an account with no pending grant and no vouchers", () => {
    expect(onboardingMode(modeInput())).toBeNull();
  });

  it("never enters fresh mode for a legacy account (pending false, never completed)", () => {
    // Accounts that predate the tour: completed_at null but pending was never
    // set — they must not suddenly get the tutorial.
    expect(onboardingMode(modeInput({ pending: false, completed: false }))).toBeNull();
  });

  it("never runs once completed, even with vouchers or a pending grant", () => {
    expect(onboardingMode(modeInput({ completed: true, pending: true }))).toBeNull();
    expect(onboardingMode(modeInput({ completed: true, vouchers: 5 }))).toBeNull();
  });

  it("stays silent until the account's data has loaded (no mid-switch flash)", () => {
    expect(onboardingMode(modeInput({ loaded: false, pending: true }))).toBeNull();
    expect(onboardingMode(modeInput({ loaded: false, vouchers: 2 }))).toBeNull();
  });

  it("prefers the fresh tutorial over the granted intro when both could apply", () => {
    expect(onboardingMode(modeInput({ pending: true, vouchers: 2 }))).toBe("fresh");
  });

  it("does not show the granted intro to admins (they manage vouchers themselves)", () => {
    expect(onboardingMode(modeInput({ vouchers: 2, isAdmin: true }))).toBeNull();
    // ...but an admin previewing via Reset (pending) still gets the tutorial.
    expect(onboardingMode(modeInput({ pending: true, isAdmin: true }))).toBe("fresh");
  });
});

describe("questDone", () => {
  it("a wishlist-only library has not stocked the Bazaar", () => {
    expect(questDone("stock", { games: [g("wishlist")] })).toBe(false);
  });

  it("any owned game stocks the Bazaar", () => {
    expect(questDone("stock", { games: [g("backlog")] })).toBe(true);
    expect(questDone("stock", { games: [g("playing")] })).toBe(true);
    expect(questDone("stock", { games: [g("finished")] })).toBe(true);
  });

  it("a playing or finished game counts as started (finished implies started)", () => {
    expect(questDone("start", { games: [g("backlog")] })).toBe(false);
    expect(questDone("start", { games: [g("playing")] })).toBe(true);
    expect(questDone("start", { games: [g("finished")] })).toBe(true);
  });

  it("logging needs real hours on an OWNED game", () => {
    expect(questDone("log", { games: [g("playing")] })).toBe(false);
    expect(questDone("log", { games: [g("playing", 0)] })).toBe(false);
    expect(questDone("log", { games: [g("playing", 1.5)] })).toBe(true);
    // Hours on a wishlist row (pre-owned history) don't count.
    expect(questDone("log", { games: [g("wishlist", 40)] })).toBe(false);
  });

  it("finishing needs a finished game", () => {
    expect(questDone("finish", { games: [g("playing", 10)] })).toBe(false);
    expect(questDone("finish", { games: [g("finished", 10)] })).toBe(true);
  });

  it("a Retired game is a drop, not a clear — it can't tick the finish quest", () => {
    expect(
      questDone("finish", { games: [{ ...g("finished", 10), finishTag: "retired" as const }] }),
    ).toBe(false);
  });
});

describe("questProgress", () => {
  it("starts with everything open and 'stock' active", () => {
    const p = questProgress({ games: [] });
    expect(p.completedCount).toBe(0);
    expect(p.total).toBe(4);
    expect(p.activeQuest?.id).toBe("stock");
  });

  it("advances the active quest as each completes in order", () => {
    expect(questProgress({ games: [g("backlog")] }).activeQuest?.id).toBe("start");
    expect(questProgress({ games: [g("playing")] }).activeQuest?.id).toBe("log");
    expect(questProgress({ games: [g("playing", 2)] }).activeQuest?.id).toBe("finish");
  });

  it("handles out-of-order completion: a finished import leaves 'log' active", () => {
    const p = questProgress({ games: [g("finished")] });
    expect(p.done.stock).toBe(true);
    expect(p.done.start).toBe(true);
    expect(p.done.finish).toBe(true);
    expect(p.done.log).toBe(false);
    expect(p.completedCount).toBe(3);
    expect(p.activeQuest?.id).toBe("log");
  });

  it("all quests done → no active quest (finale)", () => {
    const p = questProgress({ games: [g("finished", 12)] });
    expect(p.completedCount).toBe(4);
    expect(p.activeQuest).toBeNull();
  });

  it("checkmarks are live, not latched: deleting your only game reopens 'stock'", () => {
    expect(questProgress({ games: [g("backlog")] }).done.stock).toBe(true);
    expect(questProgress({ games: [] }).done.stock).toBe(false);
  });
});

describe("coachTargetFor", () => {
  const base = {
    ...modeInput({ pending: true }),
    claimed: true,
    games: [] as QuestGame[],
  };

  it("targets the active quest's control while in the claimed checklist", () => {
    expect(coachTargetFor(base)).toBe("add-game");
    expect(coachTargetFor({ ...base, games: [g("backlog")] })).toBe("activate");
    expect(coachTargetFor({ ...base, games: [g("playing")] })).toBe("log-time");
    expect(coachTargetFor({ ...base, games: [g("playing", 1)] })).toBe("finish");
  });

  it("rings nothing before the vouchers are claimed (welcome/primer phase)", () => {
    expect(coachTargetFor({ ...base, claimed: false })).toBeNull();
  });

  it("rings nothing outside fresh mode (completed, unloaded, legacy, granted)", () => {
    expect(coachTargetFor({ ...base, completed: true })).toBeNull();
    expect(coachTargetFor({ ...base, loaded: false })).toBeNull();
    expect(coachTargetFor({ ...base, pending: false })).toBeNull();
    expect(coachTargetFor({ ...base, pending: false, vouchers: 2 })).toBeNull(); // granted intro
  });

  it("rings nothing once every quest is complete (finale)", () => {
    expect(coachTargetFor({ ...base, games: [g("finished", 5)] })).toBeNull();
  });
});

describe("copy", () => {
  it("explains the loop in the welcome and personalises the primer's voucher count", () => {
    expect(onboardingCopy("welcome").body).toMatch(/earn coins/i);
    expect(onboardingCopy("primer", 2).body).toMatch(/2 free vouchers/i);
    expect(onboardingCopy("primer", 1).body).toMatch(/1 free voucher\b/i);
  });

  it("points the granted intro at Buy & Start (unchanged path)", () => {
    expect(onboardingCopy("granted").body).toMatch(/Buy & Start/i);
    expect(onboardingCopy("granted").title).toMatch(/granted a voucher/i);
  });

  it("quest 2 adapts to the wallet: voucher wording with one, coins without", () => {
    expect(questCopy("start", { vouchers: 2, coins: 120 }).body).toMatch(/use voucher/i);
    const broke = questCopy("start", { vouchers: 0, coins: 120 });
    expect(broke.body).toMatch(/coins/i);
    expect(broke.body).not.toMatch(/voucher/i);
  });

  it("every quest has complete copy and a CTA", () => {
    for (const q of ONBOARDING_QUESTS) {
      const c = questCopy(q.id as QuestId, { vouchers: 1, coins: 100 });
      expect(c.eyebrow).toBeTruthy();
      expect(c.title).toBeTruthy();
      expect(c.body).toBeTruthy();
      expect(c.cta).toBeTruthy();
    }
  });
});

describe("economy-off copy", () => {
  const OFF = false;

  it("never promises coins, vouchers or bounties in tracker mode", () => {
    // The welcome may POINT at the toggle ("want the full coin game?"), but the
    // primer, finale and every quest teach a currency-free loop.
    for (const step of ["primer", "finale"] as const) {
      const c = onboardingCopy(step, 2, OFF);
      expect(c.body).not.toMatch(/coin|voucher|bounty|fee/i);
    }
    for (const q of ONBOARDING_QUESTS) {
      const c = questCopy(q.id, { vouchers: 2, coins: 120, economyOn: false });
      expect(c.body).not.toMatch(/coin|voucher|bounty|fee/i);
      expect(c.eyebrow).not.toMatch(/bounty/i);
    }
  });

  it("both welcome variants point at the Account-settings toggle", () => {
    expect(onboardingCopy("welcome", 2, true).body).toMatch(/Account settings/i);
    expect(onboardingCopy("welcome", 2, OFF).body).toMatch(/Account settings/i);
  });

  it("the off-mode start quest teaches the free Start playing button", () => {
    const c = questCopy("start", { vouchers: 3, coins: 0, economyOn: false });
    expect(c.body).toMatch(/Start playing/);
    expect(c.body).toMatch(/free/i);
  });

  it("defaults to the economy-on script when economyOn is omitted", () => {
    expect(onboardingCopy("welcome").body).toMatch(/earn coins/i);
    expect(questCopy("finish", { vouchers: 0, coins: 10 }).body).toMatch(/bounty/i);
  });
});
