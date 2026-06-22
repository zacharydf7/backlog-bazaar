/** A titled row of multi-select pill toggles. Shared by the Bazaar toolbar and
 *  the Master Ledger toolbar so every slicer looks and behaves identically. */
export function FilterChips({
  title,
  options,
  selected,
  onToggle,
  labelOf,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  labelOf?: (value: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              aria-pressed={on}
              className={
                "rounded-full border px-2.5 py-1 text-xs transition " +
                (on
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-panel text-muted hover:border-brand/50 hover:text-ink")
              }
            >
              {labelOf ? labelOf(o) : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
