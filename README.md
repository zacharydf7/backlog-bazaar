# 🏪 Backlog Bazaar

A gamified video-game backlog tracker. **Finish games to earn coins; spend coins
to "buy" (start) new games from your backlog.** Because you have to finish to
earn to buy, you can't binge-start a dozen games at once.

## How it works

- **Bazaar** — games you want to play, each priced in coins.
- **Now Playing** — games you've bought and are actively playing.
- **Finished** — your trophy shelf; finishing pays out coins.

### The economy

- **Price** to buy a game rises with how **new**, **long**, and **highly rated**
  it is — so old/short backlog games are cheap and tempting to clear first.
- **Reward** for finishing scales with game **length**, so you can roughly afford
  one new purchase per game you finish.

Every knob lives in [`src/lib/pricing.ts`](src/lib/pricing.ts) — tune it to taste.

## Running it

```bash
npm install
npm run dev
```

Then open the printed URL (usually http://localhost:5173).

### Optional: auto-fetch game data

The app uses the free [RAWG](https://rawg.io/apidocs) API to pull release dates,
length, ratings, and cover art when you search for a game.

1. Get a free key at https://rawg.io/apidocs
2. `cp .env.example .env`
3. Paste your key into `.env` as `VITE_RAWG_KEY=...`
4. Restart `npm run dev`

Without a key you can still add games manually.

### Optional: user accounts, sync & leaderboard (Supabase)

With Supabase configured, players sign in with email + password, their library
syncs across devices, and a leaderboard ranks everyone by coins.

1. Create a free project at https://supabase.com.
2. Open **SQL Editor → New query**, paste all of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
   tables, security policies, and the buy/finish/leaderboard functions.
3. (Recommended) Turn off email confirmation so sign-up logs you straight in:
   **Authentication → Providers → Email →** disable *Confirm email*.
4. In **Project Settings → API**, copy the **Project URL** and the **anon public**
   key into `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
5. Restart `npm run dev`. The app now shows a sign-in screen.

Each player just signs up once. Row-level security keeps your libraries private;
the leaderboard shares only totals (coins, games finished, hours).

## Data

- **Local mode** (no Supabase keys): stored in your browser's `localStorage`
  under `backlog-bazaar`.
- **Cloud mode** (Supabase configured): stored in Postgres, scoped to your
  account, synced across devices.

## Testing

Automated tests run with [Vitest](https://vitest.dev):

```bash
npm test          # run the suite once
npm run test:watch  # re-run on change while developing
npm run typecheck   # TypeScript check (also covers test files)
```

The tests force local (offline) mode, so they never touch Supabase or the
network. Coverage focuses on the logic most likely to break:

- `src/lib/pricing.test.ts` — the price/reward economy formulas.
- `src/store.test.ts` — the game lifecycle (add → buy → finish → abandon →
  remove), coin math, guard rails, and `localStorage` persistence.
- `src/lib/supabase.test.ts` — mapping database rows to game objects.
- `src/lib/wikidata.test.ts` — parsing search results (with `fetch` mocked).
- `src/App.test.tsx` — a smoke test that the app mounts.

Run `npm test` before pushing — Vercel deploys on push, so a green suite keeps
the live site safe.
