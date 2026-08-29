import { describe, expect, it } from "vitest";
import { CLOUD_ROWS_PER_PAGE, fetchAllRows, type PageResult } from "./cloudPaging";

/** A fake table the pager walks, recording the ranges it asked for. */
function fakePages(total: number) {
  const calls: [number, number][] = [];
  const page = (from: number, to: number): Promise<PageResult<number>> => {
    calls.push([from, to]);
    const data = Array.from(
      { length: Math.max(0, Math.min(to + 1, total) - from) },
      (_, i) => from + i,
    );
    return Promise.resolve({ data, error: null });
  };
  return { page, calls };
}

describe("fetchAllRows", () => {
  it("returns a sub-cap set in a single round-trip", async () => {
    const { page, calls } = fakePages(3);
    expect(await fetchAllRows(page, 10)).toEqual([0, 1, 2]);
    expect(calls).toEqual([[0, 9]]);
  });

  it("walks past the page size until a short page (the 1,134-game library)", async () => {
    const { page, calls } = fakePages(1134);
    const rows = await fetchAllRows(page, 1000);
    expect(rows).toHaveLength(1134);
    expect(rows[0]).toBe(0);
    expect(rows[1133]).toBe(1133);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("needs one extra probe when the total is an exact multiple of the page", async () => {
    const { page, calls } = fakePages(20);
    expect(await fetchAllRows(page, 10)).toHaveLength(20);
    expect(calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("returns an empty list for an empty set", async () => {
    const { page } = fakePages(0);
    expect(await fetchAllRows(page, 10)).toEqual([]);
  });

  it("treats null data as an empty page rather than looping", async () => {
    expect(
      await fetchAllRows(() => Promise.resolve({ data: null, error: null }), 10),
    ).toEqual([]);
  });

  it("throws on a page error instead of returning a silent partial set", async () => {
    let n = 0;
    const page = (from: number, to: number): Promise<PageResult<number>> =>
      n++ === 0
        ? fakePages(15).page(from, to)
        : Promise.resolve({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(page, 10)).rejects.toThrow("boom");
  });

  it("defaults to the PostgREST cap as its page size", async () => {
    const { page, calls } = fakePages(1);
    await fetchAllRows(page);
    expect(calls).toEqual([[0, CLOUD_ROWS_PER_PAGE - 1]]);
  });
});
