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

/** A chunky 8-bit heart on an 11×9 grid — deliberately jagged (crispEdges),
 *  with a single highlight pixel. The HUD staple. */
function PixelHeart({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 11 9"
      className={className}
      style={style}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path
        fill="#ef4444"
        d="M1 0 H4 V1 H7 V0 H10 V1 H11 V4 H10 V5 H9 V6 H8 V7 H7 V8 H6 V9 H5 V8 H4 V7 H3 V6 H2 V5 H1 V4 H0 V1 H1 Z"
      />
      <rect x="1" y="1" width="1" height="1" fill="#fca5a5" />
    </svg>
  );
}

/** A blocky sunset-lit cloud (crispEdges), drifted slowly on the fx-fog cycle. */
function PixelCloud({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 14 5"
      className={className}
      style={style}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path d="M1 3 H3 V2 H5 V1 H9 V2 H11 V3 H13 V5 H1 Z" fill="#fecdd3" opacity="0.85" />
    </svg>
  );
}

/** A torchlit stone gate into the dark: evenodd arch silhouette, two guttering
 *  torch flames — and a pair of eyes in the doorway, glimpsed only briefly. */
function DungeonGate({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 34" className={className} aria-hidden="true">
      <path d="M8 34 V17 A12 12 0 0 1 32 17 V34 Z" fill="#0c0a09" />
      <path
        fillRule="evenodd"
        d="M2 34 V15 A18 15 0 0 1 38 15 V34 H30 V17 A10 10 0 0 0 10 17 V34 Z"
        fill="#57534e"
        stroke="#292524"
        strokeWidth="0.7"
      />
      <g stroke="#292524" strokeWidth="0.5" opacity="0.7">
        <path d="M2 24 H10 M30 24 H38 M2 29 H10 M30 29 H38" />
        <path d="M6 24 V29 M34 24 V29 M13 8 L15 11 M27 8 L25 11 M20 5 V8" />
      </g>
      {/* Torches: bracket, then a flame that gutters fast */}
      <path d="M5.2 21 h1.6 v-3 h-1.6 Z M33.2 21 h1.6 v-3 h-1.6 Z" fill="#78350f" />
      <path
        className="fx-twinkle"
        d="M6 18 C4.6 16.2 5 14.4 6 13 C7 14.4 7.4 16.2 6 18 Z"
        fill="#fb923c"
        style={{ animationDuration: "0.9s" }}
      />
      <path
        className="fx-twinkle"
        d="M34 18 C32.6 16.2 33 14.4 34 13 C35 14.4 35.4 16.2 34 18 Z"
        fill="#fb923c"
        style={{ animationDuration: "1.1s", animationDelay: "0.4s" }}
      />
      {/* The eyes. They were always there. */}
      <g className="fx-peek" fill="#fbbf24">
        <circle cx="17.5" cy="26" r="1" />
        <circle cx="22.5" cy="26" r="1" />
      </g>
    </svg>
  );
}

/** A treasure chest whose lid creaks open on a long cycle; the light beam and
 *  sparkle share the same clock so they only shine while it's open. */
function LootChest({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 30" className={className} aria-hidden="true">
      {/* The beam and sparkle, behind the lid */}
      <g className="fx-chest-beam">
        <path d="M11 17 L6 0 H34 L29 17 Z" fill="#fde68a" opacity="0.55" />
        <path
          d="M20 2 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2 Z"
          fill="#ffffff"
        />
      </g>
      <rect x="6" y="16" width="28" height="12" rx="1.5" fill="#92400e" stroke="#451a03" strokeWidth="0.8" />
      <path d="M13 16 V28 M27 16 V28" stroke="#78350f" strokeWidth="0.7" />
      <rect x="18" y="16" width="4" height="12" fill="#fbbf24" stroke="#b45309" strokeWidth="0.6" />
      <g className="fx-chest-lid">
        <path
          d="M6 16 C6 9.5 12 6 20 6 C28 6 34 9.5 34 16 Z"
          fill="#a16207"
          stroke="#451a03"
          strokeWidth="0.8"
        />
        <path d="M18 6.4 H22 V16 H18 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="0.6" />
        <circle cx="20" cy="13" r="1.4" fill="#78350f" />
      </g>
    </svg>
  );
}

/** A save crystal on its pedestal, aura breathing softly. */
function SaveCrystal({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 30" className={className} aria-hidden="true">
      <ellipse
        className="fx-crystal"
        cx="12"
        cy="13"
        rx="9"
        ry="11"
        fill="#4ade80"
        opacity="0.25"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <path
        d="M12 2 L19 12 L12 24 L5 12 Z"
        fill="#86efac"
        stroke="#16a34a"
        strokeWidth="0.8"
      />
      <path d="M12 2 V24 M5 12 H19" stroke="#16a34a" strokeWidth="0.5" opacity="0.5" />
      <path d="M9.4 8 L12 4.4 L13.4 6.4 Z" fill="#ffffff" opacity="0.6" />
      <path d="M4 26 H20 L18 29 H6 Z" fill="#57534e" stroke="#292524" strokeWidth="0.6" />
    </svg>
  );
}

/** A tropical fish facing left: teardrop body, a white band, a dorsal fin,
 *  and a tail that wags steadily on the fx-fin cycle. Colour per fish. */
