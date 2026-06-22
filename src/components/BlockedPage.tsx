import { Ban } from "lucide-react";
import { useStore } from "../store";

export function BlockedPage({ reason }: { reason: string | null }) {
  const { signOut } = useStore();
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 text-center">
      <Ban size={64} className="text-danger" strokeWidth={1.5} />
      <h1 className="mt-4 font-display text-3xl text-ink">Your account is blocked</h1>
      <p className="mt-3 max-w-md text-muted">
        {reason || "An administrator has restricted your access to Backlog Bazaar."}
      </p>
      <button
        onClick={() => signOut()}
        className="mt-6 rounded-xl border border-line bg-surface px-4 py-2 text-sm text-muted transition hover:bg-panel hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}
