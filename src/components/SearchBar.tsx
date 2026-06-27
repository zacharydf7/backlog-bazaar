import { Search, X } from "lucide-react";

/** The persistent header search field (desktop top bar). Typing live-filters the
 *  active board; pressing Enter or the search icon opens the global results modal
 *  so a match on any board surfaces. A clear button and Escape reset the query.
 *  On mobile this field is replaced by a compact icon button (see MobileNav) that
 *  opens the modal directly — the modal carries its own input there. */
export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Search your games…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="relative w-full max-w-xs"
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-subtle">
        <Search size={15} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border border-line bg-panel py-1.5 pl-8 pr-8 text-sm text-ink placeholder:text-subtle transition focus:border-brand/50 focus:bg-surface focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-subtle transition hover:text-ink"
        >
          <X size={15} />
        </button>
      )}
    </form>
  );
}
