import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionPill } from "./SessionPill";
import { useStore } from "../store";
import type { Game } from "../types";

const SESSION = {
  id: "s1",
  gameId: "g1",
  gameTitle: "Monster Hunter Wilds",
  platform: null,
  format: null,
  startedAt: Date.now() - 45 * 60_000,
};

function open(status: Game["status"]) {
  const endPlaySession = vi.fn(async () => {});
  act(() =>
    useStore.setState({
      activeSession: SESSION,
      sessionStopOpen: true,
      games: [{ id: "g1", title: "Monster Hunter Wilds", status } as Game],
      endPlaySession,
    }),
  );
  render(<SessionPill />);
  return endPlaySession;
}

describe("Stop session dialog", () => {
  it("takes a note on a drop-in (a Finished game) and logs it with the time", async () => {
    const endPlaySession = open("finished");
    fireEvent.change(screen.getByLabelText("Note for this session"), { target: { value: "one quick hunt" } });
    fireEvent.click(screen.getByRole("button", { name: /^Log / }));
    await waitFor(() => expect(endPlaySession).toHaveBeenCalledWith(null, "one quick hunt"));
  });

  it("asks for no note on a game you're playing", () => {
    open("playing");
    expect(screen.queryByLabelText("Note for this session")).toBeNull();
  });
});
