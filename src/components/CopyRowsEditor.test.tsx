import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  CopyRowsEditor,
  SHOW_ALL_PLATFORMS,
  emptyCopyRow,
  rowsToCopies,
} from "./CopyRowsEditor";

describe("CopyRowsEditor showCost", () => {
  const rows = [emptyCopyRow("Nintendo Switch 2")];

  it("shows the cost field by default (owned copies)", () => {
    render(<CopyRowsEditor rows={rows} onChange={() => {}} platformOptions={[]} />);
    expect(screen.queryByLabelText("Cost")).not.toBeNull();
  });

  it("hides the cost field for wishlist versions you don't own yet", () => {
    render(
      <CopyRowsEditor
        rows={rows}
        onChange={() => {}}
        platformOptions={[]}
        showCost={false}
        addLabel="Add a version"
      />,
    );
    expect(screen.queryByLabelText("Cost")).toBeNull();
    expect(screen.queryByLabelText("Platform")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Add a version/i })).not.toBeNull();
  });

  it("offers the three-way Physical / Digital / DLC format toggle", () => {
    render(<CopyRowsEditor rows={rows} onChange={() => {}} platformOptions={[]} />);
    expect(screen.queryByRole("button", { name: "Physical" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Digital" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "DLC" })).not.toBeNull();
  });
});

describe("CopyRowsEditor missing-platform hatch (9aacac99)", () => {
  it("ends the platform dropdown with the hatch; picking it widens without selecting", () => {
    const onChange = vi.fn();
    const onShowAll = vi.fn();
    render(
      <CopyRowsEditor
        rows={[emptyCopyRow()]}
        onChange={onChange}
        platformOptions={["PC"]}
        onShowAllPlatforms={onShowAll}
      />,
    );
    const platformOpts = within(screen.getByLabelText("Platform")).getAllByRole("option");
    expect(platformOpts[platformOpts.length - 1].textContent).toMatch(/Missing platform\?/i);

    fireEvent.change(screen.getByLabelText("Platform"), {
      target: { value: SHOW_ALL_PLATFORMS },
    });
    expect(onShowAll).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled(); // the hatch is never a platform pick
  });

  it("offers no hatch option when the caller doesn't provide one", () => {
    render(
      <CopyRowsEditor rows={[emptyCopyRow()]} onChange={() => {}} platformOptions={["PC"]} />,
    );
    expect(screen.queryByRole("option", { name: /Missing platform\?/i })).toBeNull();
  });
});

describe("CopyRowsEditor acquisition", () => {
  it("offers an acquisition picker and reveals the provider field only for a modifier", () => {
    const owned = [emptyCopyRow("PC")];
    const { rerender } = render(
      <CopyRowsEditor rows={owned} onChange={() => {}} platformOptions={["PC"]} />,
    );
    expect(screen.getByLabelText("Acquisition")).toBeTruthy();
    // Owned copy: no provider field.
    expect(screen.queryByLabelText("Provider")).toBeNull();

    // A subscription copy reveals the provider input.
    const sub = [{ ...emptyCopyRow("PC"), acquisition: "subscription" as const }];
    rerender(<CopyRowsEditor rows={sub} onChange={() => {}} platformOptions={["PC"]} />);
    expect(screen.getByLabelText("Provider")).toBeTruthy();
  });
});

describe("rowsToCopies acquisition round-trip", () => {
  const row = (over: Record<string, unknown> = {}) => ({ ...emptyCopyRow("PC"), ...over });

  it("keeps a subscription + provider, and stays quiet for an owned copy", () => {
    const copies = rowsToCopies([
      row({ acquisition: "subscription", provider: " Game Pass " }),
      row({ platform: "PS5", acquisition: "owned", provider: "ignored" }),
    ]);
    expect(copies[0]).toMatchObject({ platform: "PC", acquisition: "subscription", provider: "Game Pass" });
    // Owned: acquisition/provider stay implicit (undefined) — no noise stored.
    expect(copies[1].acquisition).toBeUndefined();
    expect(copies[1].provider).toBeUndefined();
  });

  it("drops a provider on a borrowed copy when none was typed", () => {
    const [c] = rowsToCopies([row({ acquisition: "borrowed", provider: "   " })]);
    expect(c.acquisition).toBe("borrowed");
    expect(c.provider).toBeUndefined();
  });

  it("drops any cost on a Player 2 copy — someone else's money, not your spend (3eb956ff)", () => {
    const [c] = rowsToCopies([
      row({ acquisition: "player2", provider: "Sam's copy", cost: "59.99" }),
    ]);
    expect(c.acquisition).toBe("player2");
    expect(c.provider).toBe("Sam's copy");
    expect(c.cost).toBeUndefined();
  });
});

describe("CopyRowsEditor Player 2 (3eb956ff)", () => {
  it("hides the cost field for a Player 2 row and asks whose copy it is", () => {
    const p2 = [{ ...emptyCopyRow("PC"), acquisition: "player2" as const }];
    render(<CopyRowsEditor rows={p2} onChange={() => {}} platformOptions={["PC"]} />);
    expect(screen.queryByLabelText("Cost")).toBeNull();
    expect((screen.getByLabelText("Provider") as HTMLInputElement).placeholder).toMatch(
      /Whose copy\?/,
    );
  });
});
