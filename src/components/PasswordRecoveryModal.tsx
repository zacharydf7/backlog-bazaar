import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useStore } from "../store";
import { useScrollLock } from "../lib/useScrollLock";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/25";

// Shown after arriving via a password-reset email link (store.passwordRecovery,
// set by the PASSWORD_RECOVERY auth event — the link signs the user in first).
// Dismissable: the account works either way; this just prompts for the new
// password while the recovery intent is fresh.
export function PasswordRecoveryModal() {
  const updatePassword = useStore((s) => s.updatePassword);
  const clear = useStore((s) => s.clearPasswordRecovery);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useScrollLock(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) setError(err);
    // On success the store clears passwordRecovery, which unmounts this modal.
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4"
      onClick={clear}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border-[1.5px] border-edge bg-surface p-5 shadow-stamp"
      >
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <KeyRound size={17} className="text-accent" /> Set a new password
        </h2>
        <p className="text-sm text-muted">
          You followed a password-reset link — choose the new password for your account.
        </p>

        <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          New password
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Confirm password
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-panel"
          >
            Not now
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-stamp-sm transition hover:brightness-105 active:translate-x-px active:translate-y-px active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save password"}
          </button>
        </div>
      </form>
    </div>
  );
}
