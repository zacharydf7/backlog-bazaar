import { CloudOff } from "lucide-react";

/** Startup couldn't reach the server in time, or failed (2026-10-23 gateway
 *  incident): say so and offer a retry, instead of loading forever or opening
 *  an empty account. A reload starts startup over. */
export function ServerUnreachablePage() {
  return (
    <div
      role="alert"
      className="flex min-h-full flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <CloudOff size={48} className="text-accent" strokeWidth={1.5} />
      <h1 className="font-display text-2xl text-ink">Can&apos;t reach the server right now</h1>
      <p className="max-w-sm text-sm text-muted">
        Your Bazaar is safe. This is usually a short hiccup with our server host. Try again in a
        moment.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:brightness-105"
      >
        Try again
      </button>
    </div>
  );
}
