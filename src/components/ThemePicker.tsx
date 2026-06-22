import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { THEMES, getThemeId } from "../lib/theme";
import { useStore } from "../store";

export function ThemePicker() {
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Theme"
        aria-label="Choose theme"
        className="rounded-xl border border-line bg-surface p-2.5 text-muted transition hover:bg-panel hover:text-ink"
      >
        <Palette size={18} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-line bg-surface p-1 shadow-2xl">
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
