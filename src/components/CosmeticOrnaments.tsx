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

/** One lightning bolt on the fx-bolt strike cycle (a rare double-flicker).
 *  Shared by the Stormcaller frame and the Haunted Manor stall; position and
 *  stagger via style (left/top/animationDelay). */
function Bolt({ width, style }: { width: number; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 14 24"
      aria-hidden="true"
      className="fx-bolt pointer-events-none absolute"
      style={{ filter: "drop-shadow(0 0 3px #93c5fd)", width, ...style }}
    >
      <path
        d="M9.5 0 L2 11 L6.5 11 L3.5 24 L12 9.5 L7.5 9.5 Z"
        fill="#e8f4ff"
        stroke="#93c5fd"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/** A lumpy storm cloud, blurred soft and drifted slowly on the fx-fog cycle.
 *  Dark against the sky; the manor's sheet-flash lights it from behind. */
function StormCloud({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 30 16" className={className} style={style} aria-hidden="true">
      <path
        d="M4 14 C1.2 14 0 11.6 1.6 9.8 C0.8 7 3.6 4.8 6.2 6 C7.2 3 11.4 2.2 13.4 4.6 C15.4 1.8 20.2 2.4 21.4 5.6 C24.4 4.8 27.2 7.2 26.2 10 C28.2 11.4 27.4 14 24.6 14 Z"
        fill="#0b1120"
        opacity="0.85"
      />
    </svg>
  );
}

/** The haunted manor in silhouette: gabled house, chimney, spired tower — and
 *  candlelit windows that flicker on staggered twinkle cycles. A faint rim
 *  stroke keeps the black shape readable on dark themes. */
function Manor({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true">
      <g fill="#0d1220" stroke="#64748b" strokeOpacity="0.55" strokeWidth="0.6">
        <path d="M8 20 L26 6 L44 20 L44 40 L8 40 Z" />
        <path d="M13 9 L17 9 L17 13 L13 16 Z" />
        <path d="M44 14 L58 14 L58 40 L44 40 Z" />
        <path d="M42 14 L51 2 L60 14 Z" />
      </g>
      <g fill="#fbbf24">
        <rect className="fx-twinkle" x="15" y="26" width="5" height="7" style={{ animationDuration: "3.8s" }} />
        <rect
          className="fx-twinkle"
          x="27"
          y="26"
          width="5"
          height="7"
          style={{ animationDuration: "5.2s", animationDelay: "1.4s" }}
        />
        <circle
          className="fx-twinkle"
          cx="26"
          cy="15"
          r="2.4"
          style={{ animationDuration: "4.4s", animationDelay: "0.7s" }}
        />
        <rect
          className="fx-twinkle"
          x="48.5"
          y="18"
          width="5"
          height="6"
          style={{ animationDuration: "4.8s", animationDelay: "2.2s" }}
        />
        <rect
          className="fx-twinkle"
          x="48.5"
          y="29"
          width="5"
          height="6"
          style={{ animationDuration: "3.4s", animationDelay: "3s" }}
        />
      </g>
    </svg>
  );
}

/** Santa's sleigh and reindeer team as one moonlit shadow, gliding leftward —
 *  the classic silhouette-across-the-sky. Each reindeer is a single flowing
 *  filled path (tapered leaping legs, not stick strokes); the sleigh is a
 *  swooping hull on a curled runner with a rounded, hatted Santa and a gift
 *  sack behind him. Loose on purpose: at flight size it reads as a shadow. */
function Sleigh({ className = "" }: { className?: string }) {
  // A leaping reindeer facing left: head → back → rump, rear legs stretched
  // back, belly, front legs reaching forward, chest. One closed shape.
  const DEER_BODY =
    "M0 10.4 C0.8 9.4 1.9 8.7 3.1 8.7 L3.9 7.9 L4.3 8.8 " +
    "C6.4 7.9 9.2 7.5 11.8 7.9 C13.8 8.2 15.4 9 16.2 10.1 " +
    "C16.7 10.8 16.7 11.5 16.2 12 L20.8 15.6 C21.2 15.9 20.8 16.6 20.3 16.4 " +
    "L15.4 12.7 C13.4 13.3 11 13.4 9.2 13 L4.6 16.2 C4.1 16.5 3.6 16 3.9 15.5 " +
    "L6.9 11.9 C4.9 11.7 2.6 11.4 1 10.9 C0.4 10.8 0 10.6 0 10.4 Z";
  const DEER_ANTLERS = "M3.3 8.6 C2.8 7 3.2 5.4 4.4 4.2 M3.9 6.6 C4.7 6 5.2 5 5.3 3.9";
  const deer = (x: number, y: number) => (
    <g key={x} transform={`translate(${x} ${y})`}>
      <path d={DEER_BODY} />
      <path
        d={DEER_ANTLERS}
        fill="none"
        stroke="#dfe7f3"
        strokeWidth="0.7"
        strokeLinecap="round"
      />
    </g>
  );
  return (
    <svg viewBox="0 0 128 26" className={className} aria-hidden="true">
      <g fill="#dfe7f3" opacity="0.85">
        {/* The team, rising slightly toward the lead deer */}
        {deer(0, -1)}
        {deer(26, 0)}
        {deer(52, 1)}
        {/* Reins sweeping back to the sleigh */}
        <path
          d="M4 11 C34 6.5, 70 7.5, 95 10.5"
          fill="none"
          stroke="#dfe7f3"
          strokeWidth="0.6"
          opacity="0.55"
        />
        {/* Sleigh hull: high curled front swoop, low bowl, rising back */}
        <path d="M91.4 12 C90 9.6 91 7.4 93.6 6.8 C94.3 6.6 94.7 7.3 94.2 7.8 C92.5 8.9 92.1 10.4 92.9 11.6 L107 11.6 C109.8 11.6 111.4 10 111.8 7.6 L114 7.6 C114 11.2 111.6 13.8 107.6 14 L94.4 14 C93 14 91.9 13.2 91.4 12 Z" />
        {/* Runner: curled tip, thin blade, two struts */}
        <path
          d="M89.4 16.2 C88.4 14.8 89.4 13.6 91 14.2 M90.6 16.4 L112 16.4"
          fill="none"
          stroke="#dfe7f3"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        <path
          d="M96 14 L96 16.4 M108 14 L108 16.4"
          fill="none"
          stroke="#dfe7f3"
          strokeWidth="0.7"
        />
        {/* Santa: rounded seated back, head, drooping hat, arm to the reins */}
        <path d="M99.6 11.6 C100 9.4 101.2 8 103 7.8 C104.2 7.7 105.2 8.4 105.4 9.4 L105.6 11.6 Z" />
        <circle cx="102.4" cy="6.4" r="1.5" />
        <path
          d="M101.2 5.5 C101.6 4.3 102.8 3.8 103.9 4.3 C104.7 4.6 105 5.4 104.8 6.1"
          fill="none"
          stroke="#dfe7f3"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        <circle cx="105" cy="6.3" r="0.55" />
        <path d="M100.4 9.6 L96 8.9 L95.9 9.7 L100.2 10.5 Z" />
        {/* The gift sack behind him */}
        <path d="M106.4 11.6 C106.4 9.8 107.8 8.8 109.4 9.2 C110.4 9.5 110.9 10.5 110.6 11.6 Z" />
      </g>
    </svg>
  );
}

/** A penguin belly-sliding leftward: dark back, white belly, orange beak and
 *  upturned feet, one flipper tucked along the back, ice spray kicking up at
 *  the chest. Proper little character rather than a shadow — it slides at
 *  ground level, close enough to be seen. */
function Penguin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 15" className={className} aria-hidden="true">
      <path d="M4.6 8 L0.8 9.2 L4.8 10 Z" fill="#fb923c" />
      <path d="M31 5.6 L34.4 3.6 L35.4 5.4 Z" fill="#fb923c" />
      <path
        d="M4 8.6 C4.6 5.8 7.4 4.2 10.2 5 C13 3.2 17 3.4 19.4 5.2 C26 4.2 32.6 6 36.6 9.6 C38.2 11 37.6 13.2 35.2 13.6 L9.6 13.6 C6.2 13.6 4.2 11.6 4 8.6 Z"
        fill="#1e293b"
        stroke="#0b1120"
        strokeWidth="0.5"
      />
      <path d="M8 13.6 C13 11.4 27 11.2 34.6 13.4 L34.6 13.6 L8 13.6 Z" fill="#e2e8f0" />
      <path d="M17 6.2 C19.4 4 23.4 3.8 25.6 5.4 C22.6 5.8 19.6 6.6 17.4 7.6 Z" fill="#334155" />
      <circle cx="7.6" cy="7.6" r="0.8" fill="#f8fafc" />
      <circle cx="2.6" cy="13.2" r="1" fill="#bae6fd" opacity="0.8" />
      <circle cx="0.9" cy="11.6" r="0.7" fill="#bae6fd" opacity="0.7" />
    </svg>
  );
}

