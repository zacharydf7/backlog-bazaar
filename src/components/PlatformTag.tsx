import { platformTagSpec } from "../lib/platformIcons";

/** A game card's compact platform chip: brand glyph (plus a short generation
 *  tag where one brand spans generations) or a shorthand text pill for
 *  platforms without a glyph. The exact platform name always rides along as
 *  the tooltip; the full text lives on the game page's Library tab. */
export function PlatformTag({ platform, dlcOnly = false }: { platform: string; dlcOnly?: boolean }) {
  const spec = platformTagSpec(platform);
  return (
    <span
      title={platform}
      className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted"
    >
      {spec.kind === "icon" ? (
        <>
          <svg
            viewBox={spec.viewBox}
            width={11}
            height={11}
            aria-hidden="true"
            className="shrink-0 text-accent/70"
          >
            <path
              d={spec.path}
              fill={spec.mode === "fill" ? "currentColor" : "none"}
              fillRule="evenodd"
              stroke={spec.mode === "stroke" ? "currentColor" : undefined}
              strokeWidth={spec.mode === "stroke" ? 1.7 : undefined}
              strokeLinejoin="round"
            />
          </svg>
          {spec.suffix && <span>{spec.suffix}</span>}
        </>
      ) : (
        <span>{spec.short}</span>
      )}
      {dlcOnly && <span className="rounded-sm bg-accent/15 px-1 font-medium text-accent">DLC</span>}
    </span>
  );
}
