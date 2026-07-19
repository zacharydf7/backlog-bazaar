import type { CSSProperties, ReactElement } from "react";
import { resolveStallStyle } from "../lib/shopCosmetics";

/** Decorative overlay layers for ornamented Curio Shop cosmetics. A style's
 *  `ornament` key (shopCosmetics.ts) resolves to a renderer here; unknown keys
 *  render nothing, so a DB row can never crash a host (the resolveFrameStyle
 *  posture). Every layer is aria-hidden + pointer-events-none — pure dressing
 *  that never intercepts clicks or reaches the accessibility tree.
 *
 *  Stall ornaments render at two scales: the compact "card" default (Market
 *  Square rows, shop previews) and "hero" for the big profile header, where
 *  card-sized dressing would read as specks. Hosts pass `scale`; each renderer
 *  sizes its elements from the flag. */

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

/** A loafing cat seen from the front: ears, slow-blinking green eyes, and a
 *  tail that swishes when it feels like it. */
function Cat({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 20" className={className} aria-hidden="true">
      <g fill="#1f2937" stroke="#0b0f19" strokeWidth="0.6">
        {/* Tail first so the body overlaps its base */}
        <path
          className="fx-tail"
          d="M36 15 C42 14, 45 9, 42 4 C41.4 3 40 3.2 40 4.4 C42 8, 40 11.5, 35 13"
        />
        <ellipse cx="26" cy="14" rx="13" ry="5.5" />
        <circle cx="12" cy="10" r="6" />
        <path d="M7.5 6.5 L8.5 1.5 L12 4.5 Z" />
        <path d="M16.5 6.5 L15.5 1.5 L12 4.5 Z" />
      </g>
      <circle className="fx-blink" cx="9.8" cy="9.6" r="1.1" fill="#4ade80" />
      <circle className="fx-blink" cx="14.2" cy="9.6" r="1.1" fill="#4ade80" />
    </svg>
  );
}

/** A string of glowing bulbs along the host's top edge. Delays are staggered
 *  per bulb so the string ripples instead of blinking in unison. */
