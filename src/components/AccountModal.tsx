import { useStore } from "../store";

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { email, displayName, providers, linkGoogle, unlinkGoogle, error } = useStore();

  const hasGoogle = providers.includes("google");
  const hasEmail = providers.includes("email");
  // Don't let someone remove their only way to sign in.
  const canUnlinkGoogle = hasGoogle && providers.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-stone-700 bg-stone-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-700 p-4">
          <h2 className="font-display text-xl text-amber-100">Account</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-500">
              Display name
            </div>
            <div className="text-stone-100">{displayName ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-500">Email</div>
            <div className="text-stone-100">{email ?? "—"}</div>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">
              Sign-in methods
            </div>
            <div className="flex flex-col gap-2">
              <Method
                label="Email & password"
                connected={hasEmail}
              />
              <Method
                label="Google"
                connected={hasGoogle}
                action={
                  hasGoogle ? (
                    <button
                      disabled={!canUnlinkGoogle}
                      onClick={() => unlinkGoogle()}
                      title={
                        canUnlinkGoogle
                          ? "Unlink Google"
                          : "You can't remove your only sign-in method"
                      }
                      className="rounded-md border border-stone-600 px-2 py-1 text-xs text-stone-300 enabled:hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Unlink
                    </button>
                  ) : (
                    <button
                      onClick={() => linkGoogle()}
                      className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-stone-900 hover:bg-amber-500"
                    >
                      Link
                    </button>
                  )
                }
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <p className="text-[11px] text-stone-500">
            Linking Google lets you sign in either way — same account, same backlog and
            coins. You&apos;ll be sent to Google to confirm, then returned here.
          </p>
        </div>
      </div>
    </div>
  );
}

function Method({
  label,
  connected,
  action,
}: {
  label: string;
  connected: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-stone-700 bg-stone-900/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={
            "h-2 w-2 rounded-full " + (connected ? "bg-emerald-400" : "bg-stone-600")
          }
        />
        <span className="text-sm text-stone-200">{label}</span>
        <span className="text-xs text-stone-500">
          {connected ? "connected" : "not connected"}
        </span>
      </div>
      {action}
    </div>
  );
}
