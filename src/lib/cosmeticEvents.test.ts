import { describe, expect, it } from "vitest";
import {
  eventPhase,
  eventWindowLabel,
  type CosmeticEvent,
} from "./cosmeticEvents";
const event: CosmeticEvent = {
  key: "halloween",
  name: "Halloween",
  item_id: "pumpkin",
  starts_at: "2026-10-01T04:00:00Z",
  ends_at: "2026-11-02T05:00:00Z",
  afterward_price: 2500,
  enabled: false,
  activated_at: null,
};
describe("Halloween event dates", () => {
  it("includes the start and excludes the end across daylight saving", () => {
    expect(eventPhase(event, Date.parse(event.starts_at) - 1)).toBe("upcoming");
    expect(eventPhase(event, Date.parse(event.starts_at))).toBe("earning");
    expect(eventPhase(event, Date.parse(event.ends_at) - 1)).toBe("earning");
    expect(eventPhase(event, Date.parse(event.ends_at))).toBe("ended");
    expect(eventWindowLabel(event)).toContain("EDT");
    expect(eventWindowLabel(event)).toContain("EST");
    expect(eventWindowLabel(event)).toContain("Nov 2");
  });
});
