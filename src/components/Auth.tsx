import { useState } from "react";
import { useStore } from "../store";

export function Auth() {
  const { signIn, signUp, busy, error, notice, clearMessages } = useStore();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signin") signIn(email.trim(), password);
    else signUp(email.trim(), password, displayName.trim() || email.split("@")[0]);
  }

  function switchMode() {
    clearMessages();
    setMode((m) => (m === "signin" ? "signup" : "signin"));
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-4xl text-amber-300">🏪 Backlog Bazaar</h1>
          <p className="mt-1 text-sm text-stone-400">
            Finish games to earn coins. Spend coins to start new ones.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-3 rounded-2xl border border-stone-700 bg-stone-800 p-6 shadow-2xl"
        >
          <h2 className="font-display text-xl text-amber-100">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h2>

          {mode === "signup" && (
            <label className="text-sm text-stone-300">
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should the leaderboard call you?"
                className="mt-1 w-full rounded-lg border border-stone-600 bg-stone-900 px-3 py-2 text-stone-100 outline-none focus:border-amber-500"
              />
            </label>
          )}

          <label className="text-sm text-stone-300">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-600 bg-stone-900 px-3 py-2 text-stone-100 outline-none focus:border-amber-500"
            />
          </label>

          <label className="text-sm text-stone-300">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-600 bg-stone-900 px-3 py-2 text-stone-100 outline-none focus:border-amber-500"
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {notice && <p className="text-sm text-emerald-400">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-lg bg-amber-600 px-3 py-2 font-semibold text-stone-900 hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-500"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>

          <button
            type="button"
            onClick={switchMode}
            className="text-center text-sm text-stone-400 hover:text-amber-300"
          >
            {mode === "signin"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
