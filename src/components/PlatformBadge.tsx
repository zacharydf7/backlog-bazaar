import { Gamepad2, Disc, Download, Play, Puzzle, type LucideIcon } from "lucide-react";
import type { CopyFormat } from "../types";
import { formatLabel, orderedFormats } from "../lib/copies";

/** Per-format glyph for the compact platform tag: a disc for physical, a
 *  download arrow for digital, a puzzle piece for DLC. */
const FORMAT_ICON: Record<CopyFormat, LucideIcon> = {
  physical: Disc,
  digital: Download,
  dlc: Puzzle,
};

/** THE platform chip — the one way a platform is displayed anywhere in the
 *  app: bordered mono pill, gamepad glyph, then whatever label the surface
 *  needs (just the platform on compact board cards, `ownershipLabel(o)` with
 *  formats spelled out on inventory surfaces like the Master Ledger). Pass
 *  `formats` on the compact surfaces to append little physical/digital/DLC
 *  glyphs (all three show when a platform is owned in all three forms); the
 *  verbose surfaces skip it since their label already lists the formats. With
 *  `onClick` the pill becomes a button (e.g. a stacked deck's tags deep-link to
 *  that version's page). `playing` singles out the version in play among a
 *  family card's merged tags: true highlights it, false dims a version that
 *  isn't being played, omitted is the plain chip. */
export function PlatformBadge({
  label,
  formats,
  className = "",
  onClick,
  title,
  playing,
}: {
  label: string;
  /** The platform's owned formats — renders ordered glyphs when provided. */
  formats?: CopyFormat[];
  className?: string;
  onClick?: () => void;
  title?: string;
  playing?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] " +
    (playing
      ? "border-brand bg-brand/15 font-semibold text-ink"
      : "border-line bg-panel text-muted" + (playing === false ? " opacity-60" : ""));
  const glyphs = formats ? orderedFormats(formats) : [];
  const LeadIcon = playing ? Play : Gamepad2;
  const body = (
    <>
      <LeadIcon
        size={11}
        className={"shrink-0 " + (playing ? "fill-current text-accent" : "text-accent/70")}
        aria-label={playing ? "Now playing" : undefined}
        role={playing ? "img" : undefined}
      />
      <span className="min-w-0 truncate">{label}</span>
      {glyphs.map((f) => {
        const Icon = FORMAT_ICON[f];
        return (
          <Icon
            key={f}
            size={10}
            className="shrink-0 text-accent"
            role="img"
            aria-label={formatLabel(f)}
          />
        );
      })}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        title={title}
        onClick={(e) => {
          // Never trigger whatever surface the pill sits on (a card, a deck).
          e.stopPropagation();
          onClick();
        }}
        className={
          base +
          " transition hover:border-brand/50 hover:text-ink" +
          (className ? " " + className : "")
        }
      >
        {body}
      </button>
    );
  }
  return (
    <span title={title} className={base + (className ? " " + className : "")}>
      {body}
    </span>
  );
}
