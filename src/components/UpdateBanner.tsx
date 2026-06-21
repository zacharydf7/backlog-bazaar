import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useUpdateCheck } from "../lib/useUpdateCheck";

/** A floating "new version is available — refresh" banner, shown when a newer
 *  deploy is detected. Dismissible for the session; reload picks up the update. */
export function UpdateBanner() {
  const outdated = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);
  if (!outdated || dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-2xl">
        <RefreshCw size={16} className="shrink-0 text-accent" />
        <span className="text-sm text-ink">A new version of Backlog Bazaar is available.</span>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-fg shadow-sm transition hover:brightness-105"
        >
          Refresh
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-muted transition hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