function LightString({
  colors,
  staggered = false,
  hero = false,
}: {
  colors: string[];
  staggered?: boolean;
  hero?: boolean;
}) {
  const count = hero ? 14 : 9;
  const bulb = hero ? "h-2.5 w-2.5" : "h-1.5 w-1.5";
  return (
    <span
      aria-hidden="true"
      className={
        "pointer-events-none absolute flex justify-between " +
        (hero ? "inset-x-6 top-2" : "inset-x-3 top-1")
      }
    >
      {Array.from({ length: count }, (_, i) => {
        const c = colors[i % colors.length];
        return (
          <span
            key={i}
            className={"fx-twinkle rounded-full " + bulb}
            style={{
              backgroundColor: c,
              boxShadow: `0 0 ${hero ? 10 : 6}px ${c}`,
              animationDelay: `${(i % 5) * 0.35}s`,
              marginTop: staggered && i % 2 === 1 ? (hero ? 7 : 4) : 0,
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
  "cat-perched": (size) => (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{ top: -Math.round(size * 0.2), width: Math.max(22, Math.round(size * 0.75)) }}
    >
      <Cat className="block h-auto w-full" />
    </span>
  ),
  sparks: (size) => {
    const dot = Math.max(2, Math.round(size / 14));
    const spark = (left: string, top: number, delay: number, color: string, key: number) => (
      <span
        key={key}
        className="fx-spark absolute rounded-full"
        style={{
          left,
          top,
          width: dot,
          height: dot,
          backgroundColor: color,
          boxShadow: `0 0 ${dot * 2}px ${color}`,
          animationDelay: `${delay}s`,
        }}
      />
    );
    return (
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        {spark("18%", -dot, 0, "#fbbf24", 0)}
        {spark("55%", -dot * 1.5, 1.1, "#f87171", 1)}
        {spark("78%", 0, 2, "#fb923c", 2)}
      </span>
    );
  },
};

const STALL_ORNAMENTS: Record<string, (hero: boolean) => ReactElement> = {
  "string-lights": (hero) => <LightString colors={["#fbbf24", "#fde68a"]} hero={hero} />,
  "tree-lights": (hero) => (
    <LightString
      colors={["#f87171", "#4ade80", "#60a5fa", "#fbbf24", "#f472b6"]}
      staggered
      hero={hero}
    />
  ),
  pumpkins: (hero) => (
    <span
      aria-hidden="true"
      className={
        "pointer-events-none absolute flex items-end leading-none " +
        (hero ? "bottom-2 right-4 gap-1.5" : "bottom-0.5 right-2 gap-0.5")
      }
    >
      <span style={{ fontSize: hero ? 22 : 10, transform: "rotate(-8deg)" }}>🎃</span>
      <span style={{ fontSize: hero ? 28 : 13 }}>🎃</span>
      <span style={{ fontSize: hero ? 19 : 9, transform: "rotate(10deg)" }}>🎃</span>
    </span>
  ),
  "bats-drifting": (hero) => (
    <>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={
          "pointer-events-none absolute left-0 top-0 opacity-50 " +
          (hero ? "h-16 w-16" : "h-6 w-6")
        }
      >
        <g fill="none" stroke="#c4b5fd" strokeWidth={hero ? 0.45 : 0.7}>
          <path d="M0 0 L23 5" />
          <path d="M0 0 L17 17" />
          <path d="M0 0 L5 23" />
          <path d="M2.5 11 Q8 9.5 11 2.5" />
          <path d="M4 18 Q13 15 18 4" />
        </g>
      </svg>
      <span
        aria-hidden="true"
        className={
          "fx-drift pointer-events-none absolute " +
          (hero ? "right-12 top-3 w-10" : "right-6 top-1 w-5")
        }
      >
        <Bat className="block h-auto w-full" />
      </span>
      <span
        aria-hidden="true"
        className={
          "fx-drift pointer-events-none absolute " +
          (hero ? "right-28 top-8 w-8" : "right-14 top-3 w-4")
        }
        style={{ animationDelay: "1.6s" }}
      >
        <Bat className="block h-auto w-full" />
      </span>
    </>
  ),
  comet: (hero) => (
    <>
      {/* A few resting stars so the sky isn't empty between streaks */}
      {[
        { left: "20%", top: "22%", d: "0s" },
        { left: "48%", top: "12%", d: "0.9s" },
        { left: "72%", top: "30%", d: "1.7s" },
      ].map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="fx-twinkle pointer-events-none absolute rounded-full bg-[#e0e7ff]"
          style={{
            left: s.left,
            top: s.top,
            width: hero ? 4 : 2,
            height: hero ? 4 : 2,
            boxShadow: `0 0 ${hero ? 8 : 4}px #c7d2fe`,
            animationDelay: s.d,
          }}
        />
      ))}
      <span
        aria-hidden="true"
        className={
          "fx-comet pointer-events-none absolute " + (hero ? "right-10 top-4" : "right-4 top-1.5")
        }
        style={
          {
            "--comet-x": hero ? "-320px" : "-120px",
            "--comet-y": hero ? "130px" : "56px",
          } as CSSProperties
        }
      >
        <span
          className="block rounded-full"
          style={{
            width: hero ? 64 : 32,
            height: hero ? 3 : 2,
            transform: "rotate(-22deg)",
            background: "linear-gradient(90deg, #ffffff, rgba(255,255,255,0))",
            boxShadow: "0 0 8px rgba(224,231,255,0.9)",
          }}
        />
      </span>
    </>
  ),
  fog: (hero) => (
    <>
      <span
        aria-hidden="true"
        className={
          "fx-fog pointer-events-none absolute inset-x-0 rounded-full bg-[#cbd5e1]/25 blur-sm " +
          (hero ? "-bottom-2 h-8" : "-bottom-1 h-4")
        }
      />
      <span
        aria-hidden="true"
        className={
          "fx-fog pointer-events-none absolute rounded-full bg-[#e2e8f0]/20 blur-sm " +
          (hero ? "bottom-3 left-6 right-16 h-5" : "bottom-1.5 left-3 right-8 h-2.5")
        }
        style={{ animationDelay: "-7s" }}
      />
    </>
  ),
  "snow-falling": (hero) => {
    const flakes = hero
      ? [
          { left: "6%", top: "8%", size: 14, dur: 7, delay: 0 },
          { left: "16%", top: "26%", size: 10, dur: 8.5, delay: 1.4 },
          { left: "28%", top: "12%", size: 16, dur: 6.4, delay: 2.8 },
          { left: "40%", top: "30%", size: 11, dur: 7.8, delay: 0.7 },
          { left: "52%", top: "10%", size: 13, dur: 6.8, delay: 3.5 },
          { left: "63%", top: "24%", size: 10, dur: 8.2, delay: 1.9 },
          { left: "74%", top: "14%", size: 15, dur: 7.2, delay: 4.2 },
          { left: "84%", top: "28%", size: 11, dur: 7.6, delay: 2.3 },
          { left: "93%", top: "16%", size: 12, dur: 6.6, delay: 5 },
          { left: "35%", top: "6%", size: 9, dur: 9, delay: 5.6 },
        ]
      : [
          { left: "8%", top: "12%", size: 8, dur: 6, delay: 0 },
          { left: "26%", top: "34%", size: 7, dur: 7.4, delay: 1.2 },
          { left: "45%", top: "10%", size: 9, dur: 5.8, delay: 2.4 },
          { left: "62%", top: "30%", size: 7, dur: 6.8, delay: 0.6 },
          { left: "78%", top: "16%", size: 8, dur: 6.4, delay: 3.1 },
          { left: "90%", top: "26%", size: 7, dur: 7, delay: 1.8 },
        ];
    return (
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-[#e0f2fe]">
        {flakes.map((f, i) => (
          <span
            key={i}
            className="fx-fall absolute leading-none"
            style={
              {
                left: f.left,
                top: f.top,
                fontSize: f.size,
                "--fall-duration": `${f.dur}s`,
                "--fall-distance": hero ? "110px" : "40px",
                animationDelay: `${f.delay}s`,
              } as CSSProperties
            }
          >
            ❄
          </span>
        ))}
      </span>
    );
  },
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
 *  without an ornament (or unknown keys) render nothing. The profile header
 *  passes scale="hero" for proportionally larger dressing. */
export function StallOrnament({
  styleKey,
  scale = "card",
}: {
  styleKey: string | null | undefined;
  scale?: "card" | "hero";
}) {
  const ornament = resolveStallStyle(styleKey)?.ornament;
  const render = ornament ? STALL_ORNAMENTS[ornament] : undefined;
  return render ? render(scale === "hero") : null;
}
