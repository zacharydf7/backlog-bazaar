import { describe, it, expect } from "vitest";
import {
  activeLoansForBorrower,
  coerceLoan,
  loanOwed,
  openLoanForGame,
  pendingLoansForLender,
  validateLoanRequest,
  type Loan,
} from "./loans";

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "l1",
  borrower: "u-b",
  lender: "u-l",
  borrower_name: "Robin",
  lender_name: "Sam",
  game_id: "g1",
  game_title: "Chrono Trigger",
  amount: 40,
  interest_pct: 10,
  status: "pending",
  repaid: 0,
  forgiven: 0,
  created_at: "2026-07-23T10:00:00Z",
  decided_at: null,
  settled_at: null,
  ...over,
});

const loan = (over: Partial<Loan> = {}): Loan => ({
  ...(coerceLoan(row()) as Loan),
  ...over,
});

describe("coerceLoan", () => {
  it("maps a full RPC row", () => {
    const l = coerceLoan(row());
    expect(l).toMatchObject({
      id: "l1",
      borrowerName: "Robin",
      lenderName: "Sam",
      gameId: "g1",
      amount: 40,
      interestPct: 10,
      status: "pending",
    });
  });

  it("drops malformed rows and defends every field", () => {
    expect(coerceLoan({})).toBeNull();
    expect(coerceLoan(row({ amount: 0 }))).toBeNull();
    const l = coerceLoan(
      row({ borrower_name: " ", game_id: null, status: "bogus", interest_pct: 999 }),
    );
    expect(l).toMatchObject({
      borrowerName: "A friend",
      gameId: null,
      status: "pending",
      interestPct: 100, // clamped
    });
  });
});

describe("loanOwed", () => {
  it("adds interest rounded UP (matching the server's ceil)", () => {
    expect(loanOwed(40, 10)).toBe(44);
    expect(loanOwed(33, 10)).toBe(37); // 3.3 → 4
    expect(loanOwed(100, 0)).toBe(100);
    expect(loanOwed(1, 100)).toBe(2);
  });
});

describe("selectors", () => {
  it("openLoanForGame finds only a pending/active loan on that game", () => {
    const rows = [
      loan({ id: "a", status: "declined" }),
      loan({ id: "b", status: "settled" }),
      loan({ id: "c", status: "active" }),
      loan({ id: "d", gameId: "g2", status: "pending" }),
    ];
    expect(openLoanForGame(rows, "g1")?.id).toBe("c");
    expect(openLoanForGame(rows, "g2")?.id).toBe("d");
    expect(openLoanForGame(rows, "g3")).toBeUndefined();
  });

  it("pendingLoansForLender lists asks waiting on me, newest first", () => {
    const rows = [
      loan({ id: "old", createdAt: 1, status: "pending" }),
      loan({ id: "new", createdAt: 2, status: "pending" }),
      loan({ id: "granted", createdAt: 3, status: "active" }),
      loan({ id: "other", lender: "someone-else", status: "pending" }),
    ];
    expect(pendingLoansForLender(rows, "u-l").map((l) => l.id)).toEqual(["new", "old"]);
  });

  it("activeLoansForBorrower lists my granted loans only", () => {
    const rows = [
      loan({ id: "a", status: "active" }),
      loan({ id: "b", status: "pending" }),
      loan({ id: "c", status: "active", borrower: "someone-else" }),
    ];
    expect(activeLoansForBorrower(rows, "u-b").map((l) => l.id)).toEqual(["a"]);
  });
});

describe("validateLoanRequest", () => {
  it("insists on a whole positive amount the lender can cover", () => {
    expect(validateLoanRequest(40, { lenderCoins: 100 })).toBeNull();
    expect(validateLoanRequest(0, { lenderCoins: 100 })).toMatch(/at least 1/);
    expect(validateLoanRequest(10.5, { lenderCoins: 100 })).toMatch(/whole number/);
    expect(validateLoanRequest(NaN, { lenderCoins: 100 })).toMatch(/whole number/);
    // "The friend must have enough coins to be asked."
    expect(validateLoanRequest(101, { lenderCoins: 100 })).toMatch(/doesn't have/);
  });
});
