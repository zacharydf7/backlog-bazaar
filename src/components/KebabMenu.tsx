import { useEffect, useRef, useState } from "react";
import { MoreVertical, type LucideIcon } from "lucide-react";

export interface KebabItem {
  icon?: LucideIcon;
  label: string;
  /** Renders in the danger tint — for destructive actions. */
  danger?: boolean;
  onClick: () => void;
}

/** A shared overflow (⋮) menu for a row's uncommon or destructive actions —
 *  keeps them one deliberate tap away without crowding the row with
 *  equal-weight buttons. Closes on outside click, Escape, or after an action;
 *  stops propagation so it can sit inside a clickable row. */
export function KebabMenu({ label, items }: { label: string; items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="grid h-7 w-7 place-items-center rounded-lg border border-line text-muted transition hover:bg-panel hover:text-ink"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-lg border border-edge bg-surface p-1 text-left shadow-stamp"
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.label}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
                className={
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition hover:bg-panel " +
                  (it.danger ? "text-danger" : "text-ink")
                }
              >
                {Icon && <Icon size={15} className={it.danger ? "text-danger" : "text-accent"} />}
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
