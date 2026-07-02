import { useEffect, type CSSProperties } from "react";
import { useStore } from "../store";

// The "stamped!" celebration when a Wishlist game is imported into the Bazaar
// with a charter — the psychological reward for the spend. An import-charter
// ticket bearing the game's title rises in, and a red rubber seal slams onto
// its corner: the ticket jolts under the impact while a haptic thud, a dim
// screen pulse, shockwaves, ink flecks, and paper confetti all hit on the same
// beat (~0.33s — see the timeline note in index.css). The stamped ticket then
// settles, holds, and lifts away. Driven by store.celebration (set by
// importWithCharter); auto-clears after the animation. Honours
// prefers-reduced-motion (the composed ticket calmly fades, no particles or
// haptics).

const CONFETTI = 18;
const CONFETTI_COLORS = ["bg-accent", "bg-brand", "bg-success"];

/** Ink flecks around the seal (positions relative to the seal's box). */
const INK_SPLATS: { left: number; top: number; size: number }[] = [
  { left: -10, top: 26, size: 4 },
  { left: -4, top: -6, size: 3 },
  { left: 38, top: -10, size: 3 },
  { left: 96, top: 0, size: 4 },
  { left: 104, top: 34, size: 3 },
  { left: 52, top: 52, size: 3 },
];

export function ImportCelebration() {
  const celebration = useStore((s) => s.celebration);
  const clear = useStore((s) => s.clearCelebration);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  useEffect(() => {
    if (!celebration) return;
    if (!reduced) {
      // A haptic "thud" timed to the seal's impact (~330ms in), with a faint
      // echo as it settles (supported devices only).
      try {
        navigator.vibrate?.([0, 330, 30, 60, 18]);
      } catch {
        /* no haptics available */
      }
    }
    const t = setTimeout(clear, reduced ? 1300 : 2150);
    return () => clearTimeout(t);
  }, [celebration, clear, reduced]);

  if (!celebration) return null;

  const stampDate = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] grid place-items-center overflow-hidden"
      aria-live="polite"
    >
      {/* The on-screen "thud": a quick dim pulse at the moment of impact. */}
      {!reduced && <div className="animate-thump absolute inset-0 bg-black" />}

      {/* `key` restarts every animation if a second import fires quickly. */}
      <div key={celebration.id} className="animate-celebration-exit relative grid place-items-center">
        {!reduced && (
          <>
            {/* Glow bloom behind the impact. */}
            <span className="animate-celebrate-flash absolute h-72 w-72 rounded-full" />
            {/* Impact shockwave rings (the second trails slightly). */}
            <span className="animate-shockwave absolute h-36 w-36 rounded-full border-2 border-accent/70" />
            <span
              className="animate-shockwave absolute h-36 w-36 rounded-full border border-brand/60"
              style={{ animationDelay: "0.44s" }}
            />
            {/* Paper confetti burst — small rectangles that spin as they fly,
                with a slight upward bias so it reads festive, not explosive. */}
            {Array.from({ length: CONFETTI }).map((_, i) => {
              const angle = (360 / CONFETTI) * i + (i % 2 ? 13 : 0);
              const dist = 92 + (i % 3) * 32;
              const rad = (angle * Math.PI) / 180;
              const style = {
                "--tx": `${(Math.cos(rad) * dist).toFixed(1)}px`,
                "--ty": `${(Math.sin(rad) * dist - 22).toFixed(1)}px`,
                "--rot": `${i % 2 ? 620 : -540}deg`,
                animationDelay: `${(0.32 + (i % 4) * 0.03).toFixed(2)}s`,
              } as CSSProperties;
              return (
                <span
                  key={i}
                  style={style}
                  className={
                    "animate-confetti absolute h-3 w-1.5 rounded-[2px] " +
                    CONFETTI_COLORS[i % CONFETTI_COLORS.length]
                  }
                />
              );
            })}
          </>
        )}

        {/* The import ticket the seal lands on. */}
        <div className="animate-ticket-in relative w-[19rem] max-w-[85vw] rounded-xl border-[1.5px] border-edge bg-surface px-6 pb-5 pt-4 shadow-stamp">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
            Import charter · redeemed
          </p>
          <p className="mt-1 truncate pr-10 font-display text-xl font-semibold text-ink">
            {celebration.title}
          </p>
          <div className="my-3 border-t-2 border-dashed border-line" />
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Admitted to the Bazaar
          </p>

          {/* The red rubber seal, slammed onto the ticket's corner. Positioned
              by offsets (not transforms) so the stamp keyframes own the
              element's transform entirely. */}
          <div className="animate-stamp absolute -right-6 -top-5">
            <div className="rounded-lg border-[3px] border-accent bg-accent/10 p-[3px]">
              <div className="rounded-[5px] border border-accent px-2.5 py-1 text-center">
                <p className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-accent">
                  Imported
                </p>
                <p className="font-mono text-[9px] font-semibold tracking-[0.2em] text-accent/80">
                  {stampDate}
                </p>
              </div>
            </div>
            {/* Ink flecks that pop on impact and stay on the paper. */}
            {!reduced &&
              INK_SPLATS.map((s, i) => (
                <span
                  key={i}
                  style={{
                    left: s.left,
                    top: s.top,
                    width: s.size,
                    height: s.size,
                    animationDelay: `${(0.33 + i * 0.02).toFixed(2)}s`,
                  }}
                  className="animate-ink-splat absolute rounded-full bg-accent/80"
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
