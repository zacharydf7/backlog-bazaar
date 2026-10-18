import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { StackedBoardCard } from "../lib/gameStacks";
import type { SortKey } from "../lib/bazaarView";
import { useStore } from "../store";
import {
  indexForFraction,
  isHuntingScroll,
  scrubLabel,
  thumbFraction,
  trackScroll,
  type ScrollRun,
} from "../lib/fastScroll";

/** Boards shorter than this don't get a thumb — a couple of flicks already
 *  covers them (and the first reveal page is 48 cards). */
export const RAIL_MIN_CARDS = 60;

/** How long after the page stops scrolling the thumb fades back out. */
const HIDE_DELAY_MS = 1500;

/** The thumb's height in px (h-14) — its centre travels the track minus this. */
const THUMB_PX = 56;

/** The mobile fast-scroll thumb (issues d2444c65, 3e5eee26): a grab pill on the
 *  right edge of a long board. It offers itself only once you've scrolled a
 *  couple of screens without pausing — an ordinary flick never summons it — and
 *  fades out after a moment of stillness. Only the pill itself is touchable:
 *  the rest of the edge passes taps straight through to the cards, and a tap on
 *  the pill never jumps. Drag it to scrub the whole list; a bubble beside your
 *  finger names where you are under the active sort ("H", "Jul 2026", "~50h",
 *  "120 coins"). Desktop (md+) keeps its scrollbar instead. */
export function FastScrollRail({
  cards,
  sort,
  onJump,
}: {
  /** The board's full ordered card list (not just the revealed page). */
  cards: StackedBoardCard[];
  sort: SortKey;
  /** Land on the card at this index — the grid reveals + scrolls to it. */
  onJump: (index: number) => void;
}) {
  const economy = useStore((s) => s.economy);
  const replayBonusPct = useStore((s) => s.replayBonusPct);
  const games = useStore((s) => s.games);

  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState<string | null>(null); // non-null while dragging
  // Thumb position 0..1 — follows the page scroll at rest, the finger while dragging.
  const [progress, setProgress] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const dragging = useRef(false);
  const lastJump = useRef<number | null>(null);
  const run = useRef<ScrollRun | null>(null);
  const shownRef = useRef(false); // mirrors `visible` for the scroll listener

  const armHide = () => {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (dragging.current) return;
      shownRef.current = false;
      setVisible(false);
    }, HIDE_DELAY_MS);
  };

  // Reveal on a sustained scroll; while shown, keep it alive and in step with
  // the page. A jump made by dragging scrolls the page too — that just keeps it up.
  useEffect(() => {
    const onScroll = () => {
      run.current = trackScroll(run.current, window.scrollY, Date.now());
      if (dragging.current) return;
      const doc = document.documentElement;
      const range = doc.scrollHeight - window.innerHeight;
      setProgress(range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0);
      if (shownRef.current || isHuntingScroll(run.current, window.innerHeight)) {
        shownRef.current = true;
        setVisible(true);
        armHide();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (cards.length < RAIL_MIN_CARDS) return null;

  const labelAt = (index: number) =>
    scrubLabel(cards[index], sort, economy, { allGames: games, replayBonusPct });

  function scrubTo(clientY: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fraction = thumbFraction(clientY, rect, THUMB_PX);
    const index = indexForFraction(fraction, cards.length);
    setProgress(fraction);
    setLabel(labelAt(index));
    if (lastJump.current !== index) {
      lastJump.current = index;
      onJump(index);
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = true;
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer capture unavailable (jsdom / odd browsers) — moves still track */
    }
    // Grabbing the thumb only names where you are; nothing moves until you drag.
    setLabel(labelAt(indexForFraction(progress, cards.length)));
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragging.current) scrubTo(e.clientY);
  }

  function endDrag() {
    dragging.current = false;
    lastJump.current = null;
    setLabel(null);
    armHide();
  }

  const grabbed = label != null;
  const shown = visible || grabbed;

  return (
    // The track is layout only — it never takes a tap, so cards under the
    // right edge stay fully clickable. Spans from just under the app chrome to
    // just above the Jump-to-top button (9rem + the phone's bar, + its 44px).
    <div
      ref={trackRef}
      data-testid="rail-track"
      className="pointer-events-none fixed right-0 z-40 w-11 md:hidden"
      style={{ top: "calc(var(--chrome-h) + 16px)", bottom: "calc(12.5rem + var(--safe-bottom))" }}
    >
      <div
        role="slider"
        data-testid="rail-thumb"
        aria-label="Fast scroll"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-hidden={!shown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={
          "absolute right-0 flex h-14 w-11 items-center justify-end transition-opacity duration-300 " +
          (shown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")
        }
        // touch-action: none keeps a drag on the thumb from also scrolling the
        // page natively.
        style={{ top: `calc(${progress} * (100% - ${THUMB_PX}px))`, touchAction: "none" }}
      >
        {grabbed && (
          <div className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-2xl border border-line bg-surface/95 px-4 py-2 font-display text-2xl text-ink shadow-2xl backdrop-blur">
            {label}
          </div>
        )}
        <span
          className={
            "flex h-12 w-7 items-center justify-center rounded-l-full border border-r-0 shadow-lg backdrop-blur transition-colors " +
            (grabbed ? "border-brand bg-brand text-brand-fg" : "border-line bg-panel/95 text-accent")
          }
        >
          <ChevronsUpDown size={16} />
        </span>
      </div>
    </div>
  );
}
