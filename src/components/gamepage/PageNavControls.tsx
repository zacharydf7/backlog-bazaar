import { ChevronLeft, ChevronRight } from "lucide-react";
import { neighbors, type PageNav, type PageNavStop } from "../../lib/pageNav";

/** Step to the previous/next stop in the board you opened this page from (issues
 *  7ad49282, 28ec4975). Shared by the game page and the collapsed-compilation
 *  bundle page so Prev/Next walks the same sequence across both — a game stop
 *  opens a game page, a compilation stop opens its bundle page. Hidden when the
 *  current stop isn't in the sequence (e.g. reached by search) or the board holds
 *  only one stop. Ends of the list disable the button rather than wrapping, so
 *  the position caption always reads truthfully. */
export function PageNavControls({
  nav,
  current,
  onNavigate,
}: {
  nav: PageNav;
  current: PageNavStop;
  onNavigate: (stop: PageNavStop) => void;
}) {
  const { prev, next, position, total } = neighbors(nav.stops, current);
  if (position === 0 || total <= 1) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-subtle">
        {position} of {total}
        <span className="hidden sm:inline"> · {nav.label}</span>
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-line">
        <button
          type="button"
          onClick={() => prev && onNavigate(prev)}
          disabled={!prev}
          aria-label={`Previous in ${nav.label}`}
          className="inline-flex items-center gap-1 bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
        >
          <ChevronLeft size={14} />
          <span className="hidden sm:inline">Prev</span>
        </button>
        <button
          type="button"
          onClick={() => next && onNavigate(next)}
          disabled={!next}
          aria-label={`Next in ${nav.label}`}
          className="inline-flex items-center gap-1 border-l border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
