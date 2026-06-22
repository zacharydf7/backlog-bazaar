# CLAUDE.md

Guidance for Claude Code when working in this repo. See `README.md` for setup,
the economy, and environments.

## ⭐ How to work here (engineering standards)

Code quality and maintainability come first — never trade them for speed. Apply
this to every change, no matter how small:

- **Understand the full context before editing.** Read the surrounding code, the
  relevant `src/lib/*` modules, the store, and the schema until you know how a
  change fits. Don't pattern-match a quick edit into place without knowing what
  it touches. When a task is non-trivial or has multiple viable approaches, plan
  it (and confirm the approach) before writing code.
- **Be deliberate, not hasty.** Every change is intentional and justified. No
  sloppy, throwaway, or "good enough for now" code. If you're unsure, slow down
  and verify rather than guess.
- **Keep the code clean and follow best practices.** Match the existing style,
  naming, and idioms. Prefer clear, well-named, well-factored code with pure
  logic extracted into `src/lib/*.ts` + sibling tests (see "Before every commit").
- **Blend new features into what exists.** Reuse existing components, helpers,
  patterns, and tokens instead of bolting on parallel implementations. A new
  feature should look like it was always part of the app.
- **Refactor as needed to keep quality high.** If existing code is in the way of
  a clean implementation, improve it rather than working around it — but keep
  refactors focused and explained. Leave the codebase better than you found it.
- **Small, logical commits.** One coherent change per commit, with a clear
  message. Split unrelated work into separate commits (see "Workflow"); never
  bundle a grab-bag of changes into one.

If a request would require cutting these corners, say so and propose the clean
way instead.

## ⭐ Keep the release notes updated (do this every user-facing change)

There is a **Release Notes / "What's new"** panel powered by
[`src/lib/changelog.ts`](src/lib/changelog.ts). Users discover new features
through it, and an "unseen" dot lights up when a release newer than the one they
last viewed exists.

**Whenever you make a change that a user would notice, add a changelog entry as
part of the same work — before going live.** This is not optional cleanup; treat
it like updating tests.

How:

1. Prepend a new object to the top of the `RELEASES` array (newest first):
   ```ts
   {
     id: "YYYY-MM-DD-short-slug", // unique; also the "seen" marker
     date: "YYYY-MM-DD",          // absolute date of the release
     title: "Short, benefit-focused headline",
     items: [
       "One short, user-facing sentence per change.",
       "Describe the benefit, not the implementation.",
     ],
   },
   ```
2. Keep `id` unique and date-prefixed. A new top entry automatically re-lights
   the "What's new" dot for everyone.
3. **Group related commits into one release entry** — users want milestones, not
   raw commit messages. If you ship several commits for one feature, they share
   a single entry.
4. **Skip** pure refactors, infra, dependency bumps, test-only changes, and
   internal/admin tweaks. The changelog is for end users.
5. Write in plain language ("Track which platforms you own each game on"), not
   jargon ("added `copies` JSONB column").

If you're unsure whether a change is user-facing enough to list, it usually is —
err toward adding a concise bullet to the most relevant recent entry, or a new
entry if it stands alone.

## Keep the "How it works" page updated (when core mechanics change)

