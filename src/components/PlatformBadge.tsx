import { Gamepad2 } from "lucide-react";

/** THE platform chip — the one way a platform is displayed anywhere in the
 *  app: bordered mono pill, gamepad glyph, then whatever label the surface
 *  needs (just the platform on compact board cards, `ownershipLabel(o)` with
 *  formats on inventory surfaces like the Master Ledger and the game page's
 *  ownership rollup). `dlc` appends the accent DLC marker for a platform owned
 *  only as an expansion. */
export function PlatformBadge({
  label,
  dlc = false,
  className = "",
}: {
  label: string;
  dlc?: boolean;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted" +
        (className ? " " + className : "")
      }
    >
      <Gamepad2 size={11} className="shrink-0 text-accent/70" />
      <span className="min-w-0 truncate">{label}</span>
      {dlc && <span className="rounded-sm bg-accent/15 px-1 font-medium text-accent">DLC</span>}
    </span>
  );
}
