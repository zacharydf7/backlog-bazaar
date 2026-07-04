import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CopyRowsEditor, emptyCopyRow, rowsToCopies } from "./CopyRowsEditor";

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
});
