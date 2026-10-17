import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import type { GameMeta } from "../types";

// Two different IGDB games share a name (no RAWG id on either) — the case that
// left stale duplicate rows in the dropdown when list keys fell back to titles.
const searchGamesMock = vi.fn<(q: string) => Promise<GameMeta[]>>();
vi.mock("../lib/gamedata", async (importActual) => ({
  ...(await importActual<typeof import("../lib/gamedata")>()),
  searchGames: (q: string) => searchGamesMock(q),
}));

import { GameSearchBox } from "./GameSearchBox";

function Harness() {
  const [value, setValue] = useState("");
  return <GameSearchBox value={value} onChange={setValue} onPick={() => {}} ariaLabel="Game" />;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GameSearchBox (86fc0b4b)", () => {
  it("keeps one row per result as same-named games re-render", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const world2013 = { title: "Super Mario 3D World", igdbId: 2180, released: "2013-11-22", genres: [] };
    const world2021 = { title: "Super Mario 3D World", igdbId: 229339, released: "2021-02-12", genres: [] };
    const allStars = { title: "Super Mario 3D All-Stars", igdbId: 138225, released: "2020-09-18", genres: [] };
    searchGamesMock.mockImplementation(async (q) =>
      q.endsWith("All") ? [allStars, world2013, world2021] : [world2021, world2013],
    );
    render(<Harness />);
    const input = screen.getByLabelText("Game");

    // Type, delete and retype — the sequence that used to pile up stale rows.
    for (const q of ["Super Mario 3D All", "Super Mario 3D Al", "Super Mario 3D All"]) {
      fireEvent.change(input, { target: { value: q } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
    }

    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(errors.mock.calls.some((c) => String(c[0]).includes("same key"))).toBe(false);
  });
});
