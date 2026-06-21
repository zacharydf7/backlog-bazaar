import { Sparkles, X } from "lucide-react";
import { RELEASES, LATEST_RELEASE_ID } from "../lib/changelog";
import { useScrollLock } from "../lib/useScrollLock";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Release notes / change history. Lists every release newest-first, with the
 *  current one badged "Latest". */
export function ReleaseNotes({ onClose }: { onClose: () => void }) {
  useScrollLock(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface p-4">
          <h2 className="inline-flex items-center gap-2 font-display text-xl text-ink">
            <Sparkles size={18} className="text-accent" /> What&apos;s new
          </h2>
          <button onClick={onClose} className="text-muted transition hover:text-ink">
            <X size={18} />
          </button>
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
                <span className="ml-auto shrink-0 text-xs text-subtle">{formatDate(r.date)}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {r.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
