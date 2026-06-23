import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivacyPage } from "./PrivacyPage";

describe("PrivacyPage", () => {
  it("renders the policy heading and the key disclosure sections", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: /Privacy Policy/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Information we collect/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /California privacy rights/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Your privacy rights/i })).toBeTruthy();
    // We commit to not selling data — surface it so the claim can't silently drop.
    expect(screen.getByText(/do not sell or share your/i)).toBeTruthy();
  });
});
