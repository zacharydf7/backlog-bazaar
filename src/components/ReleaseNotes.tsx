import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import {
  RELEASES,
  LATEST_RELEASE_ID,
  formatReleaseDate,
  groupReleases,
  type Release,
  type ReleaseTag,
} from "../lib/changelog";
import type { View } from "./Sidebar";

// Label + theme-token colors per tag. Add a new tag here when one is added to
// ReleaseTag in lib/changelog.
const TAG_META: Record<ReleaseTag, { label: string; cls: string }> = {
  feature: { label: "New", cls: "bg-brand/15 text-accent" },
  improvement: { label: "Improved", cls: "bg-line text-subtle" },
  fix: { label: "Fixed", cls: "bg-success/15 text-success" },
};

function TagBadge({ tag }: { tag: ReleaseTag }) {
  const meta = TAG_META[tag];
  return (
    <span
      className={
        "inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " + meta.cls
      }
    >
      {meta.label}
    </span>
  );
}

/** One release: tag, title and date, the why-you-care line, its bullets and
 *  an optional "Try it" link. `compact` is the month-list style. */
function ReleaseEntry({
  release: r,
  compact = false,
  onNavigate,
}: {
  release: Release;
  compact?: boolean;
  onNavigate: (v: View) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TagBadge tag={r.tag} />
        <h3 className={"font-display text-ink " + (compact ? "text-base" : "text-lg")}>{r.title}</h3>
        {r.id === LATEST_RELEASE_ID && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-fg">
            Latest
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-subtle">{formatReleaseDate(r.date)}</span>
      </div>
      <p className="text-sm text-ink">{r.summary}</p>
      {r.items && r.items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {r.items.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-muted">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
      {r.link && (
        <button
          type="button"
          onClick={() => onNavigate(r.link!.view)}
          className="mt-1 inline-flex w-fit items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-brand hover:text-accent"
        >
          {r.link.label} <ArrowRight size={13} />
        </button>
      )}
    </section>
  );
}

/** The "What's new" page: the newest releases open, older ones folded into
 *  months you can expand. One release per feature (see lib/changelog). */
export function ReleaseNotes({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { recent, months } = groupReleases(RELEASES);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
        <Sparkles size={18} className="text-accent" /> What&apos;s new
      </h2>

      <div className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        {recent.map((r) => (
          <ReleaseEntry key={r.id} release={r} onNavigate={onNavigate} />
        ))}
      </div>

      {months.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-subtle">Earlier</h3>
          {months.map((m) => (
            <details key={m.key} className="group rounded-2xl border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink">
                <span>{m.label}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
                  {m.releases.length} {m.releases.length === 1 ? "update" : "updates"}
                  <ChevronDown size={15} className="transition group-open:rotate-180" />
                </span>
              </summary>
              <div className="flex flex-col gap-5 border-t border-line p-4">
                {m.releases.map((r) => (
                  <ReleaseEntry key={r.id} release={r} compact onNavigate={onNavigate} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
