// Paged reads for potentially-large cloud result sets.
//
// PostgREST silently caps every response — tables AND set-returning RPCs — at
// the project's max-rows (1000 by default). An unpaginated `.select()` against
// a 1,134-row library therefore returns the newest 1,000 and drops the oldest
// 134 without any error, which users experience as their oldest games silently
// vanishing (issue d2309794). Any read that can grow past the cap must page.
//
// Pure module: the page callback owns the query; this loop only walks ranges.

/** PostgREST's default max-rows response cap, used as the page size so a
 *  sub-cap result set still completes in a single round-trip. */
export const CLOUD_ROWS_PER_PAGE = 1000;

/** The slice of a PostgREST response the pager needs. */
export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Fetch every row of a query by walking `.range()` windows until a short page
 * signals the end. The callback receives inclusive `from`/`to` row offsets and
 * must apply them (plus a DETERMINISTIC order — include a unique tiebreak
 * column, or pages can skip/duplicate rows that tie on the sort key).
 *
 * Throws on the first page error rather than returning a partial set — a
 * silent partial result is exactly the truncation bug this module exists to
 * fix. Callers decide whether an empty fallback is acceptable.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = CLOUD_ROWS_PER_PAGE,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
