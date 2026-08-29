import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { RecsSection } from "./RecsSection";
import { useStore } from "../../store";
import type { GameRecommendation } from "../../lib/recommendations";

function rec(over: Partial<GameRecommendation> = {}): GameRecommendation {
  return {
    id: "r1",
    sender: "alice",
    receiver: "me",
    senderName: "Alice",
    senderAvatar: null,
    receiverName: null,
    gameTitle: "Octopath Traveler",
    gameImage: null,
    rawgId: 46667,
    igdbId: null,
    catalogId: null,
    hours: 60,
    pitch: "Trust me on this one.",
    status: "pending",
    importedGameId: null,
    bountyPaid: null,
    createdAt: 1,
    respondedAt: null,
    activatedAt: null,
    ...over,
  };
}

beforeEach(() => {
  act(() =>
    useStore.setState({
      userId: "me",
      recommendations: [],
      pendingRecCount: 0,
    }),
  );
});

describe("RecsSection (issue c48e8f6d)", () => {
  it("shows an incoming card with the sender, pitch and actions", () => {
    act(() => useStore.setState({ recommendations: [rec()] }));
    render(<RecsSection />);
    expect(screen.getByText("Octopath Traveler")).toBeTruthy();
    expect(screen.getByText(/Alice/)).toBeTruthy();
    expect(screen.getByText(/Trust me on this one\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add to library/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Decline/i })).toBeTruthy();
  });

  it("declining routes through the store action", () => {
    const declineSpy = vi.fn(async () => {});
    act(() =>
      useStore.setState({ recommendations: [rec()], declineRecommendation: declineSpy }),
    );
    render(<RecsSection />);
    fireEvent.click(screen.getByRole("button", { name: /Decline/i }));
    expect(declineSpy).toHaveBeenCalledWith("r1");
  });

  it("keeps resolved and sent cards out of the inbox, listing sent status instead", () => {
    act(() =>
      useStore.setState({
        recommendations: [
          rec({ id: "done", status: "activated", bountyPaid: 8 }),
          rec({ id: "mine", sender: "me", receiver: "bob", receiverName: "Bob" }),
        ],
      }),
    );
    render(<RecsSection />);
    // Nothing pending → the inbox shows its empty state.
    expect(screen.getByText(/No recommendations waiting/i)).toBeTruthy();
    // My sent card lists with its status label (exact — the inbox empty state
    // also contains the word "waiting").
    expect(screen.getByText(/to Bob/i)).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
  });
});
