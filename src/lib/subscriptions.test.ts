import { describe, it, expect } from "vitest";
import type { Game, GameCopy } from "../types";
import {
  addCadence,
  coerceSubscription,
  costToDate,
  daysBetween,
  exactProvider,
  formatIsoDate,
  formatPeriod,
  groupMemberships,
  isIsoDate,
  isLinkedGame,
  localIsoDate,
  memberSavingsOf,
  membershipFinancials,
  membershipReport,
  membershipKeyOf,
  membershipVerdict,
  nextRenewal,
  periodsOf,
  providerCovers,
  providerKey,
  providerTracked,
  renewalPhrase,
  sessionCounts,
  subscriptionCopiesFor,
  totalMemberSavings,
  type MembershipSession,
  type Subscription,
} from "./subscriptions";

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  id: "s1",
  provider: "PlayStation Plus Premium",
  price: 159.99,
  cadence: "yearly",
  startedOn: "2026-01-15",
  endedOn: null,
  note: "",
  ...over,
});

let copyN = 0;
const copy = (over: Partial<GameCopy> = {}): GameCopy => ({
  id: `c${++copyN}`,
  platform: "PlayStation 5",
  ...over,
});
const subCopy = (over: Partial<GameCopy> = {}): GameCopy =>
  copy({ acquisition: "subscription", provider: "PlayStation Plus Premium", ...over });

const game = (over: Partial<Game> = {}): Game =>
  ({
    id: "g1",
    title: "Game",
    status: "backlog",
    genres: [],
    platforms: [],
    copies: [],
    addedAt: Date.parse("2026-02-01T12:00:00"),
    ...over,
  }) as Game;

const at = (iso: string) => Date.parse(`${iso}T12:00:00`);
const session = (over: Partial<MembershipSession> = {}): MembershipSession => ({
  gameId: "g1",
  platform: "PlayStation 5",
  hours: 1,
  createdAt: at("2026-03-01"),
  live: true,
  ...over,
});

const TODAY = "2026-09-05";
const PS = "playstation plus premium";
const isPS = exactProvider("PlayStation Plus Premium");

describe("coerceSubscription", () => {
  it("coerces a PostgREST row (numeric as string, null end)", () => {
    expect(
      coerceSubscription({
        id: "s1",
        provider: " PlayStation Plus Premium ",
        price: "159.99",
        cadence: "yearly",
        started_on: "2026-01-15",
        ended_on: null,
        note: "annual",
      }),
    ).toEqual({
      id: "s1",
      provider: "PlayStation Plus Premium",
      price: 159.99,
      cadence: "yearly",
      startedOn: "2026-01-15",
      endedOn: null,
      note: "annual",
    });
  });

  it("rejects malformed rows", () => {
    const ok = {
      id: "s1",
      provider: "X",
      price: 1,
      cadence: "monthly",
      started_on: "2026-01-01",
    };
    expect(coerceSubscription(ok)).not.toBeNull();
    expect(coerceSubscription({ ...ok, provider: "  " })).toBeNull();
    expect(coerceSubscription({ ...ok, cadence: "weekly" })).toBeNull();
    expect(coerceSubscription({ ...ok, price: -1 })).toBeNull();
    expect(coerceSubscription({ ...ok, started_on: "2026-02-30" })).toBeNull();
    expect(coerceSubscription({ ...ok, ended_on: "garbage" })?.endedOn).toBeNull();
  });
});

