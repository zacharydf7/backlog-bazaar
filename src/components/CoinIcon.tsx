import { useId } from "react";

/**
 * The Backlog Bazaar coin — a small custom mark used wherever in-app coins are
 * shown (the wallet, prices, payouts…), matching the favicon. A milled rim,
 * gold face with a top sheen, and a "B" monogram. Replaces the old 🪙 emoji so
 * the currency reads as part of the app's own design.
 *
 * `useId()` gives each instance a unique gradient id, so many coins can render
 * on one screen without clashing. Inline by default (sits on the text baseline).
 */
export function CoinIcon({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={"inline-block shrink-0 align-[-0.15em] " + className}
    >
      <defs>
        <radialGradient id={id} cx="38%" cy="33%" r="78%">
          <stop offset="0%" stopColor="#FDE9A8" />
          <stop offset="52%" stopColor="#F6B324" />
          <stop offset="100%" stopColor="#DC8A09" />
        </radialGradient>
      </defs>
      {/* milled rim */}
      <circle cx="16" cy="16" r="15.5" fill="#8A4309" />
      <circle
        cx="16"
        cy="16"
        r="14.6"
        fill="none"
        stroke="#5E2D06"
        strokeWidth="1.5"
        strokeDasharray="1 1.45"
      />
      {/* coin face + inner ring */}
      <circle cx="16" cy="16" r="13.2" fill={`url(#${id})`} stroke="#B5670C" strokeWidth="0.8" />
      <circle cx="16" cy="16" r="10.6" fill="none" stroke="#B5670C" strokeWidth="1" opacity="0.6" />
      {/* top sheen */}
      <path
        d="M8.5 11 A10 10 0 0 1 18.5 7.2"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* monogram */}
      <text
        x="16"
        y="21.4"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="14.5"
        fill="#6E2E0C"
      >
        B
      </text>
    </svg>
  );
}
