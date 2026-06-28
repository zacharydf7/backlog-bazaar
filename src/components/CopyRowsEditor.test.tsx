import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CopyRowsEditor, emptyCopyRow } from "./CopyRowsEditor";

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
});
