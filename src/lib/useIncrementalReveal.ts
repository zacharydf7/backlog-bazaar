import { useCallback, useEffect, useRef, useState } from "react";

/** Progressive rendering for a long board (issue 86dce059): instead of mounting
 *  hundreds of cards (and their layout animations) at once — which janks the tab
 *  switch — reveal a page at a time and grow on demand (scroll or a button).
 *
 *  - `count` is how many items to render right now (never more than `total`).
 *  - `hasMore` is true while items remain hidden.
 *  - `showMore` reveals the next page.
 *  Reveal resets to one page whenever `resetKey` changes (e.g. you switch boards),
 *  so a fresh board never inherits a huge reveal from the previous one. Shrinking
 *  `total` (filtering/searching) just clamps `count` — no reset needed.
 *
 *  `seed` is a one-time floor for the initial reveal, honoured only at mount:
 *  when you return from a game's page the board remounts, and it must already be
 *  showing enough cards to include the one you came back to (otherwise the
 *  scroll-restore lands on nothing and jumps to the top — issue 86dce059
 *  follow-up). A later `resetKey` change still drops back to a single page. */
export function useIncrementalReveal(
  resetKey: string,
  total: number,
  pageSize = 48,
  seed = 0,
) {
  const [count, setCount] = useState(() => Math.max(pageSize, seed));
  // Reset only when resetKey genuinely changes value — never on mount (which
  // would clobber `seed`) and never on a Strict-Mode effect replay.
  const seededKey = useRef(resetKey);
  useEffect(() => {
    if (seededKey.current === resetKey) return;
    seededKey.current = resetKey;
    setCount(pageSize);
  }, [resetKey, pageSize]);
  const showMore = useCallback(() => setCount((c) => c + pageSize), [pageSize]);
  // Reveal at least `n` items right now — a targeted deep jump (the fast-scroll
  // rail) needs its landing card mounted before it can scroll to it. Only ever
  // grows; scrolling back up never unmounts what's revealed.
  const revealTo = useCallback((n: number) => setCount((c) => (n > c ? n : c)), []);
  const shown = Math.min(count, total);
  return { count: shown, hasMore: shown < total, showMore, revealTo };
}
