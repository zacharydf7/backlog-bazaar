import { Gamepad2, Disc, Cloud, Puzzle, type LucideIcon } from "lucide-react";
import type { CopyFormat } from "../types";
import { formatLabel, orderedFormats } from "../lib/copies";

/** Per-format glyph for the compact platform tag: a disc for physical, a cloud
 *  for digital, a puzzle piece for DLC. */
const FORMAT_ICON: Record<CopyFormat, LucideIcon> = {
  physical: Disc,
  digital: Cloud,
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
 *  that version's page). */
export function PlatformBadge({
  label,
  formats,
  className = "",
  onClick,
  title,
}: {
  label: string;
  /** The platform's owned formats — renders ordered glyphs when provided. */
  formats?: CopyFormat[];
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted";
  const glyphs = formats ? orderedFormats(formats) : [];
  const body = (
    <>
      <Gamepad2 size={11} className="shrink-0 text-accent/70" />
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
