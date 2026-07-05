import { Globe, Link2, Lock } from "lucide-react";
import type { ListVisibility } from "../../lib/gameLists";
import { VISIBILITY_META } from "../../lib/gameLists";

const ICONS: Record<ListVisibility, typeof Globe> = {
  public: Globe,
  unlisted: Link2,
  private: Lock,
};

/** The small visibility chip a list wears on shelf cards and its page. */
export function VisibilityBadge({ visibility }: { visibility: ListVisibility }) {
  const Icon = ICONS[visibility];
  return (
    <span
      title={VISIBILITY_META[visibility].blurb}
      className="inline-flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-[11px] font-medium text-muted"
    >
      <Icon size={11} /> {VISIBILITY_META[visibility].label}
    </span>
  );
}