/** An igloo on the shore: snow-block dome, entrance tunnel to the right, and
 *  a doorway that glows warm from inside on a slow twinkle — somebody's home
 *  (unlike the manor). */
function Igloo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 26" className={className} aria-hidden="true">
      <g fill="#e8f4fb" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.6">
        <path d="M2 25 A17 17 0 0 1 36 25 Z" />
        <path d="M30 25 A6.5 6.5 0 0 1 43 25 Z" />
      </g>
      <g fill="none" stroke="#94a3b8" strokeOpacity="0.45" strokeWidth="0.5">
        <path d="M4.5 19 C10 16.8 28 16.8 33.5 19" />
        <path d="M8 13 C13 11.4 25 11.4 30 13" />
        <path d="M12 25 L12.4 19.4 M19 25 L19 19 M26 25 L25.6 19.4" />
        <path d="M15.5 18.6 L16 13.2 M22.5 18.6 L22 13.2" />
      </g>
      <path d="M33 25 A3.5 3.5 0 0 1 40 25 Z" fill="#1e293b" />
      <path
        className="fx-twinkle"
        d="M34 25 A2.6 2.6 0 0 1 39.2 25 Z"
        fill="#fbbf24"
        opacity="0.9"
        style={{ animationDuration: "4.6s" }}
      />
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
  storm: (size) => (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      <Bolt width={Math.max(7, Math.round(size * 0.2))} style={{ left: "14%", top: "-8%" }} />
      <Bolt
        width={Math.max(5, Math.round(size * 0.14))}
        style={{ left: "64%", top: "34%", animationDelay: "3.4s" }}
      />
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
  "sleigh-night": (hero) => {
    const flakes = hero
      ? [
          { left: "10%", top: "20%", size: 10, dur: 11, delay: 0 },
          { left: "30%", top: "34%", size: 8, dur: 13, delay: 3 },
          { left: "55%", top: "24%", size: 9, dur: 12, delay: 6 },
          { left: "76%", top: "38%", size: 8, dur: 14, delay: 1.5 },
          { left: "90%", top: "26%", size: 9, dur: 12.5, delay: 8 },
        ]
      : [
          { left: "14%", top: "30%", size: 6, dur: 11, delay: 0 },
          { left: "44%", top: "44%", size: 5, dur: 13, delay: 4 },
          { left: "70%", top: "34%", size: 6, dur: 12, delay: 8 },
        ];
    return (
      <>
        {/* A pale moon and a few resting stars — the calm part of the night */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-[#e2e8f0]/70"
          style={{
            left: hero ? 30 : 12,
            top: hero ? 14 : 5,
            width: hero ? 22 : 9,
            height: hero ? 22 : 9,
            boxShadow: "0 0 12px rgba(226, 232, 240, 0.5)",
          }}
        />
        {[
          { left: "34%", top: "16%", d: "0s" },
          { left: "58%", top: "10%", d: "1.3s" },
          { left: "80%", top: "20%", d: "2.1s" },
        ].map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="fx-twinkle pointer-events-none absolute rounded-full bg-[#e2e8f0]"
            style={{
              left: s.left,
              top: s.top,
              width: hero ? 3 : 2,
              height: hero ? 3 : 2,
              boxShadow: `0 0 ${hero ? 6 : 3}px #cbd5e1`,
              animationDelay: s.d,
            }}
          />
        ))}
        {/* Sparse, unhurried snow — calmer than Let It Snow's flurry */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-[#cbd5e1]">
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
                  "--fall-distance": hero ? "90px" : "34px",
                  animationDelay: `${f.delay}s`,
                } as CSSProperties
              }
            >
              ❄
            </span>
          ))}
        </span>
        {/* And, every so often, the sleigh — it starts parked past the card's
            right edge (clipped) and glides clear across to exit on the left. */}
        <span
          aria-hidden="true"
          className={"fx-sleigh pointer-events-none absolute " + (hero ? "w-44" : "w-24")}
          style={
            {
              top: hero ? "16%" : "12%",
              "--sleigh-rise": hero ? "-28px" : "-10px",
            } as CSSProperties
          }
        >
          <Sleigh className="block h-auto w-full" />
        </span>
      </>
    );
  },
  "haunted-manor": (hero) => (
    <>
      {/* A faint sheet flash over the sky, synced to the first strike — it
          sits UNDER the clouds so they light up from behind */}
      <span
        aria-hidden="true"
        className="fx-bolt pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 30% 0%, rgba(224, 242, 254, 0.16), transparent 60%)",
        }}
      />
      {/* Storm clouds crowding the top of the sky, drifting slowly */}
      <StormCloud
        className={
          "fx-fog pointer-events-none absolute blur-[1.5px] " +
          (hero ? "-top-2 left-[4%] w-40" : "-top-1 left-[2%] w-16")
        }
      />
      <StormCloud
        className={
          "fx-fog pointer-events-none absolute blur-[1.5px] " +
          (hero ? "-top-3 left-[38%] w-52" : "-top-1.5 left-[36%] w-24")
        }
        style={{ animationDelay: "-9s" }}
      />
      {hero && (
        <StormCloud
          className="fx-fog pointer-events-none absolute -top-1 left-[74%] w-32 blur-[1.5px]"
          style={{ animationDelay: "-4s" }}
        />
      )}
      {/* Lightning striking out from beneath the clouds */}
      <Bolt width={hero ? 16 : 8} style={{ left: "18%", top: hero ? "10%" : "16%" }} />
      <Bolt
        width={hero ? 12 : 6}
        style={{ left: "50%", top: hero ? "14%" : "22%", animationDelay: "3.4s" }}
      />
      {/* The manor on its hill, windows flickering */}
      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute bottom-0 " + (hero ? "right-6 w-36" : "right-2 w-16")
        }
      >
        <Manor className="block h-auto w-full" />
      </span>
      {/* Ground fog curling over the manor's base — drawn last so the mist
          wraps the house rather than hiding behind it */}
      <span
        aria-hidden="true"
        className={
          "fx-fog pointer-events-none absolute inset-x-0 rounded-full bg-[#94a3b8]/20 blur-sm " +
          (hero ? "-bottom-2 h-7" : "-bottom-1 h-3.5")
        }
      />
      <span
        aria-hidden="true"
        className={
          "fx-fog pointer-events-none absolute rounded-full bg-[#cbd5e1]/15 blur-sm " +
          (hero ? "bottom-2 left-10 right-8 h-4" : "bottom-1 left-5 right-4 h-2")
        }
        style={{ animationDelay: "-7s" }}
      />
    </>
  ),
  "igloo-penguins": (hero) => {
    const flakes = hero
      ? [
          { left: "8%", top: "16%", size: 10, dur: 11, delay: 0 },
          { left: "26%", top: "30%", size: 8, dur: 13, delay: 3.2 },
          { left: "44%", top: "14%", size: 9, dur: 12, delay: 6.1 },
          { left: "62%", top: "32%", size: 8, dur: 14, delay: 1.6 },
          { left: "78%", top: "18%", size: 10, dur: 12.5, delay: 8 },
          { left: "92%", top: "28%", size: 8, dur: 13.5, delay: 4.7 },
        ]
      : [
          { left: "12%", top: "22%", size: 6, dur: 11, delay: 0 },
          { left: "40%", top: "36%", size: 5, dur: 13, delay: 4 },
          { left: "66%", top: "18%", size: 6, dur: 12, delay: 7.5 },
          { left: "88%", top: "30%", size: 5, dur: 12.5, delay: 2.2 },
        ];
    return (
      <>
        {/* Unhurried snow drifting over the cove */}
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
                  "--fall-distance": hero ? "90px" : "34px",
                  animationDelay: `${f.delay}s`,
                } as CSSProperties
              }
            >
              ❄
            </span>
          ))}
        </span>
        {/* The snow-covered shore: two solid drift layers — a shadowed bank
            behind, bright packed snow in front — so the ground reads as snow,
            not mist */}
        <svg
          viewBox="0 0 100 14"
          preserveAspectRatio="none"
          aria-hidden="true"
          className={
            "pointer-events-none absolute inset-x-0 bottom-0 " + (hero ? "h-7" : "h-3")
          }
        >
          <path
            d="M0 6 C14 2.5 30 7.5 48 5 C64 3 78 8 90 5.5 C94 4.8 98 5.2 100 6 L100 14 L0 14 Z"
            fill="#c7ddf2"
            opacity="0.9"
          />
        </svg>
        <svg
          viewBox="0 0 100 12"
          preserveAspectRatio="none"
          aria-hidden="true"
          className={
            "pointer-events-none absolute inset-x-0 bottom-0 " + (hero ? "h-5" : "h-2.5")
          }
        >
          <path
            d="M0 7 C12 3.5 26 8 42 6 C58 4 72 8.5 86 6 C92 5 96 5.5 100 6.5 L100 12 L0 12 Z"
            fill="#eef6fc"
            opacity="0.97"
          />
        </svg>
        {/* Snow glinting in the light */}
        {[
          { left: "34%", d: "0s" },
          { left: "56%", d: "1.1s" },
          { left: "78%", d: "2.3s" },
        ].map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="fx-twinkle pointer-events-none absolute rounded-full bg-[#cffafe]"
            style={{
              left: s.left,
              bottom: hero ? 12 : 5,
              width: hero ? 4 : 2,
              height: hero ? 4 : 2,
              boxShadow: `0 0 ${hero ? 8 : 4}px #a5f3fc`,
              animationDelay: s.d,
            }}
          />
        ))}
        {/* The tobogganers — parked past the right edge, then a belly-slide
            clear across the snow. Drawn before the igloo so they exit behind
            it. A big one and a little one, on different clocks so the pair
            drift in and out of step. */}
        <span
          aria-hidden="true"
          className={"fx-toboggan pointer-events-none absolute " + (hero ? "w-16" : "w-8")}
          style={{ bottom: hero ? 8 : 3 }}
        >
          <Penguin className="block h-auto w-full" />
        </span>
        <span
          aria-hidden="true"
          className={"fx-toboggan pointer-events-none absolute " + (hero ? "w-11" : "w-6")}
          style={
            {
              bottom: hero ? 6 : 2,
              "--toboggan-duration": "17s",
              animationDelay: "6s",
            } as CSSProperties
          }
        >
          <Penguin className="block h-auto w-full" />
        </span>
        {/* The igloo, seated on the snow line, doorway aglow */}
        <span
          aria-hidden="true"
          className={"pointer-events-none absolute " + (hero ? "left-6 w-32" : "left-2 w-14")}
          style={{ bottom: hero ? 8 : 3 }}
        >
          <Igloo className="block h-auto w-full" />
        </span>
        {/* A low packed drift in front, so runners and the igloo's base
            nestle into the snow instead of balancing on it */}
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute inset-x-0 bottom-0 rounded-t-full bg-[#f4f9fe]/80 blur-[1px] " +
            (hero ? "h-2.5" : "h-1")
          }
        />
      </>
    );
  },
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
 *  passes scale="hero" for proportionally larger dressing.
 *
 *  Layering: on compact cards the whole decoration layer sits BEHIND the
 *  card's content (negative z inside the style's `isolate` context) so clouds,
 *  manors and pumpkins can never obscure a display name — they're background
 *  atmosphere the text reads over. The hero header keeps decorations above
 *  its content, where dressing the banner is the point. */
export function StallOrnament({
  styleKey,
  scale = "card",
}: {
  styleKey: string | null | undefined;
  scale?: "card" | "hero";
}) {
  const ornament = resolveStallStyle(styleKey)?.ornament;
  const render = ornament ? STALL_ORNAMENTS[ornament] : undefined;
  if (!render) return null;
  if (scale === "hero") return render(true);
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {render(false)}
    </span>
  );
}
