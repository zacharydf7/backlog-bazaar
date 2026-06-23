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
//
// OVERLAYS STACK. A modal can open another modal (e.g. Edit Game → Manage
// Family). Each pushes its own sentinel, so we track a module-level LIFO stack of
// the open overlays: only the top one reacts to a Back. The tricky case is
// closing a child by a non-Back means (its X/backdrop): the child's cleanup pops
// its own sentinel with history.back(), and that popstate is otherwise
// indistinguishable to the *parent* from a real Back — which used to close the
// parent too. We flag those self-induced pops so a parent below us ignores them.

/** Ids of the currently-open overlays, top of the stack last. */
const stack: number[] = [];
let seq = 0;
/** popstate events we triggered ourselves (a child's cleanup removing its own
 *  sentinel) for a parent overlay to swallow instead of treating as a Back. */
let selfPops = 0;

export function useHistoryDismiss(active: boolean, onClose: () => void): void {
  // Always call the latest onClose, without re-running the effect when it changes.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const id = ++seq;
    stack.push(id);
    window.history.pushState({ bbOverlay: true }, "");
    const onPop = () => {
      // Our own cleanup removing a sentinel below the top — not a user Back.
      if (selfPops > 0) {
        selfPops--;
        return;
      }
      // Only the top-most overlay responds to a Back; lower ones stay put.
      if (stack[stack.length - 1] !== id) return;
      stack.pop();
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const wasTop = stack[stack.length - 1] === id;
      const idx = stack.lastIndexOf(id);
      if (idx !== -1) stack.splice(idx, 1);
      // Closed by something other than Back (our sentinel is still on top):
      // remove it. Defer to a microtask so that if the same close also triggers a
      // navigation (e.g. a menu item that both closes the overlay and changes
      // page), that push commits first. We then only pop when our sentinel is
      // still on top; if a navigation buried it, we leave history alone — backing
      // would undo the nav. After a real Back the sentinel is already gone.
      if (wasTop) {
        queueMicrotask(() => {
          if (window.history.state?.bbOverlay) {
            // If an overlay remains below us, its listener will hear this pop —
            // tell it to ignore it (our cleanup, not a user Back).
            if (stack.length > 0) selfPops++;
            window.history.back();
          }
        });
      }
    };
  }, [active]);
}
