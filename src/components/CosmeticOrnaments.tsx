import type { CSSProperties, ReactElement } from "react";
import { resolveStallStyle } from "../lib/shopCosmetics";

/** Decorative overlay layers for ornamented Curio Shop cosmetics. A style's
 *  `ornament` key (shopCosmetics.ts) resolves to a renderer here; unknown keys
 *  render nothing, so a DB row can never crash a host (the resolveFrameStyle
 *  posture). Every layer is aria-hidden + pointer-events-none — pure dressing
 *  that never intercepts clicks or reaches the accessibility tree. Hosts:
 *  Avatar wraps frames; stall hosts position within the style's own
 *  `relative overflow-hidden` card classes. */

/** A roosting bat: shoulder-pivoted wing paths that stretch on the fx-flap
 *  cycle (a quick double flap, then a long rest). */
function Bat({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 48 26" className={className} style={style} aria-hidden="true">
      <g fill="#312e81" stroke="#0b0a1f" strokeWidth="0.6">
        <path
          className="fx-flap-l"
          d="M22 13 C17 5, 9 4, 2 10 C6 11, 8 13, 9 16 C12 14, 15 15, 17 18 C19 16, 21 15, 22 13 Z"
        />
        <path
          className="fx-flap-r"
          d="M26 13 C31 5, 39 4, 46 10 C42 11, 40 13, 39 16 C36 14, 33 15, 31 18 C29 16, 27 15, 26 13 Z"
        />
        <ellipse cx="24" cy="14" rx="4.5" ry="6.5" />
        <path d="M20.5 9 L21.5 3.5 L23.5 7.5 Z" />
        <path d="M27.5 9 L26.5 3.5 L24.5 7.5 Z" />
      </g>
      <circle cx="22.4" cy="12" r="0.9" fill="#fbbf24" />
      <circle cx="25.6" cy="12" r="0.9" fill="#fbbf24" />
    </svg>
  );
}

/** A string of glowing bulbs along the host's top edge. Delays are staggered
 *  per bulb so the string ripples instead of blinking in unison. */
function LightString({ colors, staggered = false }: { colors: string[]; staggered?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-3 top-1 flex justify-between"
    >
      {Array.from({ length: 9 }, (_, i) => {
        const c = colors[i % colors.length];
        return (
          <span
            key={i}
            className="fx-twinkle h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: c,
              boxShadow: `0 0 6px ${c}`,
              animationDelay: `${(i % 5) * 0.35}s`,
              marginTop: staggered && i % 2 === 1 ? 4 : 0,
            }}
          />
        );
      })}
    </span>
  );
}

const FRAME_ORNAMENTS: Record<string, (size: number) => ReactElement> = {
  "bat-perched": (size) => (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{ top: -Math.round(size * 0.24), width: Math.max(18, Math.round(size * 0.62)) }}
    >
      <Bat className="block h-auto w-full" />
    </span>
  ),
};

const STALL_ORNAMENTS: Record<string, () => ReactElement> = {
  "string-lights": () => <LightString colors={["#fbbf24", "#fde68a"]} />,
  "tree-lights": () => (
    <LightString colors={["#f87171", "#4ade80", "#60a5fa", "#fbbf24", "#f472b6"]} staggered />
  ),
  pumpkins: () => (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0.5 right-2 flex items-end gap-0.5 leading-none"
    >
      <span style={{ fontSize: 10, transform: "rotate(-8deg)" }}>🎃</span>
      <span style={{ fontSize: 13 }}>🎃</span>
      <span style={{ fontSize: 9, transform: "rotate(10deg)" }}>🎃</span>
    </span>
  ),
  "bats-drifting": () => (
    <>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-6 w-6 opacity-50"
      >
        <g fill="none" stroke="#c4b5fd" strokeWidth="0.7">
          <path d="M0 0 L23 5" />
          <path d="M0 0 L17 17" />
          <path d="M0 0 L5 23" />
          <path d="M2.5 11 Q8 9.5 11 2.5" />
          <path d="M4 18 Q13 15 18 4" />
        </g>
      </svg>
      <span
        aria-hidden="true"
        className="fx-drift pointer-events-none absolute right-6 top-1 w-5"
      >
        <Bat className="block h-auto w-full" />
      </span>
      <span
        aria-hidden="true"
        className="fx-drift pointer-events-none absolute right-14 top-3 w-4"
        style={{ animationDelay: "1.6s" }}
      >
        <Bat className="block h-auto w-full" />
      </span>
    </>
  ),
};

/** Registry keys, exported for the shopCosmetics well-formedness test: every
 *  `ornament` a style declares must resolve here. */
export const FRAME_ORNAMENT_KEYS = Object.keys(FRAME_ORNAMENTS);
export const STALL_ORNAMENT_KEYS = Object.keys(STALL_ORNAMENTS);

/** The decorative element of an ornamented frame style, scaled to the avatar.
 *  Rendered by Avatar inside its (relative) ring wrapper. */
export function FrameOrnament({ ornament, size }: { ornament: string; size: number }) {
  const render = FRAME_ORNAMENTS[ornament];
  return render ? render(size) : null;
}

/** The decorative element of an ornamented stall style. Hosts render it as a
 *  direct child of the card the style's classes are merged onto; styles
 *  without an ornament (or unknown keys) render nothing. */
export function StallOrnament({ styleKey }: { styleKey: string | null | undefined }) {
  const ornament = resolveStallStyle(styleKey)?.ornament;
  const render = ornament ? STALL_ORNAMENTS[ornament] : undefined;
  return render ? render() : null;
}
