import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LoanRequestStrip } from "./Loans";
import { useStore, type ViewingSession } from "../store";
import type { Loan } from "../lib/loans";

const request: Loan = {
  id: "l1",
  borrower: "u2",
  lender: "me",
  borrowerName: "Ben",
  lenderName: "Me",
  gameId: "g1",
  gameTitle: "Outer Wilds",
  amount: 40,
  interestPct: 10,
  status: "pending",
  repaid: 0,
  forgiven: 0,
  createdAt: 1,
  decidedAt: null,
  settledAt: null,
};

beforeEach(() => {
  act(() => useStore.setState({ cloud: true, userId: "me", coins: 100, loans: [request], viewing: null }));
});

describe("LoanRequestStrip", () => {
  it("asks you about a friend's loan request on your own Bazaar", () => {
    render(<LoanRequestStrip />);
    expect(screen.getByText("Ben")).toBeTruthy();
  });

  it("stays off a Bazaar you're visiting, like the other strips", () => {
    act(() => useStore.setState({ viewing: { userId: "u3" } as unknown as ViewingSession }));
    const { container } = render(<LoanRequestStrip />);
    expect(container.textContent).toBe("");
  });
});
