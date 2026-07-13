// Global guard against the browser's "scroll wheel spins a number input"
// default. Scrolling the page with the cursor over a focused numeric field
// (a copy's cost, admin coin adjustments, economy levers…) silently changes
// the value instead of scrolling — an easy way to save a number you never
// typed. One capture-phase listener fixes every current and future
// <input type="number"> at once, so individual inputs don't need their own
// onWheel handlers. Installed once at app boot (src/main.tsx).

/** Should this wheel event be swallowed? Only when it would spin a value:
 *  the wheel is over a number input that currently has focus. An unfocused
 *  input just scrolls the page normally, so we leave that alone. */
export function isGuardedWheelTarget(
  target: EventTarget | null,
  activeElement: Element | null,
): boolean {
  return (
    target instanceof HTMLInputElement &&
    target.type === "number" &&
    target === activeElement
  );
}

/** Install the document-level guard. Returns an uninstall function (used by
 *  tests; the app installs it once for its lifetime). `passive: false` is
 *  required — document wheel listeners are passive by default and couldn't
 *  call preventDefault otherwise. */
export function installNumberInputWheelGuard(doc: Document = document): () => void {
  const onWheel = (e: WheelEvent) => {
    if (isGuardedWheelTarget(e.target, doc.activeElement)) e.preventDefault();
  };
  doc.addEventListener("wheel", onWheel, { passive: false, capture: true });
  return () => doc.removeEventListener("wheel", onWheel, { capture: true });
}
