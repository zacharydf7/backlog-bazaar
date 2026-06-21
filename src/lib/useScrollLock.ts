import { useEffect } from "react";

// While an overlay is open we freeze the page behind it so the background doesn't
// scroll through on touch. Only applied on touch-primary devices (matching the
// app's hover convention) — on desktop, locking would hide the scrollbar and
// shift the layout, which isn't worth it.
//
// A module-level counter lets several overlays stack without fighting over the
// body styles; the scroll position is captured on first lock and restored on the
// last unlock (the position:fixed trick is what makes this reliable on iOS).
let lockCount = 0;
let savedScrollY = 0;
let saved: { overflow: string; position: string; top: string; width: string } | null = null;

function isTouch(): boolean {
  try {
    return window.matchMedia("(hover: none)").matches;
  } catch {
    return false;
  }
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || !isTouch()) return;

    lockCount += 1;
    if (lockCount === 1) {
      const body = document.body;
      savedScrollY = window.scrollY;
      saved = {
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
      };
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.width = "100%";
    }

    return () => {
      lockCount -= 1;
      if (lockCount === 0 && saved) {
        const body = document.body;
        body.style.overflow = saved.overflow;
        body.style.position = saved.position;
        body.style.top = saved.top;
        body.style.width = saved.width;
        saved = null;
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}
