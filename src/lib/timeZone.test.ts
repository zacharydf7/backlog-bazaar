import { describe, it, expect, vi, afterEach } from "vitest";
import { browserTimeZone } from "./timeZone";

afterEach(() => vi.restoreAllMocks());

describe("browserTimeZone", () => {
  it("reads the browser's IANA timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/New_York" }),
    } as unknown as Intl.DateTimeFormat);
    expect(browserTimeZone()).toBe("America/New_York");
  });

  it("is null when the browser can't say", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("unsupported");
    });
    expect(browserTimeZone()).toBeNull();
  });
});
