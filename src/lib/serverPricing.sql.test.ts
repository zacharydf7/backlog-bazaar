// @vitest-environment node
//
// Server-side game pricing (owner, 2026-10-18): the REAL game_start_price,
// game_bounty and their triggers from schema.sql in an embedded Postgres
// (PGlite), against the client code the cards show (computeFormula, the buy
// chain's family and recommendation discounts, computeBounty). Also: a run's
// bounty inputs lock at its start, and the Added date can't move past the day
// the game joined the library. Tables are trimmed; game_identity_keys is a
// crosswalk-free stand-in.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { computeBounty, computeFormula, normalizeFormula, DEFAULT_PRICE_FORMULA, DEFAULT_BOUNTY_FORMULA } from "./economy";
import { computeCompletionReward, computeFamilyDiscountPrice, computeFinishReward } from "./pricing";
import { recDiscountedPrice } from "./recommendations";
import { coerceBountyBasis } from "./supabase";
import { pactJoinDraft } from "./coopPacts";
import type { CoOpPact, Game, GameCopy } from "../types";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

const U = "00000000-0000-4000-8000-0000000000a1";
const DAY = 86_400_000;
const PRICE = {
  base: 40,
  recencyDecayYears: 1,
  modifierRecencyPct: 50,
  factors: {
    paid: { weight: 1, enabled: true },
    length: { weight: 3, enabled: true },
    played: { weight: 0, enabled: false },
    rating: { weight: 2, enabled: true },
    recency: { weight: 120, enabled: true },
  },
};
const BOUNTY = { ...PRICE, factors: { ...PRICE.factors, length: { weight: 5, enabled: true }, recency: { weight: 150, enabled: true } } };

