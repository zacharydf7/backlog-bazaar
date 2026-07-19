import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/** How far down the page must be scrolled before the button appears — about a
 *  screenful, so it never nags on short boards (which simply can't scroll this
 *  far). The innerHeight fallback covers jsdom. */
export function jumpToTopThreshold(innerHeight: number): number {
  return innerHeight > 0 ? innerHeight : 600;
}

/** The floating "back to top" button on long scrolling boards (issue 936d0ca7):
 *  fades in once the page is a screenful deep and one tap returns to the top.
 *  On phones it sits above the Add FAB and clear of the fast-scroll rail; on
 *  desktop it tucks into the bottom-right corner. Mount it once per scrolling
 *  page — it self-hides at the top, so short pages never see it. */
export function JumpToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > jumpToTopThreshold(window.innerHeight));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function jump() {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      aria-label="Jump to top"
      title="Jump to top"
      onClick={jump}
      tabIndex={visible ? 0 : -1}
      className={
        "fixed bottom-36 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full " +
        "border border-line bg-panel/90 text-muted shadow-lg backdrop-blur transition " +
        "hover:border-brand/50 hover:text-ink md:bottom-6 md:right-6 " +
        (visible ? "opacity-100" : "pointer-events-none opacity-0")
      }
    >
      <ArrowUp size={20} />
    </button>
  );
}
