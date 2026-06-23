import { useEffect, type CSSProperties } from "react";
import { Stamp } from "lucide-react";
import { useStore } from "../store";

// A brief, layered "stamped!" celebration when a Wishlist game is imported into
// the Bazaar with a charter — the psychological reward for the spend. The seal
// slams down with a shockwave ring, a spark burst, and a glow, then fades. Driven
// by store.celebration (set by importWithCharter); auto-clears after the anim.
// Honours prefers-reduced-motion (a calm fade, no particles or haptics).

const SPARKS = 16;

export function ImportCelebration() {
  const celebration = useStore((s) => s.celebration);
  const clear = useStore((s) => s.clearCelebration);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  useEffect(() => {
    if (!celebration) return;
    if (!reduced) {
      // A short haptic "thud" timed to the seal's impact (supported devices only).
      try {
        navigator.vibrate?.([0, 22, 45, 14]);
      } catch {
        /* no haptics available */
      }
    }
    const t = setTimeout(clear, 1700);
    return () => clearTimeout(t);
  }, [celebration, clear, reduced]);

  if (!celebration) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] grid place-items-center overflow-hidden"
      aria-live="polite"
    >
      {/* `key` restarts every animation if a second import fires quickly. */}
      <div key={celebration.id} className="relative grid place-items-center">
        {!reduced && (
          <>
            {/* Glow bloom behind the seal. */}
            <span className="animate-celebrate-flash absolute h-72 w-72 rounded-full" />
            {/* Impact shockwave rings (the second trails slightly). */}
            <span className="animate-shockwave absolute h-36 w-36 rounded-full border-2 border-accent/70" />
            <span
              className="animate-shockwave absolute h-36 w-36 rounded-full border border-brand/60"
              style={{ animationDelay: "0.24s" }}
            />
            {/* Radiating spark burst. */}
            {Array.from({ length: SPARKS }).map((_, i) => {
              const angle = (360 / SPARKS) * i + (i % 2 ? 11 : 0);
              const dist = 84 + (i % 3) * 30;
              const rad = (angle * Math.PI) / 180;
              const big = i % 3 === 0;
              const style = {
                "--tx": `${(Math.cos(rad) * dist).toFixed(1)}px`,
                "--ty": `${(Math.sin(rad) * dist).toFixed(1)}px`,
                animationDelay: `${(0.14 + (i % 4) * 0.025).toFixed(3)}s`,
              } as CSSProperties;
              return (
                <span
                  key={i}
                  style={style}
                  className={
                    "animate-spark absolute rounded-full " +
                    (big ? "h-2 w-2 bg-brand" : "h-1.5 w-1.5 bg-accent")
                  }
                />
              );
            })}
          </>
        )}

        {/* The seal itself. */}
        <div className="animate-stamp relative flex flex-col items-center gap-1 rounded-2xl border-4 border-brand/70 bg-surface/95 px-9 py-6 shadow-2xl ring-1 ring-accent/25">
          <Stamp className="text-accent" size={46} />
          <p className="font-display text-2xl font-semibold uppercase tracking-[0.12em] text-ink">
            Imported
          </p>
          <p className="max-w-[15rem] truncate text-center text-sm text-muted">
            {celebration.title}
          </p>
        </div>
      </div>
    </div>
  );
}
