-- Backlog Bazaar — Supabase schema.
-- Paste this whole file into the Supabase SQL editor (Dashboard -> SQL -> New query)
-- and run it once. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  coins        integer not null default 120,
  platforms    jsonb not null default '[]'::jsonb,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Migrations for projects created before these columns existed:
alter table public.profiles add column if not exists platforms jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Users may edit only their display name + platforms via the API — never their
-- coins or is_admin (those change through security-definer functions or an admin).
revoke update on public.profiles from authenticated;
grant update (display_name, platforms) on public.profiles to authenticated;

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  rawg_id     integer,
  title       text not null,
  released    date,
  hours       integer,
  rating      real,
  metacritic  integer,
  genres      jsonb not null default '[]'::jsonb,
  image       text,
  platforms   jsonb not null default '[]'::jsonb,
  developers  jsonb not null default '[]'::jsonb,
  esrb        text,
  status      text not null default 'backlog'
                check (status in ('backlog', 'playing', 'finished', 'wishlist')),
  price_paid  integer,
  reward      integer,
  added_at    timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);

create index if not exists games_user_id_idx on public.games (user_id);

-- Migration for projects created before these columns existed (safe to re-run):
alter table public.games add column if not exists platforms  jsonb not null default '[]'::jsonb;
alter table public.games add column if not exists developers jsonb not null default '[]'::jsonb;
alter table public.games add column if not exists esrb       text;

-- Allow the 'wishlist' status (projects created before it existed):
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('backlog', 'playing', 'finished', 'wishlist'));

-- ---------------------------------------------------------------------------
-- App config (singleton row): maintenance toggle, readable by everyone.
-- Toggle maintenance by editing this row in the Supabase Table Editor.
-- ---------------------------------------------------------------------------

create table if not exists public.app_config (
  id          integer primary key default 1,
  maintenance boolean not null default false,
  message     text,
  constraint app_config_singleton check (id = 1)
);
insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config
  for select to anon, authenticated using (true);

-- Admins (profiles.is_admin) can toggle maintenance from within the app.
drop policy if exists "app_config_admin_update" on public.app_config;
create policy "app_config_admin_update" on public.app_config
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.games    enable row level security;

-- Profiles: any signed-in user can READ (needed nowhere directly, but harmless);
-- a user may only INSERT/UPDATE their own row.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Games: a user can only see and change their own games.
drop policy if exists "games_select_own" on public.games;
create policy "games_select_own" on public.games
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "games_modify_own" on public.games;
create policy "games_modify_own" on public.games
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Buy a game: deduct coins + flip status, atomically.
-- Price/reward are computed in the app (single source of truth in pricing.ts)
-- and passed in. Returns the new coin balance.
-- ---------------------------------------------------------------------------

create or replace function public.apply_purchase(p_game uuid, p_price integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_coins integer;
begin
  update public.profiles
     set coins = coins - p_price
   where id = auth.uid() and coins >= p_price
   returning coins into new_coins;

  if new_coins is null then
    raise exception 'Not enough coins';
  end if;

  update public.games
     set status = 'playing', started_at = now(), price_paid = p_price
   where id = p_game and user_id = auth.uid() and status = 'backlog';

  if not found then
    raise exception 'Game not available to buy';
  end if;

  return new_coins;
end;
$$;

-- Finish a game: flip status + award coins, atomically. Returns new balance.
create or replace function public.apply_finish(p_game uuid, p_reward integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_coins integer;
begin
  update public.games
     set status = 'finished', finished_at = now(), reward = p_reward
   where id = p_game and user_id = auth.uid() and status = 'playing';

  if not found then
    raise exception 'Game not available to finish';
  end if;

  update public.profiles
     set coins = coins + p_reward
   where id = auth.uid()
   returning coins into new_coins;

  return new_coins;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard: aggregates only (no one sees another player's actual games).
-- ---------------------------------------------------------------------------

create or replace function public.leaderboard()
returns table (
  id             uuid,
  display_name   text,
  coins          integer,
  games_finished bigint,
  hours_finished bigint
)
language sql
security definer set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.coins,
    count(g.*) filter (where g.status = 'finished')                  as games_finished,
    coalesce(sum(g.hours) filter (where g.status = 'finished'), 0)   as hours_finished
  from public.profiles p
  left join public.games g on g.user_id = p.id
  group by p.id, p.display_name, p.coins
  order by p.coins desc;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which would let anyone with the
-- (public) anon key call these. Lock them to signed-in users only.
revoke execute on function public.apply_purchase(uuid, integer) from public;
revoke execute on function public.apply_finish(uuid, integer)   from public;
revoke execute on function public.leaderboard()                 from public;

-- Admin-only: set your own coin balance to an exact value. The column-level
-- grant blocks users from writing profiles.coins directly, so this runs as a
-- security-definer and re-checks is_admin for the caller.
create or replace function public.admin_set_coins(p_coins integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_coins integer;
begin
  if p_coins < 0 then
    raise exception 'Coins must be 0 or more';
  end if;

  update public.profiles
     set coins = p_coins
   where id = auth.uid()
     and is_admin
   returning coins into new_coins;

  if new_coins is null then
    raise exception 'Not authorized';
  end if;

  return new_coins;
end;
$$;

-- View another player's library (read-only). Returns full game rows for the
-- given user, bypassing per-row RLS via security definer. This makes backlogs
-- visible between players — intentional for a shared/competitive setup.
create or replace function public.player_library(p_user uuid)
returns setof public.games
language sql
security definer set search_path = public
as $$
  select * from public.games where user_id = p_user order by added_at desc;
$$;

-- Supabase grants EXECUTE directly to the `anon` role by default, so revoking
-- from PUBLIC alone is not enough — revoke from `anon` too so these require login.
revoke execute on function public.apply_purchase(uuid, integer) from public, anon;
revoke execute on function public.apply_finish(uuid, integer)   from public, anon;
revoke execute on function public.leaderboard()                 from public, anon;
revoke execute on function public.player_library(uuid)          from public, anon;
revoke execute on function public.admin_set_coins(integer)      from public, anon;

grant execute on function public.apply_purchase(uuid, integer) to authenticated;
grant execute on function public.apply_finish(uuid, integer)   to authenticated;
grant execute on function public.leaderboard()                 to authenticated;
grant execute on function public.player_library(uuid)          to authenticated;
grant execute on function public.admin_set_coins(integer)      to authenticated;
