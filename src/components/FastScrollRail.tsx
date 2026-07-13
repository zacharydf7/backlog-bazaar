import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { StackedBoardCard } from "../lib/gameStacks";
import type { SortKey } from "../lib/bazaarView";
import { useStore } from "../store";
import {
  railMode,
  letterEntries,
  entryForFraction,
  indexForFraction,
  trackFraction,
  scrubLabel,
} from "../lib/fastScroll";

/** Boards shorter than this don't get a rail — a couple of flicks already
 *  covers them (and the first reveal page is 48 cards). */
export const RAIL_MIN_CARDS = 60;

/** How long after the page stops scrolling the rail fades back out. */
const HIDE_DELAY_MS = 2000;

/** The mobile fast-scroll rail (issue d2444c65): a touch track pinned to the
 *  right edge of a long board. Under the A–Z sort it's a letter index — tap or
 *  drag to the first title with that letter; under every other sort it's a
 *  scrubber handle that drags through the whole list, captioning the position
 *  with the active sort's value ("Jul 2026", "~50h", "120 coins") in a big
 *  center overlay. It fades in while the page scrolls and back out after two
 *  seconds of stillness, so it costs no screen space at rest. Desktop (md+)
 *  keeps its scrollbar instead. */
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
  const [label, setLabel] = useState<string | null>(null); // non-null while a finger is on the rail
  // Scrubber progress 0..1 — follows the page scroll at rest, the finger while
  // dragging.
  const [progress, setProgress] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const dragging = useRef(false);
  const lastJump = useRef<number | null>(null);

  // Fade in on any page scroll; fade back out after the idle delay (never
  // mid-touch). The scrubber handle also tracks the scroll position here.
  useEffect(() => {
    const armHide = () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        if (!dragging.current) setVisible(false);
      }, HIDE_DELAY_MS);
    };
    const onScroll = () => {
      setVisible(true);
      armHide();
      if (!dragging.current) {
        const doc = document.documentElement;
        const range = doc.scrollHeight - window.innerHeight;
        setProgress(range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (cards.length < RAIL_MIN_CARDS) return null;

  const mode = railMode(sort);
  const entries = mode === "alpha" ? letterEntries(cards) : [];

  function jumpAt(clientY: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fraction = trackFraction(clientY, rect);
    let index: number;
    let caption: string;
    if (mode === "alpha") {
      const entry = entryForFraction(entries, fraction);
      if (!entry) return;
      index = entry.index;
      caption = entry.letter;
    } else {
      index = indexForFraction(fraction, cards.length);
      caption = scrubLabel(cards[index], sort, economy, { allGames: games, replayBonusPct });
      setProgress(fraction);
    }
    setLabel(caption);
    if (lastJump.current !== index) {
      lastJump.current = index;
      onJump(index);
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = true;
    setVisible(true);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer capture unavailable (jsdom / odd browsers) — moves still track */
    }
    jumpAt(e.clientY);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragging.current) jumpAt(e.clientY);
  }

  function endDrag() {
    dragging.current = false;
    lastJump.current = null;
    setLabel(null);
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
  }

  const shown = visible || label != null;

  return (
    <>
      <div
        ref={trackRef}
        aria-label={mode === "alpha" ? "Letter index" : "Fast scroll"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={
          "fixed right-0 z-40 flex w-7 flex-col rounded-l-xl border border-r-0 border-line bg-panel/90 py-2 backdrop-blur transition-opacity duration-300 md:hidden " +
          (shown ? "opacity-100" : "pointer-events-none opacity-0")
        }
        // Spans from just under the app chrome to just above the bottom tab bar
        // + FAB. touch-action: none keeps a drag on the rail from also
        // scrolling the page natively.
        style={{ top: "calc(var(--chrome-h) + 16px)", bottom: "9rem", touchAction: "none" }}
      >
        {mode === "alpha" ? (
          entries.map((e) => (
            <span
              key={e.letter}
              className="flex min-h-0 flex-1 select-none items-center justify-center text-[10px] font-semibold leading-none text-muted"
            >
              {e.letter}
            </span>
          ))
        ) : (
          <div className="relative mx-auto h-full w-full">
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded bg-line" />
            <div
              data-testid="rail-handle"
              className="absolute left-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
              style={{ top: `${progress * 100}%` }}
            />
          </div>
        )}
      </div>
      {/* The anchor overlay: where the finger currently is, writ large. */}
      {label != null && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center md:hidden">
          <div className="rounded-2xl border border-line bg-surface/95 px-6 py-4 text-center font-display text-3xl text-ink shadow-2xl backdrop-blur">
            {label}
          </div>
        </div>
      )}
    </>
  );
}
