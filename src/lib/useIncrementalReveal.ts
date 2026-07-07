import { useCallback, useEffect, useState } from "react";

/** Progressive rendering for a long board (issue 86dce059): instead of mounting
 *  hundreds of cards (and their layout animations) at once — which janks the tab
 *  switch — reveal a page at a time and grow on demand (scroll or a button).
 *
 *  - `count` is how many items to render right now (never more than `total`).
 *  - `hasMore` is true while items remain hidden.
 *  - `showMore` reveals the next page.
 *  Reveal resets to one page whenever `resetKey` changes (e.g. you switch boards),
 *  so a fresh board never inherits a huge reveal from the previous one. Shrinking
 *  `total` (filtering/searching) just clamps `count` — no reset needed. */
export function useIncrementalReveal(resetKey: string, total: number, pageSize = 48) {
  const [count, setCount] = useState(pageSize);
  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);
  const showMore = useCallback(() => setCount((c) => c + pageSize), [pageSize]);
  const shown = Math.min(count, total);
  return { count: shown, hasMore: shown < total, showMore };
}