function Fish({
  color,
  className = "",
  style,
}: {
  color: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 26 14" className={className} style={style} aria-hidden="true">
      <path className="fx-fin" d="M19 7 L25.5 3 L24 7 L25.5 11 Z" fill={color} opacity="0.9" />
      <path d="M8 3.6 C9.5 1.8 12 1.4 13.8 2.4 L11.2 4.4 Z" fill={color} opacity="0.85" />
      <path
        d="M1.5 7 C4.5 3 9.5 2 14 3.2 C17.5 4.2 19.5 5.8 19.5 7 C19.5 8.2 17.5 9.8 14 10.8 C9.5 12 4.5 11 1.5 7 Z"
        fill={color}
      />
      <path
        d="M9.5 3.2 C11.3 5.4 11.3 8.6 9.5 10.8 L12 10.3 C13.3 8.4 13.3 5.6 12 3.7 Z"
        fill="#f8fafc"
        opacity="0.85"
      />
      <circle cx="4.6" cy="6.2" r="1" fill="#0f172a" />
      <circle cx="4.3" cy="5.9" r="0.35" fill="#f8fafc" />
    </svg>
  );
}

/** The reef floor: a sand mound, rocks, branching coral, a brain coral, and
 *  seaweed fronds swaying on staggered currents. */
function CoralBed({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 22" className={className} aria-hidden="true">
      {/* Seaweed first, so the corals overlap its roots */}
      <g fill="none" stroke="#34d399" strokeWidth="1.6" strokeLinecap="round">
        <path className="fx-sway" d="M8 21 C6.5 17 9 13 7.5 8" />
        <path
          className="fx-sway"
          d="M12 21 C13.5 17.5 11 14 12.5 10"
          style={{ animationDelay: "-2.2s", animationDuration: "4.2s" }}
        />
        <path
          className="fx-sway"
          d="M50 21 C48.5 17 51 12.5 49.5 7"
          style={{ animationDelay: "-1.1s", animationDuration: "5.6s" }}
        />
      </g>
      {/* Sand */}
      <path d="M0 22 C10 18.5 24 20.5 36 19 C46 17.8 54 19.5 60 18.5 L60 22 Z" fill="#d8c690" opacity="0.8" />
      <ellipse cx="24" cy="20.5" rx="4" ry="1.6" fill="#78716c" opacity="0.9" />
      <ellipse cx="42" cy="21" rx="2.6" ry="1.2" fill="#57534e" opacity="0.9" />
      {/* Branching coral */}
      <g fill="none" stroke="#fb7185" strokeWidth="1.7" strokeLinecap="round">
        <path d="M31 20.5 C31 16.5 29 14.5 28 12 M31 17.5 C32.5 15.5 33.5 14 33.8 11.5 M33 16.8 C34.8 15.8 35.8 14.6 36.2 13" />
      </g>
      {/* Brain coral */}
      <path d="M48 21.5 C46 18 48.5 15 52 15.2 C55.5 15.4 57.5 18.2 56 21.5 Z" fill="#fb923c" />
      <path
        d="M49.5 18.6 C51 17.4 53.5 17.3 55 18.4 M50 20.2 C51.5 19.2 53.5 19.2 54.8 20"
        fill="none"
        stroke="#c2410c"
        strokeWidth="0.7"
        opacity="0.8"
      />
    </svg>
  );
}

/** A flying saucer: glass dome (with a small green pilot), metallic disc, and
 *  three running lights rippling underneath. */
function Ufo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 16" className={className} aria-hidden="true">
      <path d="M11.5 8 A6.5 5.5 0 0 1 24.5 8 Z" fill="#a5f3fc" opacity="0.85" />
      <path d="M13 5.5 A5 4 0 0 1 18 3" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.7" strokeLinecap="round" />
      {/* The pilot */}
      <circle cx="18" cy="5.6" r="1.9" fill="#4ade80" />
      <circle cx="17.2" cy="5.3" r="0.45" fill="#0f172a" />
      <circle cx="18.8" cy="5.3" r="0.45" fill="#0f172a" />
      {/* The disc */}
      <ellipse cx="18" cy="10.6" rx="16" ry="3.6" fill="#475569" />
      <ellipse cx="18" cy="9.4" rx="16" ry="3.8" fill="#cbd5e1" />
      <ellipse cx="12" cy="8.6" rx="6" ry="1.4" fill="#ffffff" opacity="0.45" />
      {/* Running lights */}
      <circle className="fx-twinkle" cx="8" cy="11.6" r="1.2" fill="#fde047" style={{ animationDuration: "0.7s" }} />
      <circle className="fx-twinkle" cx="18" cy="12.6" r="1.2" fill="#fde047" style={{ animationDuration: "0.7s", animationDelay: "0.23s" }} />
      <circle className="fx-twinkle" cx="28" cy="11.6" r="1.2" fill="#fde047" style={{ animationDuration: "0.7s", animationDelay: "0.46s" }} />
    </svg>
  );
}

/** A ringed gas giant, banded and tilted; the ring passes behind the planet
 *  and back in front. */
