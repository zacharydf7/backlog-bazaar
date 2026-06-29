import { Sparkles } from "lucide-react";
import { RELEASES, LATEST_RELEASE_ID, normalizeReleaseItem, formatReleaseDate, type ReleaseTag } from "../lib/changelog";

// Label + theme-token colours per category. Add a new tag here when one is added
// to ReleaseTag in lib/changelog.
const TAG_META: Record<ReleaseTag, { label: string; cls: string }> = {
  feature: { label: "Feature", cls: "bg-brand/15 text-accent" },
  fix: { label: "Fix", cls: "bg-success/15 text-success" },
  improvement: { label: "Improvement", cls: "bg-line text-subtle" },
};

function TagBadge({ tag }: { tag: ReleaseTag }) {
  const meta = TAG_META[tag];
  return (
    <span
      className={
        "mr-1.5 inline-block shrink-0 translate-y-[-1px] rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide align-middle " +
        meta.cls
      }
    >
      {meta.label}
    </span>
  );
}

/** Release notes / change history. Lists every release newest-first, with the
 *  current one badged "Latest". Rendered as a page section. */
export function ReleaseNotes() {
  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
          <Sparkles size={18} className="text-accent" /> What&apos;s new
        </h2>
      </div>

      <div className="flex flex-col gap-6 p-5">
        {RELEASES.map((r) => (
            <section key={r.id} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="font-display text-lg text-ink">{r.title}</h3>
                {r.id === LATEST_RELEASE_ID && (
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Latest
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs text-subtle">{formatReleaseDate(r.date)}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {r.items.map((raw, i) => {
                  const item = normalizeReleaseItem(raw);
                  return (
                    <li key={i} className="flex gap-2 text-sm text-muted">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                      <span>
                        {item.tag && <TagBadge tag={item.tag} />}
                        {item.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
    </div>
  );
}
