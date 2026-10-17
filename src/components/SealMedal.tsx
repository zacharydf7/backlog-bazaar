import { useId } from "react";
import { SEAL_RIBBON, SEAL_TIERS, crestFor, droplets, laurel, waxPath } from "../lib/sealArt";
import { TIER_META } from "../lib/achievements";
import type { Achievement } from "../types";

/** The lighting every seal shares: a pillowy, glossy rim for the poured wax,
 *  a crisp raised relief for the crest and laurels, a soft cast shadow, and a
 *  fine surface grain — one light source, top-left. Ids are per seal so a
 *  page of medals never depends on another medal's defs staying mounted. */
function SealFilters({ id }: { id: string }) {
  return (
    <>
      <filter id={`${id}pillow`} x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="b" />
        <feDiffuseLighting in="b" surfaceScale="7" diffuseConstant="1.25" lightingColor="#fff" result="d">
          <feDistantLight azimuth="225" elevation="42" />
        </feDiffuseLighting>
        <feSpecularLighting
          in="b"
          surfaceScale="7"
          specularConstant="1.1"
          specularExponent="28"
          lightingColor="#fff"
          result="s"
        >
          <feDistantLight azimuth="225" elevation="55" />
        </feSpecularLighting>
        <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.15" k2="0" k3="0" k4="0" result="shaded" />
        <feComposite in="s" in2="SourceAlpha" operator="in" result="gloss" />
        <feComposite in="shaded" in2="gloss" operator="arithmetic" k1="0" k2="1" k3=".9" k4="0" />
      </filter>
      <filter id={`${id}relief`} x="-15%" y="-15%" width="130%" height="130%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="b" />
        <feDiffuseLighting in="b" surfaceScale="2.6" diffuseConstant="1.3" lightingColor="#fff" result="d">
          <feDistantLight azimuth="225" elevation="40" />
        </feDiffuseLighting>
        <feSpecularLighting
          in="b"
          surfaceScale="2.6"
          specularConstant=".9"
          specularExponent="22"
          lightingColor="#fff"
          result="s"
        >
          <feDistantLight azimuth="225" elevation="55" />
        </feSpecularLighting>
        <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.25" k2="0" k3="0" k4="0" result="shaded" />
        <feComposite in="s" in2="SourceAlpha" operator="in" result="gloss" />
        <feComposite in="shaded" in2="gloss" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0" result="lit" />
        <feOffset in="SourceAlpha" dx="1" dy="1.4" result="o" />
        <feGaussianBlur in="o" stdDeviation=".9" result="ob" />
        <feColorMatrix in="ob" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .45 0" result="shadow" />
        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="lit" />
        </feMerge>
      </filter>
      <filter id={`${id}cast`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.6" />
      </filter>
      <filter id={`${id}grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency=".05 .07" numOctaves="3" seed="6" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.25" />
      </filter>
    </>
  );
}

function Laurels({ leaves, filter }: { leaves: number; filter: string }) {
  return (
    <g filter={filter}>
      {([1, -1] as const).map((side) => {
        const sprig = laurel(side, leaves);
        return (
          <g key={side}>
            <path d={sprig.stem} fill="none" strokeWidth="1.4" />
            {sprig.leaves.map((l, i) => (
              <ellipse
                key={i}
                cx={l.x}
                cy={l.y}
                rx="1.9"
                ry="4.4"
                transform={`rotate(${Math.round(l.rot)} ${l.x} ${l.y})`}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** One achievement as a poured wax seal with its family's crest pressed in.
 *  The tier sets the material and trim: bronze wax on its own, silver foil
 *  with a laurel sprig, gold leaf with a full wreath, ribbon tails and a slow
 *  glint. A medal not yet earned is a faint dashed outline of the seal with
 *  the crest blind-embossed, so the target shows without its colour. */
export function SealMedal({ achievement, size = 48 }: { achievement: Achievement; size?: number }) {
  const id = `seal${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { family, tier } = achievement;
  const earned = achievement.earnedAt != null;
  const outline = waxPath(family + tier);
  const crest = crestFor(family);
  const title = `${achievement.name} (${TIER_META[tier].label}) — ${achievement.description}`;

  if (!earned) {
    return (
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={title} className="shrink-0">
        <title>{title}</title>
        <path
          d={outline}
          fill="none"
          stroke="var(--subtle)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity=".7"
        />
        <circle cx="70" cy="70" r="36" fill="none" stroke="var(--subtle)" strokeWidth="1" opacity=".5" />
        <g
          transform="translate(46 46)"
          fill="var(--subtle)"
          stroke="var(--subtle)"
          color="var(--subtle)"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity=".3"
          dangerouslySetInnerHTML={{ __html: crest }}
        />
      </svg>
    );
  }

  const t = SEAL_TIERS[tier];
  const relief = `url(#${id}relief)`;
  const pillow = `url(#${id}pillow)`;
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={title} className="shrink-0">
      <title>{title}</title>
      <defs>
        <SealFilters id={id} />
        <radialGradient id={`${id}body`} cx="36%" cy="30%" r="80%">
          <stop offset="0" stopColor={t.a} />
          <stop offset=".55" stopColor={t.b} />
          <stop offset="1" stopColor={t.c} />
        </radialGradient>
        <radialGradient id={`${id}field`} cx="60%" cy="62%" r="70%">
          <stop offset="0" stopColor={t.field} />
          <stop offset="1" stopColor={t.fieldDeep} />
        </radialGradient>
        <linearGradient id={`${id}rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".45" />
          <stop offset=".5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".5" />
        </linearGradient>
        <clipPath id={`${id}clip`}>
          <path d={outline} />
        </clipPath>
      </defs>
      {tier === 3 && (
        <g filter={pillow} fill={SEAL_RIBBON}>
          <path d="M52 104l-12 32 12-6 9 10 7-30z" />
          <path d="M88 104l12 32-12-6-9 10-7-30z" />
        </g>
      )}
      <path d={outline} transform="translate(2 3.5)" fill="#000" opacity=".18" filter={`url(#${id}cast)`} />
      <g fill={`url(#${id}body)`} filter={pillow}>
        <path d={outline} />
        {droplets(family + tier).map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={d.r} />
        ))}
      </g>
      <g clipPath={`url(#${id}clip)`} opacity={tier === 2 ? 0.18 : 0.26}>
        <rect width="140" height="140" fill={t.c} filter={`url(#${id}grain)`} />
      </g>
      <circle cx="70" cy="70" r="38" fill={`url(#${id}field)`} />
      <circle cx="70" cy="70" r="38" fill="none" stroke={`url(#${id}rim)`} strokeWidth="3" />
      <circle cx="70" cy="70" r="35" fill="none" stroke={t.relief} strokeWidth="1.8" filter={relief} />
      {tier > 1 && (
        <g fill={t.relief} stroke={t.relief}>
          <Laurels leaves={tier === 2 ? 4 : 6} filter={relief} />
        </g>
      )}
      <g
        transform={tier === 1 ? "translate(46 46)" : "translate(49 47) scale(0.875)"}
        fill={t.relief}
        stroke={t.relief}
        color={t.fieldDeep}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={relief}
        dangerouslySetInnerHTML={{ __html: crest }}
      />
      {tier === 3 && (
        <g clipPath={`url(#${id}clip)`}>
          <rect className="animate-seal-shine" x="0" y="-10" width="26" height="160" fill="#fff" opacity=".4" />
        </g>
      )}
    </svg>
  );
}
