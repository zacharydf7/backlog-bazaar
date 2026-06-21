import { useEffect } from "react";

// Freeze the page behind an overlay so the background doesn't scroll through.
//
// Two techniques, picked by device:
//  - touch (hover: none): `position: fixed` on the body — the only thing that
//    reliably stops iOS background scrolling; the scroll position is captured and
//    restored on unlock.
//  - desktop: `overflow: hidden` plus padding-right equal to the scrollbar width,
//    so hiding the scrollbar doesn't shift the layout.
//
// Pass { mobileOnly: true } for non-blocking overlays (the alerts dropdown), which
// should keep the page scrollable on large screens.
//
// A module-level counter lets several overlays stack without fighting over the
// body styles; the first lock saves the styles and the last unlock restores them.
let lockCount = 0;
let savedScrollY = 0;
let usedFixed = false;
let saved: {
  overflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
} | null = null;

function isTouch(): boolean {
  try {
    return window.matchMedia("(hover: none)").matches;
  } catch {
    return false;
  }
}

export function useScrollLock(active: boolean, opts: { mobileOnly?: boolean } = {}): void {
  const { mobileOnly = false } = opts;

  useEffect(() => {
    if (!active) return;
    const touch = isTouch();
    if (mobileOnly && !touch) return;

    lockCount += 1;
    if (lockCount === 1) {
      const body = document.body;
      saved = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
      };
      usedFixed = touch;

      if (touch) {
        savedScrollY = window.scrollY;
        body.style.overflow = "hidden";
        body.style.position = "fixed";
        body.style.top = `-${savedScrollY}px`;
        body.style.width = "100%";
      } else {
        const scrollbar = window.innerWidth - document.documentElement.clientWidth;
        body.style.overflow = "hidden";
        if (scrollbar > 0) {
          const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
          body.style.paddingRight = `${current + scrollbar}px`;
        }
      }
    }

    return () => {
      lockCount -= 1;
      if (lockCount === 0 && saved) {
        const body = document.body;
        body.style.overflow = saved.overflow;
        body.style.position = saved.position;
        body.style.top = saved.top;
        body.style.width = saved.width;
        body.style.paddingRight = saved.paddingRight;
        saved = null;
        if (usedFixed) window.scrollTo(0, savedScrollY);
      }
    };
  }, [active, mobileOnly]);
}