There is an **About / How-it-works** page in
[`src/components/AboutPage.tsx`](src/components/AboutPage.tsx) (reached via "How
it works" in the sidebar) that teaches new players the core loop and economy.

**Whenever you change a core mechanic** — the buy→play→finish loop, Now Playing
slots, the price/reward formulas, Game Families, Shelve It, etc. — update the
prose on that page in the same change. The coin *numbers* are pulled live from
[`src/lib/pricing.ts`](src/lib/pricing.ts) and admin settings, so they stay in
sync automatically; it's the wording/flow that needs a human. Pure UI tweaks
that don't change how the game works don't need an edit.

## Workflow: staging → main

Develop on **`staging`**. Never commit straight to `main`.

1. Make changes on `staging`; commit there (one logical change per commit).
2. If the change touches the database, the user runs the migration in Supabase
   before deploy (see schema discipline below).
3. The user verifies on the staging preview, then says **"go live"**.
4. On "go live", fast-forward `main` and push both branches:
   ```bash
   git checkout main && git merge staging --ff-only && git push origin main \
     && git checkout staging && git push origin staging
   ```

Commit message trailer:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Only commit/push when asked. Don't go live until the user says so.

**Committing from PowerShell (Windows):** embedded double quotes in a `-m`
message break native arg-passing in PS 5.1 and git mis-parses the words as
pathspecs. Don't put `"..."` inside the message. For multi-line messages, write
to a single-quoted here-string variable and use it, e.g.:
```powershell
$msg = @'
Subject line without double quotes

Body... use single quotes or no quotes around terms.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
'@
git commit -m $msg
```
The go-live `&&` chain above is Bash — in PowerShell run it via the Bash tool,
or use `;`-separated steps guarded with `if ($?) { ... }`.

## Before every commit

- `npm run typecheck` — must be clean.
- `npm test` — must be green (Vercel deploys on push).
- `npm run build` — must succeed.

Prefer extracting pure logic into `src/lib/*.ts` with a sibling `*.test.ts`
(Vitest + Testing Library, jsdom). Tests run in local/offline mode — no Supabase,
no network.

## Schema discipline (Supabase)

- [`supabase/schema.sql`](supabase/schema.sql) is the single source of truth and
  must stay **idempotent** (safe to re-run): use `create table if not exists`,
  `add column if not exists`, `drop policy if exists` + `create policy`, etc.
- Append migrations to it; the user runs the whole file (or the new statements)
  before deploying code that depends on them. Triggers fire only on new events —
  no retroactive backfill.
- Notifications are inserted **only** by security-definer triggers (never the
  client). `auth.uid()` is the actor, so never notify a user about their own
  action.
- Changing a function's `RETURNS TABLE` shape requires `drop function` first.
  Add `#variable_conflict use_column` when OUT column names collide with table
  columns.

## UI conventions

- **Mobile-first & responsive — always.** Every new screen, modal, toolbar, and
  card must work on a phone, not just desktop. Design for narrow viewports first,
  then enhance with `sm:`/`md:`/`lg:` breakpoints. Practical rules: let toolbars
  and button rows wrap (`flex-wrap`); make modals scrollable and width-capped
  (`max-w-*` + `w-full`, padding that shrinks on small screens); keep tap targets
  comfortably large; avoid fixed widths that overflow; verify nothing clips or
  requires horizontal scrolling at ~360px wide. Treat a layout that only looks
  right on desktop as incomplete.
- **Tailwind v4** with semantic CSS-variable tokens per theme (`--ink`,
  `--muted`, `--subtle`, `--accent`, `--brand`, `--brand-fg`, `--panel`,
  `--surface`, `--line`, `--success`, `--danger`, `--canvas`). **Never hardcode
  Tailwind colors** (no `bg-red-500`); use the tokens (`bg-brand`, `text-muted`,
  …) so all themes work. Themes live in `src/lib/theme.ts` + `src/index.css`.
- Icons: `lucide-react`. State: Zustand (`useStore`) + a separate toast store
  (`toast()`).
- Modals follow the existing pattern (`useScrollLock(true)`, backdrop click to
  close, `stopPropagation` on the inner panel).

## Data model notes

- A game can have multiple **copies** (`game.copies`): one per platform you own
  it on, each with an optional USD `cost` + `note`. This is informational
  metadata — it never affects the coin economy. Status/playtime/coins are tracked
  once per game. Helpers in [`src/lib/copies.ts`](src/lib/copies.ts).
- The economy lives entirely in [`src/lib/pricing.ts`](src/lib/pricing.ts).
- Deploys are detected client-side via a build-stamped `version.json`
  (`src/lib/useUpdateCheck.ts`) — that drives the refresh banner, which is
  separate from the changelog panel.
