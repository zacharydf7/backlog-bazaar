// Friend Loans (issue 7973d721): ask a friend to front the coins for a game
// you can't afford yet. The grant transfers the coins outright and the app
// buys the game; a genuine finish repays the loan — with interest — from the
// bounty (a terminal retire settles from the salvage). All money movement is
// server-side (request_loan / respond_loan / settle_game_loans in
// supabase/schema.sql); this module holds the pure coercion, validation, math
// and presentation rules so they're unit-tested offline.

/** Server default for the admin-tunable interest knob (app_config mirror). */
export const LOAN_DEFAULT_INTEREST_PCT = 10;

export type LoanStatus = "pending" | "declined" | "cancelled" | "active" | "settled";

/** One loan, either direction, as list_my_loans returns it. */
export interface Loan {
  id: string;
  borrower: string;
  lender: string;
  borrowerName: string;
  lenderName: string;
  gameId: string | null; // null once the game row was deleted
  gameTitle: string;
  amount: number;
  interestPct: number;
  status: LoanStatus;
  repaid: number;
  forgiven: number;
  createdAt: number; // ms epoch
  decidedAt: number | null;
  settledAt: number | null;
}

const STATUSES: LoanStatus[] = ["pending", "declined", "cancelled", "active", "settled"];

/** Coerce one RPC row, dropping malformed entries. */
export function coerceLoan(row: Record<string, unknown>): Loan | null {
  if (
    typeof row.id !== "string" ||
    typeof row.borrower !== "string" ||
    typeof row.lender !== "string"
  ) {
    return null;
  }
  const amount = typeof row.amount === "number" ? Math.round(row.amount) : 0;
  if (amount <= 0) return null;
  return {
    id: row.id,
    borrower: row.borrower,
    lender: row.lender,
    borrowerName:
      typeof row.borrower_name === "string" && row.borrower_name.trim()
        ? row.borrower_name
        : "A friend",
    lenderName:
      typeof row.lender_name === "string" && row.lender_name.trim()
        ? row.lender_name
        : "A friend",
    gameId: typeof row.game_id === "string" ? row.game_id : null,
    gameTitle: typeof row.game_title === "string" ? row.game_title : "a game",
    amount,
    interestPct:
      typeof row.interest_pct === "number"
        ? Math.max(0, Math.min(100, Math.round(row.interest_pct)))
        : LOAN_DEFAULT_INTEREST_PCT,
    status: STATUSES.includes(row.status as LoanStatus)
      ? (row.status as LoanStatus)
      : "pending",
    repaid: typeof row.repaid === "number" ? Math.round(row.repaid) : 0,
    forgiven: typeof row.forgiven === "number" ? Math.round(row.forgiven) : 0,
    createdAt: typeof row.created_at === "string" ? Date.parse(row.created_at) : 0,
    decidedAt: typeof row.decided_at === "string" ? Date.parse(row.decided_at) : null,
    settledAt: typeof row.settled_at === "string" ? Date.parse(row.settled_at) : null,
  };
}

/** What a loan costs to repay: the principal plus interest, rounded UP so the
 *  house never loses a fraction (the server computes the identical ceil). */
export function loanOwed(amount: number, interestPct: number): number {
  return amount + Math.ceil((amount * interestPct) / 100);
}

/** The game's open loan (pending or active), if any — the server enforces at
 *  most one, so first-match is the match. */
export function openLoanForGame(rows: Loan[], gameId: string): Loan | undefined {
  return rows.find(
    (l) => l.gameId === gameId && (l.status === "pending" || l.status === "active"),
  );
}

/** Requests waiting on ME to grant or decline, newest first. */
export function pendingLoansForLender(rows: Loan[], userId: string): Loan[] {
  return rows
    .filter((l) => l.lender === userId && l.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Granted loans whose game should be auto-bought on the borrower's side —
 *  the app completes the purchase the loan was for. The caller still runs the
 *  normal buy pipeline (slots, prerequisites, price), which may decline. */
export function activeLoansForBorrower(rows: Loan[], userId: string): Loan[] {
  return rows.filter((l) => l.borrower === userId && l.status === "active");
}

/** Validate an ask before it leaves the modal. Mirrors the server guards that
 *  a client can check locally; null = fine. */
export function validateLoanRequest(
  amount: number,
  opts: { lenderCoins: number },
): string | null {
  if (!Number.isFinite(amount) || Math.round(amount) !== amount || amount < 1) {
    return "Ask for a whole number of coins (at least 1).";
  }
  if (amount > opts.lenderCoins) {
    return "This friend doesn't have that many coins to lend.";
  }
  return null;
}
