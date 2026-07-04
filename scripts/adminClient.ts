/**
 * Shared Supabase client for the local issue-board dev scripts.
 *
 * Signs in as your ADMIN account with the public anon key — the same auth path
 * the app uses — so every query and write runs under your identity:
 *   - RLS applies (least-privilege; no service-role DB bypass on disk).
 *   - auth.uid() = you, so status moves are attributed to you in the audit log
 *     and the requester gets their "Moved to …" notification.
 *
 * Credentials live in .env.local (gitignored via *.local), never committed:
 *   ADMIN_EMAIL=you@example.com
 *   ADMIN_PASSWORD=...
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env then .env.local (later wins). Both optional; guard missing files.
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // absent — fine
  }
}

function required(name: string, hint: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}.\n${hint}`);
    process.exit(1);
  }
  return v;
}

/** Create the client and sign in as the admin. Exits with a clear message on failure. */
export async function adminClient(): Promise<SupabaseClient> {
  const url = required("VITE_SUPABASE_URL", "Expected in .env.");
  const anonKey = required("VITE_SUPABASE_ANON_KEY", "Expected in .env.");
  const email = required(
    "ADMIN_EMAIL",
    "Add your admin account email to .env.local (gitignored).",
  );
  const password = required(
    "ADMIN_PASSWORD",
    "Add your admin account password to .env.local (gitignored).",
  );

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`Admin sign-in failed for ${email}: ${error.message}`);
    process.exit(1);
  }
  return supabase;
}
