import { useEffect, useRef } from "react";

// Make the browser/Android Back button (and the iOS back-swipe) dismiss an open
// overlay — a modal or an inline form — instead of navigating away from the page.
//
// While the overlay is open we push a throwaway history entry pointing at the
// SAME url. Back pops it and we close the overlay; because the url is unchanged,
// the app's hash router (see lib/route.ts + App) sees no page change and stays
// put. If the overlay is instead closed another way (an X button, the backdrop,
// a successful submit), we drop that entry so the page history stays clean and a
// later Back still returns to the previous page.
export function useHistoryDismiss(active: boolean, onClose: () => void): void {
  // Always call the latest onClose, without re-running the effect when it changes.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    window.history.pushState({ bbOverlay: true }, "");
    const onPop = () => onCloseRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by something other than Back: remove the sentinel we added. After
      // a Back the sentinel is already gone, so history.state no longer marks it.
      if (window.history.state?.bbOverlay) window.history.back();
    };
  }, [active]);
}