let db: PGlite;
let seq = 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.app_config (id integer primary key, price_formula jsonb, bounty_formula jsonb,
      replay_bonus_pct integer, rec_discount_pct integer, completion_bonus_pct integer);
    insert into public.app_config values (1, '${JSON.stringify(PRICE)}', '${JSON.stringify(BOUNTY)}', 25, 20, 50);
    create table public.games (id uuid primary key, user_id uuid, title text, family_id uuid,
      status text not null, finish_tag text, hours real, personal_hours real, played_hours real not null default 0,
      rating real, copies jsonb not null default '[]'::jsonb, added_at timestamptz not null default now(),
      rawg_id integer, igdb_id integer, catalog_id uuid, started_at timestamptz, preordered_at timestamptz,
      bounty_basis jsonb, added_ceiling timestamptz);
    create table public.game_recommendations (id uuid primary key default gen_random_uuid(), receiver uuid,
      status text, imported_game_id uuid, rawg_id integer, igdb_id integer, catalog_id uuid,
      created_at timestamptz not null default now());
    create table public.game_milestones (game_id uuid, kind text, occurred_on date);
    create table public.preorder_events (game_id uuid, action text, created_at timestamptz not null default now());
    create function public.game_identity_keys(p_rawg integer, p_igdb integer, p_catalog uuid) returns text[]
      language sql as $$ select array_remove(array['r:' || p_rawg, 'i:' || p_igdb, 'c:' || p_catalog], null) $$;
  `);
  for (const name of [
    "econ_default_formula",
    "econ_normalize",
    "econ_formula",
    "copies_total_cost",
    "copies_modifier_only",
    "econ_recency_scale",
    "game_family_discounted",
    "game_live_recommendation",
    "game_start_price",
    "finish_reward_parts",
    "co_op_join_draft",
    "game_bounty_basis",
    "game_bounty",
    "games_lock_bounty_basis",
    "games_cap_added_at",
    "game_milestones_cap_added",
  ]) {
    await db.exec(fn(name));
  }
  await db.exec(`
    create trigger games_cap_added_at before insert or update of status, added_at, preordered_at on public.games
      for each row execute function public.games_cap_added_at();
    create trigger games_lock_bounty_basis before insert or update of status on public.games
      for each row execute function public.games_lock_bounty_basis();
    create trigger game_milestones_cap_added before insert or update of occurred_on, kind on public.game_milestones
      for each row execute function public.game_milestones_cap_added();
  `);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(
    "delete from public.games; delete from public.game_recommendations; delete from public.game_milestones; delete from public.preorder_events;",
  );
});

type Row = {
  status?: string;
  family?: string;
  finishTag?: string;
  hours?: number;
  personalHours?: number;
  played?: number;
  rating?: number;
  copies?: GameCopy[];
  ageDays?: number;
  rawgId?: number;
};

/** Insert a game; returns its id and the client's view of it. */
async function addGame(r: Row): Promise<Game> {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const addedAt = Date.now() - (r.ageDays ?? 0) * DAY;
  await db.query(
    `insert into public.games (id, user_id, title, family_id, status, finish_tag, hours, personal_hours, played_hours,
       rating, copies, added_at, rawg_id)
     values ($1, $2, 'Game', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz, $12)`,
    [id, U, r.family ?? null, r.status ?? "backlog", r.finishTag ?? null, r.hours ?? null, r.personalHours ?? null,
     r.played ?? 0, r.rating ?? null, JSON.stringify(r.copies ?? []), new Date(addedAt).toISOString(), r.rawgId ?? null],
  );
  return {
    id,
    title: "Game",
    genres: [],
    status: (r.status ?? "backlog") as Game["status"],
    familyId: r.family,
    finishTag: r.finishTag as Game["finishTag"],
    hours: r.hours,
    personalHours: r.personalHours,
    playedHours: r.played ?? 0,
    rating: r.rating,
    copies: r.copies ?? [],
    addedAt,
    rawgId: r.rawgId,
  } as Game;
}

async function serverPrice(id: string): Promise<number> {
  return (await db.query<{ p: number }>("select public.game_start_price(g) as p from public.games g where g.id = $1", [id])).rows[0].p;
}
async function serverBounty(id: string): Promise<number> {
  return (await db.query<{ b: number }>("select public.game_bounty(g) as b from public.games g where g.id = $1", [id])).rows[0].b;
}

const price = normalizeFormula(PRICE, DEFAULT_PRICE_FORMULA);
const bounty = normalizeFormula(BOUNTY, DEFAULT_BOUNTY_FORMULA);

describe("game_start_price matches the buy chain", () => {
  it("prices the game as it stands: length (personal first), every copy's cost, freshness, rating", async () => {
    for (const r of [
      { hours: 10, rating: 4, copies: [{ id: "a", platform: "PC", cost: 30 }], ageDays: 100 },
      { hours: 40, personalHours: 25, copies: [{ id: "a", platform: "PC", cost: 20 }, { id: "b", platform: "PS5", cost: 15.5 }], ageDays: 3 },
      { copies: [], ageDays: 500 },
    ]) {
      const g = await addGame(r);
      expect(await serverPrice(g.id)).toBe(computeFormula(g, price));
    }
  });

  it("leaves a DLC copy's cost out of the base game's price", async () => {
    const g = await addGame({
      hours: 10,
      copies: [
        { id: "a", platform: "PC", cost: 30 },
        { id: "d", platform: "PC", format: "dlc", cost: 20 },
      ],
    });
    expect(await serverPrice(g.id)).toBe(computeFormula(g, price));
    expect(computeFormula(g, price)).toBe(computeFormula({ ...g, copies: [g.copies![0]] }, price));
  });

  it("gives a subscription-only game its share of freshness", async () => {
    const g = await addGame({ hours: 8, copies: [{ id: "a", platform: "PC", acquisition: "subscription" }] });
    expect(await serverPrice(g.id)).toBe(computeFormula(g, price));
    expect(computeFormula(g, price)).toBeLessThan(computeFormula({ ...g, copies: [] }, price));
  });

  it("takes the Family Discount while another edition plays or was cleared, not when it was retired", async () => {
    const g = await addGame({ hours: 12, family: "00000000-0000-4000-8000-0000000000f1" });
    expect(await serverPrice(g.id)).toBe(computeFormula(g, price));
    await addGame({ status: "finished", finishTag: "retired", family: "00000000-0000-4000-8000-0000000000f1" });
    expect(await serverPrice(g.id)).toBe(computeFormula(g, price));
    await addGame({ status: "playing", family: "00000000-0000-4000-8000-0000000000f1" });
    expect(await serverPrice(g.id)).toBe(computeFamilyDiscountPrice(computeFormula(g, price), 25));
  });

  it("takes a friend's recommendation discount on top", async () => {
    const g = await addGame({ hours: 20, rawgId: 99, family: "00000000-0000-4000-8000-0000000000f2" });
    await addGame({ status: "playing", family: "00000000-0000-4000-8000-0000000000f2" });
    await db.query("insert into public.game_recommendations (receiver, status, rawg_id) values ($1, 'pending', 99)", [U]);
    expect(await serverPrice(g.id)).toBe(recDiscountedPrice(computeFamilyDiscountPrice(computeFormula(g, price), 25), 20));
  });
});

describe("the co-op Player 2 fee", () => {
  it("prices the draft exactly as the card the join inserts", async () => {
    const src = await addGame({ hours: 18, rating: 4, rawgId: 7, copies: [{ id: "a", platform: "PC", cost: 60 }] });
    const draft = (
      await db.query<{ p: number }>(
        "select public.game_start_price(public.co_op_join_draft(g, $1, 'PC')) as p from public.games g where g.id = $2",
        [U, src.id],
      )
    ).rows[0].p;
    const card = await addGame({
      hours: 18,
      rating: 4,
      rawgId: 7,
      copies: [{ id: "p2", platform: "PC", acquisition: "player2", provider: "Sam" }],
    });
    expect(draft).toBe(await serverPrice(card.id));
    expect(draft).toBe(computeFormula(card, price));
  });

  it("matches the join flow's estimate (the partner card's preview, on a Player 2 seat)", async () => {
    const src = await addGame({ hours: 18, rawgId: 8, copies: [{ id: "a", platform: "PC" }] });
    const draft = (
      await db.query<{ p: number }>(
        "select public.game_start_price(public.co_op_join_draft(g, $1, 'PC')) as p from public.games g where g.id = $2",
        [U, src.id],
      )
    ).rows[0].p;
    const pact = { title: "Game", partnerGameHours: 18, partnerGamePlatform: "PC", partnerGameImage: null } as CoOpPact;
    expect(draft).toBe(computeFormula(pactJoinDraft(pact), price));
  });
});

describe("finish_reward_parts matches the finish chain", () => {
  it("pays the full bounty, the Replay share, or the Completion share as the card does", async () => {
    for (const full of [0, 37, 120, 333]) {
      for (const replay of [false, true]) {
        for (const completion of [false, true]) {
          const r = (
            await db.query<{ base: number; bonus: number }>("select * from public.finish_reward_parts($1, $2, $3)", [
              full,
              replay,
              completion,
            ])
          ).rows[0];
          const client = completion ? computeCompletionReward(replay, full, 50) : computeFinishReward(replay, full, 25);
          expect(r.base + r.bonus).toBe(client);
        }
      }
    }
  });
});

describe("a run's bounty", () => {
  it("locks its inputs at the start, so later cost, Added date and rating edits don't move it", async () => {
    const g = await addGame({ hours: 10, rating: 3, copies: [{ id: "a", platform: "PC", cost: 20 }], ageDays: 30 });
    await db.query("update public.games set status = 'playing' where id = $1", [g.id]);
    const locked = await serverBounty(g.id);
    await db.query(
      `update public.games set copies = '[{"platform":"PC","cost":500}]', rating = 5, added_at = added_at - interval '1 day'
        where id = $1`,
      [g.id],
    );
    expect(await serverBounty(g.id)).toBe(locked);

    const row = (await db.query<{ bounty_basis: unknown }>("select bounty_basis from public.games where id = $1", [g.id])).rows[0];
    const basis = coerceBountyBasis(JSON.parse(JSON.stringify(row.bounty_basis)));
    expect(
      computeBounty({ ...g, status: "playing", copies: [{ id: "a", platform: "PC", cost: 500 }], rating: 5, bountyBasis: basis }, bounty),
    ).toBe(locked);
  });

  it("follows a length change, which pays its own fee", async () => {
    const g = await addGame({ hours: 10 });
    await db.query("update public.games set status = 'playing' where id = $1", [g.id]);
    const before = await serverBounty(g.id);
    await db.query("update public.games set personal_hours = 14 where id = $1", [g.id]);
    expect(await serverBounty(g.id)).toBe(before + 20);
  });

  it("keeps the lock an undo restores, and relocks a fresh start", async () => {
    const g = await addGame({ hours: 10, copies: [{ id: "a", platform: "PC", cost: 20 }] });
    await db.query("update public.games set status = 'playing' where id = $1", [g.id]);
    const locked = await serverBounty(g.id);
    await db.query("update public.games set status = 'finished', copies = '[{\"platform\":\"PC\",\"cost\":80}]' where id = $1", [g.id]);
    await db.transaction(async (tx) => {
      await tx.exec("select set_config('app.undo_in_progress', '1', true)");
      await tx.query("update public.games set status = 'playing' where id = $1", [g.id]);
    });
    expect(await serverBounty(g.id)).toBe(locked);
    await db.query("update public.games set status = 'backlog' where id = $1", [g.id]);
    await db.query("update public.games set status = 'playing' where id = $1", [g.id]);
    expect(await serverBounty(g.id)).toBe(locked + 60);
  });
});

describe("the Added date", () => {
  const added = async (id: string) =>
    Date.parse((await db.query<{ a: Date }>("select added_at as a from public.games where id = $1", [id])).rows[0].a.toISOString());

  const ceilingOf = async (id: string) =>
    (await db.query<{ c: Date | null }>("select added_ceiling as c from public.games where id = $1", [id])).rows[0].c?.getTime() ?? null;

  it("can be backdated but not moved past the day the game joined the library", async () => {
    const g = await addGame({});
    const ceiling = await ceilingOf(g.id);
    await db.query("update public.games set added_at = now() - interval '2 years' where id = $1", [g.id]);
    expect(await added(g.id)).toBeLessThan(ceiling! - 700 * DAY);
    await db.query("update public.games set added_at = now() + interval '30 days' where id = $1", [g.id]);
    expect(await added(g.id)).toBe(ceiling);
  });

  it("refuses an Added milestone dated after that day", async () => {
    const g = await addGame({ ageDays: 400 });
    await db.query("update public.games set added_ceiling = now() - interval '300 days' where id = $1", [g.id]);
    await expect(
      db.query("insert into public.game_milestones values ($1, 'added', current_date)", [g.id]),
    ).rejects.toThrow(/can't be after/);
    await db.query("insert into public.game_milestones values ($1, 'added', current_date - 400)", [g.id]);
  });

  it("starts the limit when a wishlist entry is first imported, and keeps it after a trip back", async () => {
    const w = await addGame({ status: "wishlist", ageDays: 50 });
    expect(await ceilingOf(w.id)).toBeNull();
    await db.query("update public.games set status = 'backlog' where id = $1", [w.id]);
    const first = await ceilingOf(w.id);
    expect(first).toBeGreaterThan(Date.now() - 60_000);
    await db.query("update public.games set added_ceiling = now() - interval '200 days' where id = $1", [w.id]);
    await db.query("update public.games set status = 'wishlist' where id = $1", [w.id]);
    await db.query("update public.games set status = 'backlog' where id = $1", [w.id]);
    expect(await ceilingOf(w.id)).toBeLessThan(Date.now() - 199 * DAY);
  });

  it("moves the limit at the arrival of a pre-order placed as the game joined, not one marked later", async () => {
    // Placed with the add: the server logged 'placed' as the game joined.
    const placed = await addGame({});
    await db.query(
      `update public.games set added_ceiling = now() - interval '10 days', preordered_at = now() - interval '10 days' where id = $1;`,
      [placed.id],
    );
    await db.query("insert into public.preorder_events values ($1, 'placed', now() - interval '10 days')", [placed.id]);
    await db.query("update public.games set preordered_at = null where id = $1", [placed.id]);
    expect(await ceilingOf(placed.id)).toBeGreaterThan(Date.now() - 60_000);

    // Marked on a game owned for 300 days: placed today, whatever the marker claims.
    const owned = await addGame({ ageDays: 300 });
    await db.query(
      "update public.games set added_ceiling = now() - interval '300 days', preordered_at = '2000-01-01' where id = $1",
      [owned.id],
    );
    await db.query("insert into public.preorder_events values ($1, 'placed', now())", [owned.id]);
    await db.query("update public.games set preordered_at = null where id = $1", [owned.id]);
    expect(await ceilingOf(owned.id)).toBeLessThan(Date.now() - 299 * DAY);
  });
});
