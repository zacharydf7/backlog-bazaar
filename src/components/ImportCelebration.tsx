import { useEffect } from "react";
import { Stamp } from "lucide-react";
import { useStore } from "../store";

// A brief "stamped!" receipt that slams down when a Wishlist game is imported
// into the Bazaar with a charter — the psychological reward for the spend. Driven
// by store.celebration (set by importWithCharter); auto-clears after the anim.
export function ImportCelebration() {
  const celebration = useStore((s) => s.celebration);
  const clear = useStore((s) => s.clearCelebration);

  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(clear, 1500);
    return () => clearTimeout(t);
  }, [celebration, clear]);

  if (!celebration) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] grid place-items-center"
      aria-live="polite"
    >
      <div
        key={celebration.id}
        className="animate-stamp flex flex-col items-center gap-1.5 rounded-2xl border-4 border-brand/70 bg-surface/95 px-8 py-6 shadow-2xl"
      >
        <Stamp className="text-accent" size={44} />
        <p className="font-display text-lg tracking-wide text-ink">Imported!</p>
        <p className="max-w-[14rem] truncate text-center text-sm text-muted">{celebration.title}</p>
      </div>
    </div>
  );
}
