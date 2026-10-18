import { describe, it, expect, beforeEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useCoverOf } from "./useCoverOf";
import { useStore } from "../store";
import { CompilationPlayPicker } from "../components/CompilationPlayPicker";
import type { Compilation, Game } from "../types";

const BUNDLE = { id: "comp", title: "Toy Story: Retro Roundup!", totalCost: 30, parentImage: "bundle.jpg" } as Compilation;
const bare = (id: string, title: string) => ({ id, title, status: "backlog", compilationId: "comp" }) as Game;
const own = { ...bare("own", "Toy Story 2"), image: "own.jpg" } as Game;

beforeEach(() => {
  act(() =>
    useStore.setState({
      viewing: null,
      compilations: [BUNDLE],
      compilationGames: [],
      games: [bare("a", "Toy Story"), own],
    }),
  );
});

describe("useCoverOf", () => {
  it("shows a bundled game's own art, else its bundle's cover", () => {
    const { result } = renderHook(() => useCoverOf());
    expect(result.current(bare("a", "Toy Story"))).toBe("bundle.jpg");
    expect(result.current(own)).toBe("own.jpg");
    expect(result.current({ image: undefined, compilationId: undefined })).toBeUndefined();
  });

  it("keeps a visited library's games on their own art (its bundles aren't loaded)", () => {
    act(() => useStore.setState({ viewing: { userId: "u2" } as never }));
    const { result } = renderHook(() => useCoverOf());
    expect(result.current(bare("a", "Toy Story"))).toBeUndefined();
  });
});

describe("the bundle's Play a game list", () => {
  it("shows the bundle cover for a game with no art of its own", () => {
    const { container } = render(
      <CompilationPlayPicker compilation={BUNDLE} children={[bare("a", "Toy Story"), own]} onClose={() => {}} />,
    );
    const srcs = [...container.ownerDocument.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["bundle.jpg", "own.jpg"]);
  });
});
