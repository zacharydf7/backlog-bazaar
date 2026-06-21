import { Store } from "lucide-react";

export function MaintenancePage({ message }: { message: string | null }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 text-center">
      <Store size={64} className="text-accent" strokeWidth={1.5} />
      <h1 className="mt-4 font-display text-3xl text-accent">The Bazaar is closed</h1>
      <p className="mt-3 max-w-md text-muted">
        {message || "We're restocking the shelves and tidying the stalls. Check back soon!"}
      </p>
      <p className="mt-6 text-xs text-subtle">Backlog Bazaar will be back shortly.</p>
    </div>
  );
}
