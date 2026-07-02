import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { THEMES, getThemeId } from "../lib/theme";
import { useStore } from "../store";

/** `align` controls which edge the dropdown anchors to: "right" (default) suits a
 *  button at the right of a bar (desktop top bar); "left" suits one at the left
 *  (the mobile menu sheet), so the panel opens beside the button rather than
 *  floating to the far side. */
export function ThemePicker({ align = "right" }: { align?: "left" | "right" }) {
  const storeTheme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  // Prefer the store's theme (synced to the profile); fall back to the DOM value.
  const current = storeTheme || getThemeId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(id: string) {
    void setTheme(id);
    setOpen(false);
  }

  return (
    // inline-block so the dropdown anchors to the button itself, not the
    // full-width container it would otherwise stretch to in the mobile menu.
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Theme"
        aria-label="Choose theme"
        className="rounded-lg border border-edge bg-surface p-2.5 text-muted transition hover:bg-panel hover:text-ink"
      >
        <Palette size={18} />
      </button>

      {open && (
        <div
          className={
            "absolute z-40 mt-2 max-h-72 w-56 overflow-y-auto rounded-lg border border-edge bg-surface p-1 shadow-stamp " +
            (align === "left" ? "left-0" : "right-0")
          }
        >
          {THEMES.map((t) => {
            const active = t.id === current;
            return (
              <button
                key={t.id}
                onClick={() => choose(t.id)}
                className={
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-panel " +
                  (active ? "bg-panel" : "")
                }
              >
                <span className="flex">
                  {t.swatches.map((c, i) => (
                    <span
                      key={i}
                      className="h-4 w-4 rounded-full border border-line"
                      style={{ background: c, marginLeft: i ? -5 : 0 }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{t.name}</span>
                  <span className="block text-[11px] text-subtle">{t.blurb}</span>
                </span>
                {active && <Check size={16} className="text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