describe("calendar helpers", () => {
  it("validates ISO dates including real month lengths", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-01-01")).toBe(false);
  });

  it("adds months with day clamping anchored to the original day", () => {
    expect(addCadence("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(addCadence("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(addCadence("2026-11-15", "monthly", 3)).toBe("2027-02-15");
    expect(addCadence("2024-02-29", "yearly", 1)).toBe("2025-02-28");
    expect(addCadence("2024-02-29", "yearly", 4)).toBe("2028-02-29");
    expect(addCadence("2026-01-15", "monthly", 0)).toBe("2026-01-15");
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2026-09-05", "2026-10-03")).toBe(28);
    expect(daysBetween("2026-09-05", "2026-09-05")).toBe(0);
    expect(daysBetween("2026-09-05", "2026-09-04")).toBe(-1);
  });

  it("formats a timestamp as its local calendar date", () => {
    expect(localIsoDate(at("2026-03-01"))).toBe("2026-03-01");
  });

  it("formats dates and periods without timezone drift", () => {
    expect(formatIsoDate("2026-09-05")).toBe("Sep 5, 2026");
    expect(
      formatPeriod({ index: 0, start: "2026-01-15", end: "2027-01-15", price: 1, current: true }),
    ).toBe("Jan 15, 2026 – Jan 14, 2027");
    expect(
      formatPeriod({ index: 0, start: "2026-03-01", end: "2026-04-01", price: 1, current: true }),
    ).toBe("Mar 1 – Mar 31, 2026");
  });
});

describe("periodsOf / nextRenewal / costToDate", () => {
  it("lists every started period of a yearly plan and flags the current one", () => {
    const p = periodsOf(sub(), TODAY);
    expect(p).toEqual([
      { index: 0, start: "2026-01-15", end: "2027-01-15", price: 159.99, current: true },
    ]);
    expect(nextRenewal(sub(), TODAY)).toBe("2027-01-15");
    expect(costToDate(sub(), TODAY)).toBeCloseTo(159.99);
  });

  it("accrues one period per month for a monthly plan", () => {
    const m = sub({ cadence: "monthly", price: 10, startedOn: "2026-06-20" });
    const p = periodsOf(m, TODAY);
    expect(p.map((x) => x.start)).toEqual(["2026-06-20", "2026-07-20", "2026-08-20"]);
    expect(p.filter((x) => x.current).map((x) => x.index)).toEqual([2]);
    expect(costToDate(m, TODAY)).toBe(30);
    expect(nextRenewal(m, TODAY)).toBe("2026-09-20");
  });

  it("has no periods (and no renewal) before the plan starts", () => {
    const future = sub({ startedOn: "2026-10-01" });
    expect(periodsOf(future, TODAY)).toEqual([]);
    expect(nextRenewal(future, TODAY)).toBeNull();
    expect(costToDate(future, TODAY)).toBe(0);
  });

  it("stops accruing once the plan ended, keeping the paid period the end fell in", () => {
    const m = sub({ cadence: "monthly", price: 10, startedOn: "2026-01-01", endedOn: "2026-03-15" });
    expect(periodsOf(m, TODAY).map((x) => x.start)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect(nextRenewal(m, TODAY)).toBeNull();
    // Ended exactly on a renewal day: that renewal never happened.
    const onBoundary = sub({ cadence: "monthly", price: 10, startedOn: "2026-01-01", endedOn: "2026-03-01" });
    expect(periodsOf(onBoundary, TODAY).map((x) => x.start)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("reports no next renewal when the plan is set to end before it", () => {
    const cancelled = sub({ endedOn: "2026-12-31" });
    expect(nextRenewal(cancelled, TODAY)).toBeNull();
    expect(periodsOf(cancelled, TODAY)).toHaveLength(1);
  });

  it("phrases the renewal", () => {
    expect(renewalPhrase("2026-10-03", TODAY)).toBe("Renews Oct 3, 2026 (in 28 days)");
    expect(renewalPhrase("2026-09-06", TODAY)).toBe("Renews Sep 6, 2026 (tomorrow)");
    expect(renewalPhrase("2026-09-05", TODAY)).toBe("Renews Sep 5, 2026 (today)");
    expect(renewalPhrase(null, TODAY)).toBeNull();
  });
});

describe("groupMemberships", () => {
  it("groups plans by provider (case-insensitive), newest plan first, active memberships first", () => {
    const extra = sub({ id: "a", provider: "PlayStation Plus Premium", price: 100, startedOn: "2025-01-15", endedOn: "2026-01-15" });
    const premium = sub({ id: "b", provider: "playstation plus premium ", price: 159.99, startedOn: "2026-01-15" });
    const old = sub({ id: "c", provider: "EA Play", price: 5, cadence: "monthly", startedOn: "2025-05-01", endedOn: "2025-07-01" });
    const ms = groupMemberships([old, extra, premium], TODAY);
    expect(ms.map((m) => m.key)).toEqual([PS, "ea play"]);
    const ps = ms[0];
    expect(ps.provider).toBe("playstation plus premium");
    expect(ps.plans.map((p) => p.id)).toEqual(["b", "a"]);
    expect(ps.active).toBe(true);
    expect(ps.activePlan?.id).toBe("b");
    expect(ps.periods.map((p) => p.start)).toEqual(["2025-01-15", "2026-01-15"]);
    expect(ps.paid).toBeCloseTo(259.99);
    expect(ps.nextRenewal).toBe("2027-01-15");
    expect(ms[1].active).toBe(false);
    expect(ms[1].nextRenewal).toBeNull();
    expect(ms[1].paid).toBe(10);
  });

  it("drops blank providers and yields nothing for no plans", () => {
    expect(groupMemberships([], TODAY)).toEqual([]);
    expect(groupMemberships([sub({ provider: "   " })], TODAY)).toEqual([]);
  });
});

describe("linking copies", () => {
  it("matches subscription copies by provider key, ignoring DLC and other acquisitions", () => {
    const g = game({
      copies: [
        subCopy(),
        subCopy({ provider: "  playstation plus PREMIUM" , platform: "PlayStation 4" }),
        subCopy({ format: "dlc" }),
        copy({ acquisition: "borrowed", provider: "PlayStation Plus Premium" }),
        copy(),
      ],
    });
    expect(subscriptionCopiesFor(g, isPS)).toHaveLength(2);
    expect(isLinkedGame(g, isPS)).toBe(true);
    expect(isLinkedGame(g, exactProvider("Game Pass"))).toBe(false);
    expect(providerKey(" Foo ")).toBe("foo");
  });

  it("sums member savings per provider and overall", () => {
    const g = game({
      copies: [
        copy({ cost: 29.99, memberSavings: 30, savingsProvider: "PlayStation Plus Premium" }),
        copy({ cost: 9.99, memberSavings: 5, savingsProvider: "EA Play" }),
        copy({ cost: 9.99, memberSavings: -2, savingsProvider: "EA Play" }),
      ],
    });
    expect(memberSavingsOf(g, isPS)).toBe(30);
    expect(memberSavingsOf(g, exactProvider("EA Play"))).toBe(5);
    expect(totalMemberSavings(g.copies)).toBe(35);
    expect(totalMemberSavings(undefined)).toBe(0);
  });
});

describe("sessionCounts", () => {
  const m = groupMemberships([sub()], TODAY)[0];

  it("counts everything on a subscription-only game, backfill included", () => {
    const g = game({ copies: [subCopy()] });
    expect(sessionCounts(g, m, session())).toBe(true);
    expect(sessionCounts(g, m, session({ platform: null }))).toBe(true);
    expect(sessionCounts(g, m, session({ live: false, createdAt: 0 }))).toBe(true);
    // Before the plan even started: still counted — the game had no other way to be played.
    expect(sessionCounts(g, m, session({ createdAt: at("2025-06-01") }))).toBe(true);
  });

  it("ignores sessions on a platform the membership's copy doesn't cover", () => {
    const g = game({ copies: [subCopy()] });
    expect(sessionCounts(g, m, session({ platform: "PC" }))).toBe(false);
  });

  it("never counts on a game without a matching subscription copy", () => {
    expect(sessionCounts(game({ copies: [copy()] }), m, session())).toBe(false);
    expect(sessionCounts(game({ copies: [subCopy({ provider: "EA Play" })] }), m, session())).toBe(false);
  });

  it("splits a mixed-ownership game by the membership window and the copy's lapse", () => {
    const g = game({
      copies: [subCopy({ lapsedAt: "2026-05-01T00:00:00Z" }), copy({ cost: 20 })],
    });
    expect(sessionCounts(g, m, session({ createdAt: at("2026-03-01") }))).toBe(true);
    expect(sessionCounts(g, m, session({ createdAt: at("2025-12-01") }))).toBe(false); // before the plan
    expect(sessionCounts(g, m, session({ createdAt: at("2026-06-01") }))).toBe(false); // after the lapse
    expect(sessionCounts(g, m, session({ live: false, createdAt: 0 }))).toBe(false); // dateless lump stays with the purchase
  });

  it("only treats an owned copy on the SAME platform as competing", () => {
    const g = game({ copies: [subCopy(), copy({ platform: "PC", cost: 20 })] });
    expect(sessionCounts(g, m, session({ createdAt: at("2025-12-01") }))).toBe(true);
    // An unattributed session can't be pinned to either platform: the owned copy competes.
    expect(sessionCounts(g, m, session({ platform: null, createdAt: at("2025-12-01") }))).toBe(false);
    expect(sessionCounts(g, m, session({ platform: null, createdAt: at("2026-03-01") }))).toBe(true);
  });
});

describe("membershipVerdict", () => {
  it("is null without a target", () => {
    expect(membershipVerdict(100, 10, 0, null)).toBeNull();
    expect(membershipVerdict(100, 10, 0, 0)).toBeNull();
  });

  it("judges hours × target plus savings against what was paid", () => {
    const v = membershipVerdict(159.99, 40, 0, 2)!;
    expect(v.met).toBe(false);
    expect(v.valuePlayed).toBe(80);
    expect(v.valueDelivered).toBe(80);
    expect(v.remainingHours).toBeCloseTo(39.995);
    expect(v.costPerHour).toBeCloseTo(3.99975);

    const withSavings = membershipVerdict(159.99, 40, 80, 2)!;
    expect(withSavings.met).toBe(true);
    expect(withSavings.valueDelivered).toBe(160);
    expect(withSavings.remainingHours).toBe(0);
    expect(withSavings.costPerHour).toBeCloseTo(1.99975);
  });

  it("never goes negative when savings exceed the price, and never 'meets' a free membership", () => {
    const v = membershipVerdict(50, 0, 60, 2)!;
    expect(v.met).toBe(true);
    expect(v.remainingHours).toBe(0);
    expect(v.costPerHour).toBeNull();
    expect(membershipVerdict(0, 10, 0, 2)!.met).toBe(false);
  });
});

describe("membershipReport", () => {
  const monthly = sub({ id: "m", cadence: "monthly", price: 12, startedOn: "2026-01-15" });
  const m = groupMemberships([monthly], "2026-03-20")[0];

  const nfs = game({ id: "nfs", title: "Need for Speed Unbound", copies: [subCopy()], addedAt: at("2026-01-20") });
  const core = game({ id: "core", title: "Core Keeper", copies: [subCopy()], addedAt: at("2026-01-22") });
  const mhr = game({ id: "mhr", title: "Monster Hunter Rise", copies: [subCopy()], addedAt: at("2026-03-16") });
  const bought = game({
    id: "bought",
    title: "Nine Sols",
    copies: [copy({ cost: 20, memberSavings: 10, savingsProvider: "PlayStation Plus Premium" })],
    addedAt: at("2026-02-20"),
  });
  const other = game({ id: "other", title: "Elsewhere", copies: [copy({ cost: 30 })], addedAt: at("2026-02-01") });
  const wish = game({ id: "wish", title: "Wanted", status: "wishlist", copies: [subCopy()], addedAt: at("2026-02-01") });

  const sessions: MembershipSession[] = [
    session({ gameId: "nfs", hours: 3, createdAt: at("2026-01-25") }),
    session({ gameId: "nfs", hours: 2, createdAt: at("2026-02-20") }),
    session({ gameId: "nfs", hours: 1.5, live: false, createdAt: 0 }),
    session({ gameId: "mhr", hours: 4, createdAt: at("2026-03-18") }),
    session({ gameId: "other", hours: 10, createdAt: at("2026-02-05") }),
    session({ gameId: "wish", hours: 10, createdAt: at("2026-02-05") }),
  ];

  it("rolls up hours, savings, periods and never-played games", () => {
    const r = membershipReport(m, [nfs, core, mhr, bought, other, wish], sessions, 2, "2026-03-20");
    expect(r.hours).toBeCloseTo(10.5);
    expect(r.untrackedHours).toBeCloseTo(1.5);
    expect(r.savings).toBe(10);
    expect(r.neverPlayed).toBe(1);
    expect(r.games.map((g) => g.game.id)).toEqual(["nfs", "mhr", "bought", "core"]);
    expect(r.games[0].lastPlayed).toBe("2026-02-20");
    expect(r.games[3].lastPlayed).toBeNull();
    expect(r.games[2].hours).toBe(0); // a discounted purchase lends savings, never hours

    expect(r.periods.map((p) => p.period.start)).toEqual(["2026-03-15", "2026-02-15", "2026-01-15"]);
    const [mar, feb, jan] = r.periods;
    expect(jan.hours).toBe(3);
    expect(jan.added.map((g) => g.id)).toEqual(["nfs", "core"]);
    expect(jan.met).toBe(false); // 3h × $2 = $6 < $12
    expect(feb.hours).toBe(2);
    expect(feb.added.map((g) => g.id)).toEqual(["bought"]);
    expect(feb.savings).toBe(10);
    expect(feb.met).toBe(true); // 2h × $2 + $10 saved = $14 ≥ $12
    expect(mar.hours).toBe(4);
    expect(mar.added.map((g) => g.id)).toEqual(["mhr"]);
    expect(mar.period.current).toBe(true);

    expect(r.verdict).not.toBeNull();
    expect(r.verdict!.paid).toBe(36);
    expect(r.verdict!.valueDelivered).toBe(31); // 10.5h × $2 + $10
    expect(r.verdict!.met).toBe(false);
  });

  it("applies downward corrections to the bucket they were made in", () => {
    const corrected = [
      session({ gameId: "nfs", hours: 5, createdAt: at("2026-01-25") }),
      session({ gameId: "nfs", hours: -2, createdAt: at("2026-02-20") }),
    ];
    const r = membershipReport(m, [nfs], corrected, 2, "2026-03-20");
    expect(r.hours).toBe(3);
    expect(r.games[0].hours).toBe(3);
    expect(r.periods.find((p) => p.period.index === 0)!.hours).toBe(5);
    expect(r.periods.find((p) => p.period.index === 1)!.hours).toBe(0); // never shown negative
  });

  it("reports without a verdict when no target is set", () => {
    const r = membershipReport(m, [nfs], sessions, null, "2026-03-20");
    expect(r.verdict).toBeNull();
    expect(r.periods[0].valuePlayed).toBeNull();
    expect(r.periods[0].met).toBeNull();
    expect(r.hours).toBeCloseTo(6.5);
  });

  it("rolls memberships into the ledger's financials", () => {
    const r = membershipReport(m, [nfs, bought], sessions, 2, "2026-03-20");
    const free = membershipReport(
      groupMemberships([sub({ id: "f", provider: "Free Tier", price: 0, startedOn: "2026-01-01" })], "2026-03-20")[0],
      [],
      [],
      2,
      "2026-03-20",
    );
    const f = membershipFinancials([r, free]);
    expect(f.paid).toBe(36);
    expect(f.hours).toBeCloseTo(6.5);
    expect(f.savings).toBe(10);
    expect(f.costPerHour).toBeCloseTo(26 / 6.5);
    expect(f.judged).toBe(1);
    expect(f.wellSpent).toBe(0);
    expect(membershipFinancials([]).costPerHour).toBeNull();
  });
});

describe("tier ladders", () => {
  const tiers = {
    "playstation plus essential": { group: "PlayStation Plus", rank: 1 },
    "playstation plus extra": { group: "PlayStation Plus", rank: 2 },
    "playstation plus premium": { group: "PlayStation Plus", rank: 3 },
    "game pass ultimate": { group: "Game Pass", rank: 2 },
    "xbox game pass": { group: "Game Pass", rank: 1 },
  };

  it("covers the same rung or lower on the same ladder, never across ladders", () => {
    expect(providerCovers("PlayStation Plus Premium", "playstation plus essential ", tiers)).toBe(true);
    expect(providerCovers("PlayStation Plus Premium", "PlayStation Plus Premium", tiers)).toBe(true);
    expect(providerCovers("PlayStation Plus Essential", "PlayStation Plus Premium", tiers)).toBe(false);
    expect(providerCovers("PlayStation Plus Premium", "Xbox Game Pass", tiers)).toBe(false);
    expect(providerCovers("Humble Choice", "humble choice", tiers)).toBe(true);
    expect(providerCovers("Humble Choice", "Humble Bundle", tiers)).toBe(false);
    expect(providerCovers("PlayStation Plus Premium", "", tiers)).toBe(false);
    // Without a ladder map everything is exact-match.
    expect(providerCovers("PlayStation Plus Premium", "PlayStation Plus Essential", {})).toBe(false);
  });

  it("keys memberships by ladder, and standalone services by name", () => {
    expect(membershipKeyOf("PlayStation Plus Extra", tiers)).toBe("ladder:playstation plus");
    expect(membershipKeyOf("Humble Choice", tiers)).toBe("humble choice");
  });

  it("merges an Extra → Premium upgrade into one membership faced by the running plan", () => {
    const extra = sub({ id: "a", provider: "PlayStation Plus Extra", price: 100, startedOn: "2025-01-15", endedOn: "2026-01-15" });
    const premium = sub({ id: "b", provider: "PlayStation Plus Premium", price: 159.99, startedOn: "2026-01-15" });
    const ms = groupMemberships([extra, premium], TODAY, tiers);
    expect(ms).toHaveLength(1);
    expect(ms[0].key).toBe("ladder:playstation plus");
    expect(ms[0].provider).toBe("PlayStation Plus Premium");
    expect(ms[0].plans.map((p) => p.id)).toEqual(["b", "a"]);
    expect(ms[0].paid).toBeCloseTo(259.99);
    expect(ms[0].covers("PlayStation Plus Essential")).toBe(true);
    expect(ms[0].covers("Xbox Game Pass")).toBe(false);
    // Without the map the same two plans stay two memberships.
    expect(groupMemberships([extra, premium], TODAY)).toHaveLength(2);
  });

  it("links lower-tier copies to the membership and reports the rung they came via", () => {
    const m = groupMemberships([sub({ cadence: "monthly", price: 12, startedOn: "2026-01-15" })], "2026-03-20", tiers)[0];
    const essential = game({
      id: "ess",
      title: "Need for Speed Unbound",
      copies: [subCopy({ provider: "PlayStation Plus Essential" })],
    });
    const own = game({ id: "own", title: "Tekken", copies: [subCopy()] });
    const discounted = game({
      id: "buy",
      title: "Nine Sols",
      copies: [copy({ cost: 20, memberSavings: 10, savingsProvider: "PlayStation Plus Extra" })],
      addedAt: at("2026-02-20"),
    });
    const r = membershipReport(
      m,
      [essential, own, discounted],
      [session({ gameId: "ess", hours: 4, createdAt: at("2026-02-01") })],
      2,
      "2026-03-20",
    );
    expect(r.games.map((g) => [g.game.id, g.via])).toEqual([
      ["ess", "PlayStation Plus Essential"],
      ["buy", null],
      ["own", null],
    ]);
    expect(r.hours).toBe(4);
    expect(r.savings).toBe(10);
  });

  it("treats a lower rung as already tracked for the set-it-up prompt", () => {
    const subs = [sub({ provider: "PlayStation Plus Premium" })];
    expect(providerTracked("PlayStation Plus Essential", subs, tiers)).toBe(true);
    expect(providerTracked("Xbox Game Pass", subs, tiers)).toBe(false);
    expect(providerTracked("PlayStation Plus Essential", subs, {})).toBe(false);
  });
});