function RingedPlanet({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={className} aria-hidden="true">
      <g transform="rotate(-18 20 12)">
        <ellipse cx="20" cy="12" rx="15" ry="4.5" fill="none" stroke="#c4b5fd" strokeWidth="1.4" opacity="0.7" />
        <circle cx="20" cy="12" r="8" fill="#fbbf24" />
        <path d="M12.6 9.4 C17 8 23 8 27.4 9.4 M12 13 C17 14.6 23 14.6 28 13 M14 16 C17.8 17.2 22.2 17.2 26 16" fill="none" stroke="#d97706" strokeWidth="1" opacity="0.8" />
        <path d="M20 4 A8 8 0 0 1 28 12 A8 8 0 0 1 25.6 17.7 C27.5 14 27 8 23 5 Z" fill="#78350f" opacity="0.35" />
        <path d="M5 12 A15 4.5 0 0 0 35 12" fill="none" stroke="#c4b5fd" strokeWidth="1.4" opacity="0.85" />
      </g>
    </svg>
  );
}

/** A galloping golden pup chasing a red ball — both in one SVG so the chase
 *  shares one clock. Facing left, ears back, tongue out, tail wagging. */
function PuppyChase({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 46 20" className={className} aria-hidden="true">
      {/* The ball, just out of reach */}
      <circle cx="5" cy="15.5" r="3" fill="#ef4444" />
      <path d="M3.4 13.6 A2.4 2.4 0 0 1 6 13.2" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
      {/* Tail, wagging hard */}
      <path
        className="fx-wag"
        d="M39 8.5 C41 6.5 42.4 4.5 42 2.5 C41.9 1.7 42.9 1.5 43.2 2.3 C43.8 4.8 42.4 7.6 40 9.5 Z"
        fill="#e3a857"
      />
      {/* Legs stretched mid-gallop */}
      <g fill="#e3a857" stroke="#8a5a2b" strokeWidth="0.4">
        <path d="M22.5 12.5 L18.5 17.5 L20 18.3 L24 13.5 Z" />
        <path d="M36 12.8 L40 17.5 L38.5 18.4 L34.5 13.6 Z" />
        <path d="M25.5 13 L24.5 17.8 L26.1 18.1 L27.5 13.6 Z" />
        <path d="M33 13.2 L34.5 17.8 L32.9 18.2 L31.5 13.6 Z" />
      </g>
      {/* Body and head */}
      <path
        d="M20 9.5 C22 6.5 27.5 5.5 31.5 6 C35.5 6.5 38.5 7.8 39.5 10 C40.3 11.8 39.3 13.4 37.5 13.8 L23.5 13.8 C21.3 13.8 19.7 11.8 20 9.5 Z"
        fill="#e3a857"
        stroke="#8a5a2b"
        strokeWidth="0.5"
      />
      <circle cx="19.5" cy="8.2" r="3.8" fill="#e3a857" stroke="#8a5a2b" strokeWidth="0.5" />
      {/* Muzzle, nose, tongue */}
      <ellipse cx="16.6" cy="9.2" rx="2.2" ry="1.7" fill="#f2d3a0" />
      <circle cx="15.2" cy="8.6" r="0.8" fill="#3f2a12" />
      <path d="M16.2 10.6 C15.8 11.8 16.4 12.6 17.4 12.4 C17.2 11.6 17 10.9 17 10.4 Z" fill="#f472b6" />
      {/* Floppy ear, flying back */}
      <path d="M20.5 5 C23 4 25.5 4.8 26 7 C24 7.6 22 7.4 20.5 6.6 Z" fill="#8a5a2b" />
      <circle cx="18.6" cy="7.2" r="0.7" fill="#3f2a12" />
      <circle cx="18.4" cy="7" r="0.25" fill="#ffffff" />
    </svg>
  );
}

/** A little red doghouse with an arched door and a bone over the doorway. */
function Doghouse({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 30" className={className} aria-hidden="true">
      <path d="M4 13 L18 3 L32 13 L32 30 L4 30 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.8" />
      <path d="M1.5 14.5 L18 2 L34.5 14.5 L33 16.5 L18 5 L3 16.5 Z" fill="#7f1d1d" />
      <path d="M12 30 V21 A6 6 0 0 1 24 21 V30 Z" fill="#450a0a" />
      {/* The bone over the door */}
      <g fill="#fef3c7" stroke="#d6cbb2" strokeWidth="0.4">
        <circle cx="14" cy="16.2" r="1.1" />
        <circle cx="14" cy="18" r="1.1" />
        <rect x="14" y="16.3" width="8" height="1.6" rx="0.8" />
        <circle cx="22" cy="16.2" r="1.1" />
        <circle cx="22" cy="18" r="1.1" />
      </g>
    </svg>
  );
}

/** A cat curled up asleep on a cushion: tail wrapped round, ears up, eyes
 *  closed — the body breathes slowly. */
function CurledCat({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 19" className={className} aria-hidden="true">
      <ellipse cx="15" cy="15.5" rx="13.5" ry="3.2" fill="#f472b6" opacity="0.85" />
      <ellipse cx="15" cy="14.6" rx="13.5" ry="3" fill="#f9a8d4" />
      <g className="fx-breathe">
        <circle cx="14.5" cy="9.5" r="6.3" fill="#a8a29e" stroke="#78716c" strokeWidth="0.5" />
        {/* Stripes along the curl */}
        <path d="M10.5 4.6 C11.5 6 11.8 7.6 11.4 9 M14.8 3.4 C15.4 4.8 15.6 6.2 15.4 7.4" fill="none" stroke="#78716c" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />
        {/* Tail wrapped around the front */}
        <path d="M8.6 11.5 C10.5 14.6 16 15.6 20.5 13.6 C21.4 13.2 21.9 14.2 21.1 14.8 C16 17.4 9.3 16 7.4 12.4 Z" fill="#78716c" />
        {/* Head resting on the curl */}
        <circle cx="19.8" cy="10.8" r="3.4" fill="#a8a29e" stroke="#78716c" strokeWidth="0.5" />
        <path d="M17.4 8.4 L17.7 6 L19.5 7.6 Z" fill="#a8a29e" stroke="#78716c" strokeWidth="0.4" />
        <path d="M21.6 7.9 L22.7 5.8 L23.6 8.2 Z" fill="#a8a29e" stroke="#78716c" strokeWidth="0.4" />
        {/* Closed eyes + nose */}
        <path d="M18.2 10.6 Q18.9 11.2 19.6 10.6 M20.9 10.6 Q21.6 11.2 22.3 10.6" fill="none" stroke="#44403c" strokeWidth="0.5" strokeLinecap="round" />
        <path d="M19.9 12 L20.5 12 L20.2 12.5 Z" fill="#f472b6" />
      </g>
    </svg>
  );
}

