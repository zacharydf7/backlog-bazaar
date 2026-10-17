// @vitest-environment node
//
// Exercises the REAL co_op_pact_remove_player2 trigger from schema.sql in an
// embedded Postgres (PGlite), for issue 76409d16: a dissolved pact removes the
// invitee's unfinished Player 2 copy — refunding it like a shelve when it's
// still being played — while a finished copy, or a card that also holds the
// player's own copy, stays. Tables are trimmed to the columns the trigger
// reads; economy_enabled and log_coin_event are stubbed.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");

/** The `create or replace function public.<name>(` ... `$$;` block. */
function fn(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in schema.sql`);
  return schema.slice(start, schema.indexOf("\n$$;", start) + 4);
}

/** The `drop trigger if exists <name> ... execute function ...;` pair. */
function trigger(name: string, table: string): string {
  const start = schema.indexOf(`drop trigger if exists ${name} on public.${table};`);
  if (start < 0) throw new Error(`trigger ${name} not found in schema.sql`);
  const execAt = schema.indexOf("execute function", start);
  return schema.slice(start, schema.indexOf(";", execAt) + 1);
}

const P2 = "00000000-0000-4000-8000-000000000002";
const P1 = "00000000-0000-4000-8000-000000000001";
const player2Copy = [{ id: "c1", platform: "PlayStation 5", acquisition: "player2" }];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.profiles (id uuid primary key, coins integer not null default 0,
      economy boolean not null default true);
    create table public.games (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, title text not null default 'Pumpkin Jack',
      status text not null default 'backlog', copies jsonb, price_paid integer
    );
    create table public.co_op_pacts (
      id uuid primary key default gen_random_uuid(),
      inviter uuid not null, invitee uuid not null,
      invitee_game uuid references public.games (id) on delete set null,
      status text not null default 'active'
    );
    create table public.coin_events (user_id uuid, kind text, delta integer, after integer,
      game_id uuid references public.games (id) on delete set null, title text, detail jsonb);
    create table public.status_events (game_id uuid references public.games (id) on delete set null,
      to_status text);
    create function public.economy_enabled(p_user uuid) returns boolean language sql
      as $$ select economy from public.profiles where id = p_user $$;
    create function public.log_coin_event(p_user uuid, p_kind text, p_coin_delta integer,
      p_charter_delta integer, p_coin_after integer, p_charter_after integer, p_game uuid,
      p_game_title text, p_label text, p_detail jsonb default '{}'::jsonb)
      returns void language sql as $$
        insert into public.coin_events values (p_user, p_kind, p_coin_delta, p_coin_after,
          p_game, p_game_title, p_detail) $$;
    -- Stand-ins for the real games triggers on a shelve: the pact guard
    -- dissolves the pact mid-update, then a later trigger logs the status
    -- change against the same row (games_log_status's shape).
    create function public.test_guard() returns trigger language plpgsql as $$
    begin
      if old.status = 'playing' and new.status = 'backlog' then
        update public.co_op_pacts set status = 'dissolved' where invitee_game = new.id;
      end if;
      return new;
    end $$;
    create trigger a_guard after update of status on public.games
      for each row execute function public.test_guard();
    create function public.test_log() returns trigger language plpgsql as $$
    begin
      insert into public.status_events values (new.id, new.status);
      return new;
    end $$;
    create trigger z_log after update of status on public.games
      for each row execute function public.test_log();
  `);
  await db.exec(fn("co_op_pact_remove_player2"));
  await db.exec(trigger("co_op_pacts_remove_player2", "co_op_pacts"));
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    delete from public.co_op_pacts; delete from public.coin_events;
    delete from public.status_events; delete from public.games; delete from public.profiles;
    insert into public.profiles (id, coins) values ('${P1}', 0), ('${P2}', 100);
  `);
});

/** The invitee's bound copy plus an active pact on it; returns their ids. */
async function pacted(game: { status?: string; copies?: unknown; price_paid?: number }) {
  const g = await db.query<{ id: string }>(
    "insert into public.games (user_id, status, copies, price_paid) values ($1, $2, $3, $4) returning id",
    [P2, game.status ?? "backlog", JSON.stringify(game.copies ?? player2Copy), game.price_paid ?? null],
  );
  const p = await db.query<{ id: string }>(
    "insert into public.co_op_pacts (inviter, invitee, invitee_game) values ($1, $2, $3) returning id",
    [P1, P2, g.rows[0].id],
  );
  return { gameId: g.rows[0].id, pactId: p.rows[0].id };
}

async function dissolve(pactId: string) {
  await db.query("update public.co_op_pacts set status = 'dissolved' where id = $1", [pactId]);
}

async function gameRow(id: string) {
  const res = await db.query<{ status: string; copies: unknown[] }>(
    "select status, copies from public.games where id = $1",
    [id],
  );
  return res.rows[0];
}

async function coins(user: string) {
  return (await db.query<{ coins: number }>("select coins from public.profiles where id = $1", [user]))
    .rows[0].coins;
}

describe("co_op_pact_remove_player2 (76409d16)", () => {
  it("removes an unfinished Player 2 copy when the pact is dissolved, at commit", async () => {
    const { gameId, pactId } = await pacted({});
    await db.exec("begin");
    await dissolve(pactId);
    // Deferred: still there until the transaction commits.
    expect(await gameRow(gameId)).toBeTruthy();
    await db.exec("commit");
    expect(await gameRow(gameId)).toBeUndefined();
    expect(await coins(P2)).toBe(100);
  });

  it("refunds a Player 2 copy still being played, like a shelve", async () => {
    const { gameId, pactId } = await pacted({ status: "playing", price_paid: 30 });
    await dissolve(pactId);
    expect(await gameRow(gameId)).toBeUndefined();
    expect(await coins(P2)).toBe(130);
    const ev = await db.query<{ kind: string; delta: number; game_id: string | null; title: string }>(
      "select kind, delta, game_id, title from public.coin_events",
    );
    // Logged against the copy, which then left (title kept, id nulled).
    expect(ev.rows).toEqual([{ kind: "shelve_refund", delta: 30, game_id: null, title: "Pumpkin Jack" }]);
  });

  it("refunds nothing while the player's economy is off", async () => {
    await db.exec(`update public.profiles set economy = false where id = '${P2}'`);
    const { gameId, pactId } = await pacted({ status: "playing", price_paid: 30 });
    await dissolve(pactId);
    expect(await gameRow(gameId)).toBeUndefined();
    expect(await coins(P2)).toBe(100);
  });

  it("keeps a finished Player 2 copy — a real clear with its bounty paid", async () => {
    const { gameId, pactId } = await pacted({ status: "finished" });
    await dissolve(pactId);
    expect((await gameRow(gameId)).status).toBe("finished");
  });

  it("keeps a card that also holds the player's own copy, dropping only the Player 2 copy", async () => {
    const own = { id: "c2", platform: "PlayStation 5", format: "digital" };
    const { gameId, pactId } = await pacted({ copies: [...player2Copy, own] });
    await dissolve(pactId);
    expect((await gameRow(gameId)).copies).toEqual([own]);
  });

  it("leaves a bound copy of the player's own alone", async () => {
    const own = [{ id: "c2", platform: "Nintendo Switch" }];
    const { gameId, pactId } = await pacted({ copies: own });
    await dissolve(pactId);
    expect((await gameRow(gameId)).copies).toEqual(own);
  });

  it("only acts on a pact going from live to dissolved", async () => {
    const { gameId, pactId } = await pacted({});
    await db.query("update public.co_op_pacts set status = 'completed' where id = $1", [pactId]);
    await dissolve(pactId); // completed → dissolved is not a live pact ending
    expect(await gameRow(gameId)).toBeTruthy();
  });

  it("removes the copy after the shelve that dissolved the pact finishes its own triggers", async () => {
    const { gameId } = await pacted({ status: "playing" });
    // The shelve's later trigger logs against the row the pact guard just
    // dissolved — removing it mid-update would break that insert.
    await db.query("update public.games set status = 'backlog' where id = $1", [gameId]);
    expect(await gameRow(gameId)).toBeUndefined();
    const log = await db.query("select game_id, to_status from public.status_events");
    expect(log.rows).toEqual([{ game_id: null, to_status: "backlog" }]);
  });
});
