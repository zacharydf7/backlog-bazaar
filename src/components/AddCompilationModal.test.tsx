import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { AddCompilationModal } from "./AddCompilationModal";
import { useStore } from "../store";
import { totalCost } from "../lib/copies";

beforeEach(() => {
  act(() =>
    useStore.setState({ cloud: false, viewing: null, games: [], compilations: [] }),
  );
});

function fill(title: string, total: string, names: string[]) {
  fireEvent.change(screen.getByPlaceholderText(/Super Mario 3D All-Stars/i), {
    target: { value: title },
  });
  fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: total } });
  const nameInputs = screen.getAllByLabelText("Game name");
  names.forEach((n, i) => fireEvent.change(nameInputs[i], { target: { value: n } }));
}

describe("AddCompilationModal", () => {
  it("splits the total evenly across the child games by default", async () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fill("Bundle", "40", ["Game A", "Game B"]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Add 2 games to/i }));
    });

    const { games, compilations } = useStore.getState();
    expect(games).toHaveLength(2);
    expect(games.every((g) => totalCost(g.copies) === 20)).toBe(true);
    expect(games.every((g) => g.compilationId === compilations[0].id)).toBe(true);
    expect(compilations[0].totalCost).toBe(40);
    expect(compilations[0].title).toBe("Bundle");
  });

  it("blocks submit in custom mode until the breakdown sums to the total", () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fill("Bundle", "40", ["Game A", "Game B"]);
    fireEvent.click(screen.getByLabelText(/Edit breakdown/i));

    const costs = screen.getAllByLabelText("Assigned cost");
    fireEvent.change(costs[0], { target: { value: "10" } });
    fireEvent.change(costs[1], { target: { value: "10" } }); // sums to 20, not 40

    const submit = screen.getByRole("button", { name: /Add 2 games to/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(costs[0], { target: { value: "30" } }); // now 30 + 10 = 40
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("distributes by length when 'Balance by length' is used", () => {
    render(<AddCompilationModal onClose={() => {}} />);
    fill("Bundle", "40", ["Short", "Long"]);
    // lengths 10h and 30h → 25% / 75%
    const lengths = screen.getAllByLabelText("Length");
    fireEvent.change(lengths[0], { target: { value: "10h" } });
    fireEvent.change(lengths[1], { target: { value: "30h" } });
    fireEvent.click(screen.getByLabelText(/Edit breakdown/i));
    fireEvent.click(screen.getByRole("button", { name: /Balance by length/i }));

    const costs = screen.getAllByLabelText("Assigned cost") as HTMLInputElement[];
    expect(costs[0].value).toBe("10");
    expect(costs[1].value).toBe("30");
  });
});