/** A little butterfly, wings on the bat's flap cycle, wandering on drift. */
function Butterfly({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 12 10" className={className} style={style} aria-hidden="true">
      <path
        className="fx-flap-l"
        d="M6 5 C4.5 2 1.5 1.5 1 4 C0.7 5.8 2.5 7.5 6 5.6 Z"
        fill="#c084fc"
        stroke="#a855f7"
        strokeWidth="0.4"
      />
      <path
        className="fx-flap-r"
        d="M6 5 C7.5 2 10.5 1.5 11 4 C11.3 5.8 9.5 7.5 6 5.6 Z"
        fill="#c084fc"
        stroke="#a855f7"
        strokeWidth="0.4"
      />
      <ellipse cx="6" cy="5.4" rx="0.7" ry="2" fill="#581c87" />
    </svg>
  );
}

/** A ball of yarn with a loose thread trailing off. */
function YarnBall({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden="true">
      <circle cx="6" cy="6.5" r="4.8" fill="#f472b6" />
      <path
        d="M2 4.8 C4.5 3.4 8 3.6 10.4 5.4 M1.6 7.4 C4.5 6.2 8.2 6.6 10.4 8.4 M3.4 10.2 C5.5 8.8 8 8.8 9.6 9.8"
        fill="none"
        stroke="#be185d"
        strokeWidth="0.7"
        opacity="0.8"
      />
      <path d="M10.6 7.5 C13 8 14 9.5 13.2 11 C14.8 10.6 15.6 8.8 14.6 7.4 C13.6 6 11.8 6.4 10.6 7.5" fill="none" stroke="#be185d" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

/** A pirate ship in profile, sails full, black flag flying — rides the swell
 *  via fx-bob on its wrapper. Faces left; mirror for the other side. */
function PirateShip({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 34" className={className} aria-hidden="true">
      {/* Masts */}
      <path d="M14 5.5 V24.5 M26 9 V24.5" stroke="#451a03" strokeWidth="1" />
      {/* Sails, catching the wind */}
      <path d="M14 7 C8 10.5 7.5 17.5 13.4 21.5 L14 21.5 Z" fill="#f5f0e1" stroke="#d6cbb2" strokeWidth="0.5" />
      <path d="M26 10.5 C21.5 13.2 21.2 18.5 25.5 21.5 L26 21.5 Z" fill="#f5f0e1" stroke="#d6cbb2" strokeWidth="0.5" />
      <path d="M14 7.5 C18 9.5 19 15 15 21 L14 21 Z" fill="#ede4cf" stroke="#d6cbb2" strokeWidth="0.5" />
      {/* The colours: a black flag, and no mistaking it */}
      <path d="M14 5 L21.5 6.5 L14 8.5 Z" fill="#1c1917" />
      <circle cx="16.2" cy="6.8" r="0.75" fill="#f8fafc" />
      <path d="M15.4 7.8 L17 7.8 M15.6 7.3 L16.8 8.2 M16.8 7.3 L15.6 8.2" stroke="#f8fafc" strokeWidth="0.3" />
      {/* Hull */}
      <path
        d="M4 24 L36 24 C35 28.5 29 31.5 20 31.5 C11 31.5 5.5 28.5 4 24 Z"
        fill="#78350f"
        stroke="#451a03"
        strokeWidth="0.7"
      />
      <path d="M4.6 26 C13 27.6 27 27.6 35.2 26" fill="none" stroke="#451a03" strokeWidth="0.6" opacity="0.8" />
      {/* Gunports */}
      <rect x="12" y="25" width="2" height="2" fill="#1c1917" />
      <rect x="19" y="25.4" width="2" height="2" fill="#1c1917" />
      <rect x="26" y="25" width="2" height="2" fill="#1c1917" />
      {/* Bowsprit */}
      <path d="M4.5 24 L0.5 20.5" stroke="#451a03" strokeWidth="0.9" strokeLinecap="round" />
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
  "pixel-hearts": (size) => {
    const w = Math.max(9, Math.round(size * 0.26));
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2"
        style={{ top: -Math.round(size * 0.18), gap: Math.max(2, Math.round(size * 0.06)) }}
      >
        <PixelHeart className="block h-auto" style={{ width: w }} />
        <PixelHeart className="block h-auto" style={{ width: w }} />
        {/* The last heart — you're at low HP */}
        <PixelHeart className="fx-arcade-blink block h-auto" style={{ width: w }} />
      </span>
    );
  },
  "boss-bar": () => (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
    >
      <circle cx="24" cy="24" r="21.5" fill="none" stroke="#3f3f46" strokeWidth="2.6" />
      <circle
        className="fx-hp"
        cx="24"
        cy="24"
        r="21.5"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2.6"
        pathLength={100}
        strokeDasharray="100"
        strokeLinecap="round"
      />
      {/* Phase ticks over the bar */}
      <circle
        cx="24"
        cy="24"
        r="21.5"
        fill="none"
        stroke="#09090b"
        strokeWidth="2.6"
        pathLength={100}
        strokeDasharray="0.9 24.1"
        opacity="0.55"
      />
    </svg>
  ),
  "face-buttons": (size) => {
    const d = Math.max(6, Math.round(size * 0.17));
    const off = -Math.round(d * 0.35);
    const dot = (color: string, style: CSSProperties, key: number) => (
      <span
        key={key}
        className="absolute rounded-full"
        style={{
          width: d,
          height: d,
          backgroundColor: color,
          boxShadow: `0 0 ${Math.round(d * 0.7)}px ${color}88, inset 0 -1px 1px rgba(0,0,0,0.45)`,
          ...style,
        }}
      />
    );
    return (
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        {dot("#fbbf24", { top: off, left: "50%", transform: "translateX(-50%)" }, 0)}
        {dot("#f87171", { top: "50%", right: off, transform: "translateY(-50%)" }, 1)}
        {dot("#4ade80", { bottom: off, left: "50%", transform: "translateX(-50%)" }, 2)}
        {dot("#60a5fa", { top: "50%", left: off, transform: "translateY(-50%)" }, 3)}
      </span>
    );
  },
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
  arcade: (hero) => (
    <>
      <LightString colors={["#f472b6", "#22d3ee", "#a78bfa"]} hero={hero} />
      {/* Attract-mode screen glow flickering in the corner */}
      <span
        aria-hidden="true"
        className={
          "fx-twinkle pointer-events-none absolute rounded " +
          (hero ? "left-8 top-8 h-10 w-16" : "left-3 top-4 h-4 w-7")
        }
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(34,211,238,0.5), rgba(34,211,238,0.06) 70%)",
          animationDuration: "5.2s",
        }}
      />
      <span
        aria-hidden="true"
        className={
          "fx-arcade-blink pointer-events-none absolute font-mono font-bold tracking-[0.2em] text-[#fde047] " +
          (hero ? "bottom-3 right-6 text-sm" : "bottom-1 right-2 text-[7px]")
        }
      >
        INSERT COIN
      </span>
    </>
  ),
  "pixel-sunset": (hero) => (
    <>
      {/* The chunky sun, sinking behind the horizon */}
      <svg
        viewBox="0 0 16 9"
        aria-hidden="true"
        shapeRendering="crispEdges"
        className={
          "pointer-events-none absolute " + (hero ? "bottom-3 right-10 w-24" : "bottom-1 right-5 w-10")
        }
      >
        <path
          d="M5 0 H11 V1 H13 V2 H14 V3 H15 V4 H16 V9 H0 V4 H1 V3 H2 V2 H3 V1 H5 Z"
          fill="#fde047"
        />
        <path d="M0 6 H16 V9 H0 Z" fill="#fb923c" opacity="0.9" />
      </svg>
      {/* Blocky clouds on the breeze */}
      <PixelCloud
        className={
          "fx-fog pointer-events-none absolute " + (hero ? "left-10 top-6 w-28" : "left-4 top-2 w-12")
        }
      />
      <PixelCloud
        className={
          "fx-fog pointer-events-none absolute " + (hero ? "left-[55%] top-12 w-20" : "left-[52%] top-5 w-9")
        }
        style={{ animationDelay: "-8s" }}
      />
      {/* The horizon strip */}
      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#3b0764]/80 to-transparent " +
          (hero ? "h-4" : "h-2")
        }
      />
    </>
  ),
  dungeon: (hero) => (
    <span
      aria-hidden="true"
      className={"pointer-events-none absolute bottom-0 " + (hero ? "right-8 w-36" : "right-2 w-16")}
    >
      <DungeonGate className="block h-auto w-full" />
    </span>
  ),
  "loot-chest": (hero) => (
    <span
      aria-hidden="true"
      className={
        "pointer-events-none absolute " + (hero ? "bottom-2 right-8 w-24" : "bottom-0.5 right-3 w-11")
      }
    >
      <LootChest className="block h-auto w-full" />
    </span>
  ),
  starfield: (hero) => {
    const stars = [
      { top: "16%", size: 2, dur: 6, delay: -1, base: "20%" },
      { top: "34%", size: 3, dur: 4.5, delay: -3, base: "55%" },
      { top: "10%", size: 2, dur: 7.5, delay: -5, base: "75%" },
      { top: "48%", size: 2, dur: 5.5, delay: -2, base: "38%" },
      { top: "26%", size: 3, dur: 3.8, delay: -0.5, base: "85%" },
      { top: "40%", size: 2, dur: 8, delay: -6, base: "10%" },
    ];
    return (
      <>
        {stars.map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="fx-stream pointer-events-none absolute rounded-full bg-[#e0f2fe]"
            style={
              {
                left: s.base,
                top: s.top,
                width: hero ? s.size * 2 : s.size,
                height: hero ? s.size * 2 : s.size,
                boxShadow: "0 0 4px #bae6fd",
                "--stream-duration": `${s.dur}s`,
                animationDelay: `${s.delay}s`,
              } as CSSProperties
            }
          />
        ))}
        {/* One star going properly fast — bright head, trailing tail */}
        <span
          aria-hidden="true"
          className="fx-stream pointer-events-none absolute"
          style={
            {
              left: "60%",
              top: "22%",
              "--stream-duration": "3.2s",
              animationDelay: "-1.5s",
            } as CSSProperties
          }
        >
          <span
            className="block rounded-full"
            style={{
              width: hero ? 56 : 26,
              height: hero ? 3 : 2,
              background: "linear-gradient(90deg, #ffffff, rgba(224,242,254,0))",
              boxShadow: "0 0 6px rgba(186,230,253,0.8)",
            }}
          />
        </span>
      </>
    );
  },
  "save-point": (hero) => (
    <span
      aria-hidden="true"
      className={
        "pointer-events-none absolute " + (hero ? "bottom-2 right-10 w-16" : "bottom-0.5 right-4 w-7")
      }
    >
      <SaveCrystal className="block h-auto w-full" />
    </span>
  ),
  aquarium: (hero) => {
    const bubbles = [
      { left: "22%", bottom: "18%", size: 4, dur: 4.6, delay: 0 },
      { left: "46%", bottom: "12%", size: 3, dur: 5.8, delay: 1.8 },
      { left: "58%", bottom: "20%", size: 5, dur: 5, delay: 3.2 },
      { left: "80%", bottom: "16%", size: 3, dur: 6.4, delay: 0.9 },
      { left: "86%", bottom: "24%", size: 4, dur: 4.2, delay: 4.1 },
    ];
    return (
      <>
        {/* Light glinting near the surface */}
        {[
          { left: "26%", top: "12%", d: "0s" },
          { left: "54%", top: "8%", d: "1.2s" },
          { left: "78%", top: "14%", d: "2.4s" },
        ].map((s, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="fx-twinkle pointer-events-none absolute rounded-full bg-[#a5f3fc]"
            style={{
              left: s.left,
              top: s.top,
              width: hero ? 4 : 2,
              height: hero ? 4 : 2,
              boxShadow: `0 0 ${hero ? 8 : 4}px #67e8f9`,
              animationDelay: s.d,
            }}
          />
        ))}
        {/* Bubbles rising off the reef */}
        {bubbles.map((b, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="fx-bubble pointer-events-none absolute rounded-full border border-[#bae6fd]/80 bg-[#e0f2fe]/20"
            style={
              {
                left: b.left,
                bottom: b.bottom,
                width: hero ? b.size * 2 : b.size,
                height: hero ? b.size * 2 : b.size,
                "--bubble-rise": hero ? "-90px" : "-32px",
                "--bubble-duration": `${b.dur}s`,
                animationDelay: `${b.delay}s`,
              } as CSSProperties
            }
          />
        ))}
        {/* The fish: two cruising left on different clocks, one contrarian
            heading right — all entering and exiting past the card's edges */}
        <span
          aria-hidden="true"
          className={"fx-swim pointer-events-none absolute " + (hero ? "w-16" : "w-8")}
          style={{ top: hero ? "26%" : "22%" } as CSSProperties}
        >
          <Fish color="#fb923c" className="block h-auto w-full" />
        </span>
        <span
          aria-hidden="true"
          className={"fx-swim pointer-events-none absolute " + (hero ? "w-11" : "w-6")}
          style={
            {
              top: hero ? "48%" : "44%",
              "--swim-duration": "23s",
              animationDelay: "9s",
            } as CSSProperties
          }
        >
          <Fish color="#60a5fa" className="block h-auto w-full" />
        </span>
        <span
          aria-hidden="true"
          className={"fx-swim-r pointer-events-none absolute " + (hero ? "w-9" : "w-5")}
          style={
            {
              top: hero ? "38%" : "34%",
              "--swim-duration": "28s",
              animationDelay: "4s",
            } as CSSProperties
          }
        >
          <Fish color="#facc15" className="block h-auto w-full -scale-x-100" />
        </span>
        {/* The reef floor */}
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute bottom-0 " + (hero ? "right-6 w-56" : "right-1 w-24")
          }
        >
          <CoralBed className="block h-auto w-full" />
        </span>
      </>
    );
  },
  space: (hero) => (
    <>
      {/* A field of resting micro-stars */}
      {[
        { left: "8%", top: "24%" },
        { left: "18%", top: "62%" },
        { left: "30%", top: "14%" },
        { left: "42%", top: "48%" },
        { left: "55%", top: "70%" },
        { left: "64%", top: "20%" },
        { left: "76%", top: "56%" },
        { left: "90%", top: "34%" },
      ].map((s, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-[#e0e7ff]"
          style={{ left: s.left, top: s.top, width: hero ? 2.5 : 1.5, height: hero ? 2.5 : 1.5, opacity: 0.7 }}
        />
      ))}
      {/* …and a few that twinkle */}
      {[
        { left: "24%", top: "34%", d: "0s" },
        { left: "48%", top: "10%", d: "0.9s" },
        { left: "70%", top: "42%", d: "1.7s" },
        { left: "85%", top: "14%", d: "2.6s" },
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
      {/* The neighbourhood: a ringed giant and a small red rock */}
      <span
        aria-hidden="true"
        className={"pointer-events-none absolute " + (hero ? "right-14 top-4 w-28" : "right-7 top-1 w-12")}
      >
        <RingedPlanet className="block h-auto w-full" />
      </span>
      <span aria-hidden="true" className={"pointer-events-none absolute " + (hero ? "left-12 top-[52%]" : "left-5 top-[48%]")}>
        <svg viewBox="0 0 10 10" className={hero ? "h-9 w-9" : "h-4 w-4"} aria-hidden="true">
          <circle cx="5" cy="5" r="4.6" fill="#f87171" />
          <circle cx="3.6" cy="4" r="1" fill="#b91c1c" opacity="0.8" />
          <circle cx="6.4" cy="6.6" r="0.8" fill="#b91c1c" opacity="0.8" />
          <circle cx="6.6" cy="3.2" r="0.6" fill="#b91c1c" opacity="0.7" />
        </svg>
      </span>
      {/* And, on no schedule anyone can predict, the visitor */}
      <span
        aria-hidden="true"
        className={"fx-ufo pointer-events-none absolute " + (hero ? "w-20" : "w-10")}
        style={{ top: hero ? "30%" : "26%" } as CSSProperties}
      >
        <Ufo className="block h-auto w-full" />
      </span>
    </>
  ),
  "puppy-park": (hero) => (
    <>
      {/* A soft summer cloud */}
      <span
        aria-hidden="true"
        className={
          "fx-fog pointer-events-none absolute rounded-full bg-[#ffffff]/50 blur-[2px] " +
          (hero ? "left-[14%] top-4 h-5 w-24" : "left-[12%] top-1.5 h-2.5 w-10")
        }
      />
      {/* The lawn */}
      <svg
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
        aria-hidden="true"
        className={"pointer-events-none absolute inset-x-0 bottom-0 " + (hero ? "h-6" : "h-2.5")}
      >
        <path d="M0 5 C15 2.5 32 6.5 50 4.5 C68 2.5 84 6.5 100 4.5 L100 12 L0 12 Z" fill="#86efac" opacity="0.75" />
        <path d="M0 8 C20 6 45 9.5 70 7.5 C82 6.6 92 7.8 100 7 L100 12 L0 12 Z" fill="#4ade80" opacity="0.6" />
      </svg>
      {/* Paw prints wandering off across the grass */}
      {[
        { left: "34%", up: 0, o: 0.45 },
        { left: "46%", up: 2, o: 0.35 },
        { left: "58%", up: 0, o: 0.25 },
      ].map((p, i) => (
        <svg
          key={i}
          viewBox="0 0 8 8"
          aria-hidden="true"
          className={"pointer-events-none absolute " + (hero ? "h-4 w-4" : "h-2 w-2")}
          style={{ left: p.left, bottom: (hero ? 8 : 3) + p.up * (hero ? 3 : 1), opacity: p.o }}
        >
          <g fill="#92400e">
            <ellipse cx="4" cy="5.4" rx="2" ry="1.6" />
            <circle cx="1.6" cy="2.9" r="0.9" />
            <circle cx="4" cy="2.2" r="0.9" />
            <circle cx="6.4" cy="2.9" r="0.9" />
          </g>
        </svg>
      ))}
      {/* The chase — ball first, pup at a full gallop behind it */}
      <span
        aria-hidden="true"
        className={"fx-scamper pointer-events-none absolute " + (hero ? "w-24" : "w-12")}
        style={{ bottom: hero ? 8 : 3 }}
      >
        <PuppyChase className="block h-auto w-full" />
      </span>
      {/* Home base */}
      <span
        aria-hidden="true"
        className={"pointer-events-none absolute " + (hero ? "left-8 w-20" : "left-2 w-9")}
        style={{ bottom: hero ? 4 : 1 }}
      >
        <Doghouse className="block h-auto w-full" />
      </span>
    </>
  ),
  "cat-nap": (hero) => (
    <>
      {/* The sunbeam falling on the corner */}
      <span
        aria-hidden="true"
        className={"pointer-events-none absolute " + (hero ? "right-4 top-0 h-full w-64" : "right-0 top-0 h-full w-28")}
        style={{
          background:
            "radial-gradient(ellipse at 70% 90%, rgba(253,224,71,0.3), transparent 65%)",
        }}
      />
      {/* Zzz drifting up from the sleeper */}
      {[
        { right: hero ? 88 : 38, size: hero ? 13 : 7, delay: 0 },
        { right: hero ? 76 : 33, size: hero ? 16 : 8, delay: 1.7 },
        { right: hero ? 96 : 42, size: hero ? 11 : 6, delay: 3.4 },
      ].map((z, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="fx-bubble pointer-events-none absolute font-serif font-bold italic text-[#a78bfa]"
          style={
            {
              right: z.right,
              bottom: hero ? 56 : 24,
              fontSize: z.size,
              lineHeight: 1,
              "--bubble-rise": hero ? "-36px" : "-16px",
              "--bubble-duration": "5.2s",
              animationDelay: `${z.delay}s`,
            } as CSSProperties
          }
        >
          z
        </span>
      ))}
      {/* The butterfly it is pointedly ignoring */}
      <span
        aria-hidden="true"
        className={"fx-drift pointer-events-none absolute " + (hero ? "left-16 top-6 w-9" : "left-6 top-2 w-4")}
      >
        <Butterfly className="block h-auto w-full" />
      </span>
      {/* Yarn, abandoned mid-game */}
      <span
        aria-hidden="true"
        className={"pointer-events-none absolute " + (hero ? "left-24 bottom-3 w-12" : "left-10 bottom-1 w-5")}
      >
        <YarnBall className="block h-auto w-full" />
      </span>
      {/* The cat, dead to the world */}
      <span
        aria-hidden="true"
        className={"pointer-events-none absolute " + (hero ? "right-14 bottom-2 w-32" : "right-4 bottom-0.5 w-14")}
      >
        <CurledCat className="block h-auto w-full" />
      </span>
    </>
  ),
  "high-seas": (hero) => (
    <>
      {/* A gull riding the wind */}
      <svg
        viewBox="0 0 10 4"
        aria-hidden="true"
        className={"fx-drift pointer-events-none absolute " + (hero ? "left-[30%] top-5 w-7" : "left-[28%] top-2 w-3")}
      >
        <path d="M0.5 2.5 Q2.5 0.5 5 2.2 Q7.5 0.5 9.5 2.5" fill="none" stroke="#f8fafc" strokeWidth="0.7" strokeLinecap="round" opacity="0.85" />
      </svg>
      {/* The sea, in layers: a solid base so there is unmistakably water,
          then a back crest. The ships sit BETWEEN the bands so their hulls
          ride in the water, not on top of it. */}
      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#155e75]/85 via-[#0e7490]/70 to-transparent " +
          (hero ? "h-9" : "h-4")
        }
      />
      <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        aria-hidden="true"
        className={"pointer-events-none absolute inset-x-0 bottom-0 " + (hero ? "h-10" : "h-4")}
      >
        <path d="M0 4 C10 1.5 22 6 34 3.5 C46 1 58 5.5 70 3 C82 0.8 92 4.5 100 2.5 L100 10 L0 10 Z" fill="#0e7490" opacity="0.85" />
      </svg>
      {/* The distant ship, hull settled behind the mid swell */}
      <span
        aria-hidden="true"
        className={"fx-bob pointer-events-none absolute opacity-80 " + (hero ? "left-10 w-20" : "left-2 w-9")}
        style={{ bottom: hero ? 26 : 10, animationDelay: "-2.5s" }}
      >
        <PirateShip className="block h-auto w-full -scale-x-100" />
      </span>
      <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        aria-hidden="true"
        className={"pointer-events-none absolute inset-x-0 bottom-0 " + (hero ? "h-9" : "h-3.5")}
      >
        <path d="M0 3 C14 5.5 28 1 44 3.5 C60 6 74 1.5 88 4 C93 4.8 97 4 100 4.5 L100 10 L0 10 Z" fill="#0891b2" opacity="0.7" />
      </svg>
      {/* The flagship, in the thick of it */}
      <span
        aria-hidden="true"
        className={"fx-bob pointer-events-none absolute " + (hero ? "right-10 w-32" : "right-2 w-14")}
        style={{ bottom: hero ? 6 : 1 }}
      >
        <PirateShip className="block h-auto w-full" />
      </span>
      {/* The exchange: each shot flashes off its own gun deck, arcs the gap,
          and drops with a fade just short of the enemy. Flash and ball share
          a clock per ship; the reply runs on an offset one. */}
      <span
        aria-hidden="true"
        className="fx-cannon-flash pointer-events-none absolute rounded-full"
        style={{
          left: "70%",
          bottom: hero ? 44 : 17,
          width: hero ? 14 : 7,
          height: hero ? 14 : 7,
          background: "radial-gradient(circle, #fde047, rgba(251,146,60,0.5) 60%, transparent)",
        }}
      />
      <span
        aria-hidden="true"
        className="fx-cannon-l pointer-events-none absolute rounded-full bg-[#1c1917]"
        style={{
          bottom: hero ? 46 : 18,
          width: hero ? 7 : 3.5,
          height: hero ? 7 : 3.5,
          boxShadow: "0 0 3px rgba(0,0,0,0.6)",
        }}
      />
      <span
        aria-hidden="true"
        className="fx-cannon-flash pointer-events-none absolute rounded-full"
        style={
          {
            left: "24%",
            bottom: hero ? 52 : 20,
            width: hero ? 11 : 6,
            height: hero ? 11 : 6,
            background: "radial-gradient(circle, #fde047, rgba(251,146,60,0.5) 60%, transparent)",
            "--cannon-duration": "13s",
            animationDelay: "5s",
          } as CSSProperties
        }
      />
      <span
        aria-hidden="true"
        className="fx-cannon-r pointer-events-none absolute rounded-full bg-[#1c1917]"
        style={
          {
            bottom: hero ? 52 : 20,
            width: hero ? 6 : 3,
            height: hero ? 6 : 3,
            boxShadow: "0 0 3px rgba(0,0,0,0.6)",
            "--cannon-duration": "13s",
            animationDelay: "5s",
          } as CSSProperties
        }
      />
      {/* The front swell, drifting over the hulls — oversized past both edges
          so the drift never uncovers a gap */}
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        aria-hidden="true"
        className={"fx-fog pointer-events-none absolute bottom-0 " + (hero ? "h-6" : "h-2.5")}
        style={{ left: "-8%", right: "-8%" }}
      >
        <path d="M0 3.5 C12 1 25 5.5 40 3 C55 0.8 70 5 84 2.8 C92 1.6 97 3.5 100 2.5 L100 8 L0 8 Z" fill="#22d3ee" opacity="0.45" />
      </svg>
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
