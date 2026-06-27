-- Backlog Bazaar — Supabase schema.
-- Paste this whole file into the Supabase SQL editor (Dashboard -> SQL -> New query)
-- and run it once. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'Player',
  coins         integer not null default 120,
  platforms     jsonb not null default '[]'::jsonb,
  hidden_market jsonb not null default '[]'::jsonb,
  is_admin      boolean not null default false,
  -- general_slots: how many games you may have in Now Playing at once (any game
  -- fits a general slot). Admin-managed; targeted slots are layered on later.
  general_slots integer not null default 2,
  -- blocked: a banned user is locked out of the app (admin-managed).
  blocked        boolean not null default false,
  blocked_reason text,
  -- hidden: admin-managed flag that hides the account from the leaderboard and
  -- excludes it from any cross-user stat aggregation (e.g. test/bot accounts).
  -- The account itself keeps working; this is curation, not a ban.
  hidden         boolean not null default false,
  -- custom_platforms: extra console/platform labels the user added themselves
  -- (e.g. "Nintendo Switch 2") beyond the built-in list. ["label", ...]
  custom_platforms jsonb not null default '[]'::jsonb,
  -- avatar_url: public URL of the user's uploaded profile picture (in the
  -- 'avatars' storage bucket), with a ?v= cache-buster. null = use initials.
  avatar_url    text,
  -- theme: chosen UI theme id (see src/lib/theme.ts). Synced so it follows you
  -- across devices and so visitors see your Bazaar in your theme. null = default.
  theme         text,
  -- privacy: extensible map of visitor hide-flags, e.g. {"hide_spend": true}.
  -- Controls what other users see when they visit your Bazaar.
  privacy       jsonb not null default '{}'::jsonb,
  -- last_seen_at / activity: lightweight presence. The client pings last_seen_at
  -- on a timer + on navigation; activity is a short label of what they're doing
  -- ("Browsing the Caravan"). Both null when the user is appearing offline.
  last_seen_at  timestamptz,
  activity      text,
  created_at    timestamptz not null default now()
);

-- Migrations for projects created before these columns existed:
alter table public.profiles add column if not exists platforms jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists hidden_market jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists general_slots integer not null default 2;
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists blocked_reason text;
alter table public.profiles add column if not exists hidden boolean not null default false;
alter table public.profiles add column if not exists custom_platforms jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists theme text;
alter table public.profiles add column if not exists privacy jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists activity text;
-- Import Charters: an economic license, stockpiled in the global wallet, that a
-- user spends to move a game from the Wishlist into their active Bazaar. Changed
-- only through security-definer RPCs (buy/sell/import), never the client.
alter table public.profiles add column if not exists charters integer not null default 0;
alter table public.profiles drop constraint if exists profiles_charters_nonneg;
alter table public.profiles add constraint profiles_charters_nonneg check (charters >= 0);
-- Onboarding Free Game Vouchers ("Jumpstart Activation"): a starter, non-tradeable
-- token granted at signup that bypasses the coin activation fee for exactly one
-- transition — moving a game from the Bazaar (backlog) into Now Playing. Unlike
-- charters they can't be bought, sold, or converted to coins; the only mutations
-- are the signup/admin grant and a redemption, all via security-definer RPCs.
alter table public.profiles add column if not exists vouchers integer not null default 0;
alter table public.profiles drop constraint if exists profiles_vouchers_nonneg;
alter table public.profiles add constraint profiles_vouchers_nonneg check (vouchers >= 0);
-- When the player finished (or dismissed) the Jumpstart onboarding walkthrough
-- (null = not yet). Durable so the tour shows at most once per account, across
-- devices — and so an existing account granted its first voucher can still get it
-- once. Set only by complete_onboarding() below.
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
-- True for a fresh signup whose starter vouchers are deferred until they finish
-- (or skip) the onboarding tour — so a brand-new player learns the loop before the
-- vouchers land. complete_onboarding grants them exactly once and clears this.
-- Existing accounts (and admin-granted vouchers) leave this false, so they never
-- get the deferred grant.
alter table public.profiles add column if not exists onboarding_vouchers_pending boolean not null default false;
alter table public.profiles drop constraint if exists profiles_general_slots_range;
alter table public.profiles add constraint profiles_general_slots_range
  check (general_slots between 0 and 99);

-- Users may edit only their display name, platforms + hidden-market list via the
-- API — never their coins or is_admin (those change through security-definer
-- functions or an admin).
revoke update on public.profiles from authenticated;
grant update (display_name, platforms, hidden_market, custom_platforms, avatar_url, theme, privacy, last_seen_at, activity) on public.profiles to authenticated;

-- Display names are unique (case-insensitive). Before adding the index, resolve
-- any pre-existing duplicates by keeping the earliest account's name and
-- suffixing later collisions, so the index can be created. Safe to re-run: once
-- names are unique the UPDATE is a no-op.
with dupes as (
  select id,
         row_number() over (partition by lower(display_name) order by created_at, id) as rn
    from public.profiles
)
update public.profiles p
   set display_name = p.display_name || ' ' || dupes.rn
  from dupes
 where p.id = dupes.id and dupes.rn > 1;

create unique index if not exists profiles_display_name_lower_idx
  on public.profiles (lower(display_name));

-- ---------------------------------------------------------------------------
-- Roles & fine-grained permissions (RBAC layered over is_admin).
--
-- Historically every admin capability was gated by the single profiles.is_admin
-- boolean. Roles let an admin grant *individual* capabilities (moderate
-- submissions, view stats, adjust user economy, …) to specific users without
-- making them full admins. A `role` bundles permission keys; a user's effective
-- permissions are the union of their assigned roles. is_admin is retained as the
-- super-admin who implicitly holds EVERY permission, so existing admins are
-- unaffected and granular roles only ever *add* access.
--
-- Defined here, high in the file, because has_permission() replaces the inline
-- is_admin checks in RLS policies + RPCs further down — it must exist first.
-- ---------------------------------------------------------------------------

-- The catalog of valid permission keys. Mirrors src/lib/permissions.ts (keep the
-- two lists in sync). Centralised here so upsert_role validation and the admin
-- branch of my_permissions() share one source.
create or replace function public.all_permission_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'submissions.games.moderate',
    'submissions.compilations.moderate',
    'catalog.manage',
    'users.view',
    'users.economy',
    'users.block',
    'users.delete',
    'users.notify',
    'users.onboarding',
    'badges.grant',
    'economy.edit',
    'slots.manage',
    'site.maintenance',
    'issues.moderate',
    'stats.view',
    'roles.assign'
  ]::text[];
$$;

-- A named bundle of permission keys. Writes go exclusively through the
-- security-definer role RPCs below (which re-check authority); clients may read
-- roles (names are not sensitive — the UI shows role chips) but never write.
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  permissions text[] not null default '{}',
  -- is_system: a seeded preset (Moderator/QA). Editable, but undeletable, so the
  -- defaults can't be accidentally removed.
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Assignment of a role to a user (one row = one granted role). Append-only from
-- the client's view: only the assign/revoke RPCs mutate it.
create table if not exists public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- Append-only audit of every role lifecycle event (grant/revoke + role
-- create/update/delete), with name + permission snapshots so the history
-- survives the role or user being removed. Never updated or deleted.
create table if not exists public.role_events (
  id          uuid primary key default gen_random_uuid(),
  target_user uuid references public.profiles (id) on delete set null,
  role_id     uuid references public.roles (id) on delete set null,
  action      text not null check (action in
                ('granted', 'revoked', 'role_created', 'role_updated', 'role_deleted')),
  actor       uuid references public.profiles (id) on delete set null,
  role_name   text,
  permissions text[],
  created_at  timestamptz not null default now()
);
create index if not exists role_events_target_idx
  on public.role_events (target_user, created_at desc, id desc);

-- The keystone: does the current user hold a permission? True for any super-admin
-- (is_admin), else true when one of their assigned roles carries the key. SECURITY
-- DEFINER so it bypasses RLS on roles/user_roles (no policy recursion); STABLE.
create or replace function public.has_permission(p_key text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
    or exists (
      select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.user_id = auth.uid()
         and p_key = any (r.permissions)
    );
$$;

-- The caller's effective permission keys, for the client to gate UI: the full
-- catalog for a super-admin, else the distinct union of their roles' permissions.
create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
      then public.all_permission_keys()
    else coalesce(
      (select array(
         select distinct perm
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id
           cross join unnest(r.permissions) as perm
          where ur.user_id = auth.uid()
       )),
      '{}'::text[]
    )
  end;
$$;

alter table public.roles       enable row level security;
alter table public.user_roles  enable row level security;
alter table public.role_events enable row level security;

revoke insert, update, delete on public.roles       from authenticated, anon;
revoke insert, update, delete on public.user_roles  from authenticated, anon;
revoke insert, update, delete on public.role_events from authenticated, anon;

-- Roles are world-readable to signed-in users (role chips, the assign picker).
drop policy if exists "roles_select" on public.roles;
create policy "roles_select" on public.roles
  for select to authenticated using (true);

-- You can see your own role grants; a user manager / role assigner sees all.
drop policy if exists "user_roles_select" on public.user_roles;
create policy "user_roles_select" on public.user_roles
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.has_permission('users.view')
    or public.has_permission('roles.assign')
  );

-- Audit is read-own-or-admin (mirrors coin_events / compilation_events).
drop policy if exists "role_events_select" on public.role_events;
create policy "role_events_select" on public.role_events
  for select to authenticated
  using (
    auth.uid() = target_user
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Create or update a role (super-admin only). Validates every key against the
-- catalog so a typo can't mint a dead permission. Logs the change.
create or replace function public.upsert_role(
  p_id          uuid,
  p_key         text,
  p_name        text,
  p_description text,
  p_permissions text[]
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id    uuid;
  v_perms text[];
  v_bad   text;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
    raise exception 'Not authorized';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Role name is required';
  end if;
  if nullif(btrim(coalesce(p_key, '')), '') is null then
    raise exception 'Role key is required';
  end if;

  -- Reject any permission not in the catalog.
  v_perms := coalesce(p_permissions, '{}'::text[]);
  select perm into v_bad
    from unnest(v_perms) as perm
   where perm <> all (public.all_permission_keys())
   limit 1;
  if v_bad is not null then
    raise exception 'Unknown permission: %', v_bad;
  end if;

  if p_id is null then
    insert into public.roles (key, name, description, permissions)
    values (lower(btrim(p_key)), btrim(p_name), nullif(btrim(p_description), ''), v_perms)
    returning id into v_id;
    insert into public.role_events (target_user, role_id, action, actor, role_name, permissions)
    values (null, v_id, 'role_created', auth.uid(), btrim(p_name), v_perms);
  else
    update public.roles
       set name        = btrim(p_name),
           description = nullif(btrim(p_description), ''),
           permissions = v_perms,
           updated_at  = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Role not found';
    end if;
    insert into public.role_events (target_user, role_id, action, actor, role_name, permissions)
    values (null, v_id, 'role_updated', auth.uid(), btrim(p_name), v_perms);
  end if;

  return v_id;
end;
$$;

-- Delete a custom role (super-admin only). System presets are protected. The
-- user_roles cascade removes the assignments; the event keeps a snapshot.
create or replace function public.delete_role(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name  text;
  v_perms text[];
  v_sys   boolean;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
    raise exception 'Not authorized';
  end if;
  select name, permissions, is_system into v_name, v_perms, v_sys
    from public.roles where id = p_id;
  if v_name is null then
    raise exception 'Role not found';
  end if;
  if v_sys then
    raise exception 'System roles cannot be deleted';
  end if;
  insert into public.role_events (target_user, role_id, action, actor, role_name, permissions)
  values (null, p_id, 'role_deleted', auth.uid(), v_name, v_perms);
  delete from public.roles where id = p_id;
end;
$$;

-- Assign a role to a user. Requires roles.assign; a non-super-admin delegate may
-- only grant a role whose permissions are a SUBSET of their own — so they can
-- never escalate themselves or anyone else beyond their own reach.
create or replace function public.assign_role(p_user uuid, p_role uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_admin boolean;
  v_name     text;
  v_perms    text[];
  v_extra    text;
begin
  select me.is_admin into v_is_admin
    from public.profiles me where me.id = auth.uid();
  if not coalesce(v_is_admin, false) and not public.has_permission('roles.assign') then
    raise exception 'Not authorized';
  end if;

  select name, permissions into v_name, v_perms from public.roles where id = p_role;
  if v_name is null then
    raise exception 'Role not found';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'User not found';
  end if;

  -- Subset guard for delegates: every permission in the role must be one the
  -- caller already holds.
  if not coalesce(v_is_admin, false) then
    select perm into v_extra
      from unnest(v_perms) as perm
     where not (perm = any (public.my_permissions()))
     limit 1;
    if v_extra is not null then
      raise exception 'You cannot grant a role with permissions you do not hold';
    end if;
  end if;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (p_user, p_role, auth.uid())
  on conflict (user_id, role_id) do nothing;

  if found then
    insert into public.role_events (target_user, role_id, action, actor, role_name, permissions)
    values (p_user, p_role, 'granted', auth.uid(), v_name, v_perms);
    -- Tell the recipient (server-side, never about your own account).
    if p_user <> auth.uid() then
      insert into public.notifications (user_id, type, title, body)
      values (p_user, 'role_granted', 'You were granted a role',
              'You now have the "' || v_name || '" role.');
    end if;
  end if;
end;
$$;

-- Revoke a role from a user (same authority + subset rule as assigning it).
create or replace function public.revoke_role(p_user uuid, p_role uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_admin boolean;
  v_name     text;
  v_perms    text[];
  v_extra    text;
begin
  select me.is_admin into v_is_admin
    from public.profiles me where me.id = auth.uid();
  if not coalesce(v_is_admin, false) and not public.has_permission('roles.assign') then
    raise exception 'Not authorized';
  end if;

  select name, permissions into v_name, v_perms from public.roles where id = p_role;
  if v_name is null then
    raise exception 'Role not found';
  end if;

  if not coalesce(v_is_admin, false) then
    select perm into v_extra
      from unnest(v_perms) as perm
     where not (perm = any (public.my_permissions()))
     limit 1;
    if v_extra is not null then
      raise exception 'You cannot manage a role with permissions you do not hold';
    end if;
  end if;

  delete from public.user_roles where user_id = p_user and role_id = p_role;
  if found then
    insert into public.role_events (target_user, role_id, action, actor, role_name, permissions)
    values (p_user, p_role, 'revoked', auth.uid(), v_name, v_perms);
    -- Tell the affected user (server-side, never about your own account).
    if p_user <> auth.uid() then
      insert into public.notifications (user_id, type, title, body)
      values (p_user, 'role_revoked', 'A role was removed',
              'The "' || v_name || '" role was removed from your account.');
    end if;
  end if;
end;
$$;

-- The role catalog for the admin/role UIs, with how many users hold each role.
-- Visible to anyone who can assign roles (super-admins satisfy has_permission).
-- Returns nothing for everyone else (a SQL function can't raise).
create or replace function public.list_roles()
returns table (
  id           uuid,
  key          text,
  name         text,
  description  text,
  permissions  text[],
  is_system    boolean,
  member_count bigint,
  created_at   timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select r.id, r.key, r.name, r.description, r.permissions, r.is_system,
         (select count(*) from public.user_roles ur where ur.role_id = r.id) as member_count,
         r.created_at
    from public.roles r
   where public.has_permission('roles.assign')
   order by r.is_system desc, r.name asc;
$$;

revoke all on function public.all_permission_keys() from public, anon, authenticated;
grant execute on function public.all_permission_keys() to authenticated;
revoke all on function public.has_permission(text) from public, anon, authenticated;
grant execute on function public.has_permission(text) to authenticated;
revoke all on function public.my_permissions() from public, anon, authenticated;
grant execute on function public.my_permissions() to authenticated;
revoke all on function public.upsert_role(uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.upsert_role(uuid, text, text, text, text[]) to authenticated;
revoke all on function public.delete_role(uuid) from public, anon, authenticated;
grant execute on function public.delete_role(uuid) to authenticated;
revoke all on function public.assign_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_role(uuid, uuid) to authenticated;
revoke all on function public.revoke_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_role(uuid, uuid) to authenticated;
revoke all on function public.list_roles() from public, anon, authenticated;
grant execute on function public.list_roles() to authenticated;

-- Seed two editable presets so roles are useful out of the box. Idempotent:
-- inserted once, never overwritten (so an admin's later edits to them survive).
insert into public.roles (key, name, description, permissions, is_system)
values
  ('moderator', 'Moderator',
   'Reviews community submissions and moderates the issue board.',
   array['submissions.games.moderate', 'submissions.compilations.moderate', 'catalog.manage', 'issues.moderate'],
   true),
  ('qa', 'QA',
   'Reads stats and the user list, and can toggle maintenance mode for testing.',
   array['stats.view', 'users.view', 'site.maintenance'],
   true)
on conflict (key) do nothing;

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  rawg_id     integer,
  title       text not null,
  released    date,
  hours       real,
  rating      real,
  metacritic  integer,
  genres      jsonb not null default '[]'::jsonb,
  image       text,
  platforms   jsonb not null default '[]'::jsonb,
  developers  jsonb not null default '[]'::jsonb,
  esrb        text,
  status      text not null default 'backlog'
                check (status in ('backlog', 'playing', 'finished', 'wishlist')),
  price_paid   integer,
  reward       integer,
  played_hours real not null default 0,
  copies       jsonb not null default '[]'::jsonb,
  progress_note text,
  added_at     timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create index if not exists games_user_id_idx on public.games (user_id);

-- Migration for projects created before these columns existed (safe to re-run):
alter table public.games add column if not exists platforms    jsonb not null default '[]'::jsonb;
alter table public.games add column if not exists developers   jsonb not null default '[]'::jsonb;
alter table public.games add column if not exists esrb         text;
alter table public.games add column if not exists played_hours real not null default 0;
-- Game length was originally a whole-number `integer`; widen it to `real` so a
-- length can be entered to the minute (e.g. 1.5h), matching played_hours. Safe
-- to re-run (a real column stays real).
alter table public.games alter column hours type real;
-- copies: which platforms you own a game on + what each cost (see GameCopy in
-- src/types.ts). [{ id, platform, cost?, note?, acquiredAt? }]. Owner-only via the
-- existing games RLS, so no extra grants are needed.
alter table public.games add column if not exists copies jsonb not null default '[]'::jsonb;
-- progress_note: a single mutable "where I left off" note per game.
alter table public.games add column if not exists progress_note text;
-- stock_image: the current catalog/default cover, kept so a custom cover can be
-- reverted to the default. Set when the game is added and refreshed when a catalog
-- cover edit is approved (so "restore default" lands on the latest shared art).
-- Backfilled below from the current image (additive + non-destructive).
alter table public.games add column if not exists stock_image text;
update public.games set stock_image = image where stock_image is null and image is not null;
-- original_image: the cover the copy was first added with (write-once). Unlike
-- stock_image it is NEVER overwritten — not even by an approved catalog cover
-- edit — so a user can always revert to the cover the game originally shipped
-- with. Backfilled from the current stock cover for existing rows.
alter table public.games add column if not exists original_image text;
update public.games set original_image = stock_image where original_image is null and stock_image is not null;

-- Allow the 'wishlist' status (projects created before it existed):
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('backlog', 'playing', 'finished', 'wishlist'));

-- private: hide this game from visitors to your Bazaar. Owner-only state — it
-- never affects the economy, your own boards, or your stats; it only filters the
-- game out of another player's view (see player_library) and the cross-profile
-- search. Additive + safe to re-run (existing games default to visible).
alter table public.games add column if not exists private boolean not null default false;

-- ---------------------------------------------------------------------------
-- Now Playing slots (targeted). slot_definitions is an admin-managed catalog of
-- rules (e.g. "Quick Clear" = games up to 10h). user_slots grants a slot to a
-- user (one row = one usable slot). A playing game records which slot it sits in
-- via games.slot_id (null = a general slot). General-slot capacity lives on
-- profiles.general_slots. See src/lib/slots.ts for the matching logic.
-- ---------------------------------------------------------------------------

create table if not exists public.slot_definitions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  min_hours  integer,  -- null = no lower bound
  max_hours  integer,  -- null = no upper bound
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Slot behaviour (additive; existing rows default to the original behaviour):
--   • standard — the length-matched targeted slot (min/max hours). Auto-filled at
--     purchase when a game fits, reserving general slots for games that don't.
--   • endless  — a single-occupant slot for live-service / ongoing / post-game
--     titles. Length-agnostic, NEVER auto-filled (the player parks a game in it
--     deliberately at purchase or by moving a playing game in), and it never
--     counts against general-slot capacity. Grant several for several ongoing games.
--   • replay   — pulls a FINISHED game back into active play for free (bypassing
--     the purchase flow). Re-finishing pays the smaller Replay Bonus.
alter table public.slot_definitions add column if not exists kind text not null default 'standard';
alter table public.slot_definitions drop constraint if exists slot_definitions_kind_check;
alter table public.slot_definitions add constraint slot_definitions_kind_check
  check (kind in ('standard', 'endless', 'replay'));

-- Richer matching criteria for STANDARD slots (additive; all null/empty = no
-- constraint, so existing slots are unchanged). A game must satisfy every set
-- criterion (AND): hours/release-year/Metacritic ranges, plus "any-of" genre and
-- platform lists. A platform list doubles as a group — e.g. a "Handheld" slot is
-- one whose platforms are the handheld systems. Endless/replay ignore all of these.
alter table public.slot_definitions add column if not exists min_year       integer;
alter table public.slot_definitions add column if not exists max_year       integer;
alter table public.slot_definitions add column if not exists min_metacritic integer;
alter table public.slot_definitions add column if not exists max_metacritic integer;
alter table public.slot_definitions add column if not exists genres    jsonb not null default '[]'::jsonb;
alter table public.slot_definitions add column if not exists platforms jsonb not null default '[]'::jsonb;
-- How many of this slot type a brand-new account is granted by default (the admin
-- "default loadout"). 0 = not part of the default loadout. Applied by
-- handle_new_user on signup only — never retroactively.
alter table public.slot_definitions add column if not exists default_grant_count integer not null default 0;

-- Does a game (by its metadata) satisfy a STANDARD slot's rules? Endless/replay
-- slots are length/criteria-agnostic and never call this. Every *set* criterion
-- must pass; an empty genre/platform list or a null bound imposes no constraint.
-- A bounded numeric range rejects an unknown value (same as the hours rule). Genre
-- and platform matching is case-insensitive "any-of". The single source of truth
-- for standard-slot matching across all placement paths.
create or replace function public.slot_matches(
  d public.slot_definitions,
  p_hours real,
  p_released date,
  p_genres jsonb,
  p_platforms jsonb,
  p_metacritic integer
) returns boolean
language sql
immutable
as $$
  select
    (d.min_hours is null or (p_hours is not null and p_hours >= d.min_hours))
    and (d.max_hours is null or (p_hours is not null and p_hours <= d.max_hours))
    and (d.min_year is null or (p_released is not null and extract(year from p_released) >= d.min_year))
    and (d.max_year is null or (p_released is not null and extract(year from p_released) <= d.max_year))
    and (d.min_metacritic is null or (p_metacritic is not null and p_metacritic >= d.min_metacritic))
    and (d.max_metacritic is null or (p_metacritic is not null and p_metacritic <= d.max_metacritic))
    and (
      coalesce(jsonb_array_length(d.genres), 0) = 0
      or exists (
        select 1
          from jsonb_array_elements_text(coalesce(p_genres, '[]'::jsonb)) gg
          join jsonb_array_elements_text(d.genres) dg on lower(dg) = lower(gg)
      )
    )
    and (
      coalesce(jsonb_array_length(d.platforms), 0) = 0
      or exists (
        select 1
          from jsonb_array_elements_text(coalesce(p_platforms, '[]'::jsonb)) pp
          join jsonb_array_elements_text(d.platforms) dp on lower(dp) = lower(pp)
      )
    );
$$;

create table if not exists public.user_slots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  definition_id uuid not null references public.slot_definitions (id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index if not exists user_slots_user_idx on public.user_slots (user_id);

-- A playing game's slot. on delete set null so revoking a targeted slot just
-- drops its game back to relying on a general slot (never deletes the game).
alter table public.games add column if not exists slot_id uuid
  references public.user_slots (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Game Families: linked editions/remasters/cross-platform releases of one core
-- title share a family_id (a plain grouping uuid — not a foreign key). Linked
-- games keep their own status but aggregate playtime/cost, share a single Now
-- Playing slot, and only pay a full completion bonus on the family's FIRST
-- clear. See src/lib/families.ts. null = unlinked (a family of one).
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists family_id uuid;
create index if not exists games_family_idx on public.games (user_id, family_id);
-- family_name: the editable display name for a family's Master Card. Denormalized
-- onto every member (like family_id), set on all members at once. null = use the
-- representative edition's own title.
alter table public.games add column if not exists family_name text;

-- ---------------------------------------------------------------------------
-- Game Compilations: one retail purchase (a remaster collection, a multi-game
-- bundle) holding several DISTINCT games. Unlike a Game Family (editions of one
-- title), a compilation is the primary FINANCIAL record: it owns the total cost,
-- platform and format. Each bundled game becomes its own standalone card that
-- references the compilation via games.compilation_id; the total cost is split
-- across the children and stored as each child's per-copy USD cost (informational
-- only — it never affects the coin economy). Children can't be deleted on their
-- own; deleting the compilation removes them all (on delete cascade). See
-- src/lib/compilations.ts and the create_/delete_compilation RPCs below.
-- ---------------------------------------------------------------------------
create table if not exists public.compilations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  total_cost numeric not null default 0,
  platform   text,
  format     text,
  created_at timestamptz not null default now()
);
create index if not exists compilations_user_idx on public.compilations (user_id);

-- A child game's link to its compilation (null = a normal standalone game).
-- on delete cascade so deleting the compilation removes its games in one step.
alter table public.games add column if not exists compilation_id uuid
  references public.compilations (id) on delete cascade;
-- Denormalized compilation title for the board badge (like family_name), set on
-- every child so the "Part of …" tag renders without a join.
alter table public.games add column if not exists compilation_name text;
create index if not exists games_compilation_idx on public.games (user_id, compilation_id);

-- Writes go exclusively through the security-definer RPCs (which bypass RLS);
-- clients may only read their own compilations.
alter table public.compilations enable row level security;
revoke insert, update, delete on public.compilations from authenticated;
revoke insert, update, delete on public.compilations from anon;
drop policy if exists "compilations_select_own" on public.compilations;
create policy "compilations_select_own" on public.compilations
  for select to authenticated using (auth.uid() = user_id);

-- Append-only audit of compilation lifecycle (created/deleted), with snapshots so
-- the history survives the source rows. Read-own + admin; never client-written.
create table if not exists public.compilation_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  compilation_id uuid references public.compilations (id) on delete set null,
  event_type     text not null check (event_type in ('created', 'deleted')),
  title          text,
  total_cost     numeric,
  child_count    integer,
  created_at     timestamptz not null default now()
);
-- Allow 'updated' events too (compilations created before editing existed used a
-- two-value constraint). Idempotent: drop + re-add the named constraint.
alter table public.compilation_events drop constraint if exists compilation_events_event_type_check;
alter table public.compilation_events add constraint compilation_events_event_type_check
  check (event_type in ('created', 'deleted', 'updated'));
create index if not exists compilation_events_user_idx
  on public.compilation_events (user_id, created_at desc, id desc);
alter table public.compilation_events enable row level security;
revoke insert, update, delete on public.compilation_events from authenticated;
revoke insert, update, delete on public.compilation_events from anon;
drop policy if exists "compilation_events_select" on public.compilation_events;
create policy "compilation_events_select" on public.compilation_events
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

alter table public.slot_definitions enable row level security;
alter table public.user_slots       enable row level security;

-- Slot definitions: readable by anyone signed in (clients show the rules);
-- only admins may create/modify them.
drop policy if exists "slot_definitions_select" on public.slot_definitions;
create policy "slot_definitions_select" on public.slot_definitions
  for select to authenticated using (true);

drop policy if exists "slot_definitions_admin_write" on public.slot_definitions;
create policy "slot_definitions_admin_write" on public.slot_definitions
  for all to authenticated
  using (public.has_permission('slots.manage'))
  with check (public.has_permission('slots.manage'));

-- User slots: a user may read their own grants; only admins may grant/revoke.
drop policy if exists "user_slots_select" on public.user_slots;
create policy "user_slots_select" on public.user_slots
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.has_permission('slots.manage')
  );

drop policy if exists "user_slots_admin_write" on public.user_slots;
create policy "user_slots_admin_write" on public.user_slots
  for all to authenticated
  using (public.has_permission('slots.manage'))
  with check (public.has_permission('slots.manage'));

-- ---------------------------------------------------------------------------
-- Feature requests: a public board. Anyone signed in can submit + upvote;
-- admins manage status through a kanban. status + updated_at are the basis for
-- a future "your request is now in progress" notification system.
-- ---------------------------------------------------------------------------

create table if not exists public.feature_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null default 'feature'
                  check (kind in ('feature', 'bug')),
  title         text not null,
  description   text,
  status        text not null default 'submitted'
                  check (status in ('submitted', 'planned', 'in_progress', 'changes_requested', 'awaiting_feedback', 'done', 'declined')),
  is_admin_item boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- edited_at: set only when the author edits the title/description/kind (NOT on
  -- status moves), so the UI can show an "edited" marker. null = never edited.
  edited_at     timestamptz
);

create index if not exists feature_requests_status_idx on public.feature_requests (status);

alter table public.feature_requests add column if not exists edited_at timestamptz;

-- Migration for boards created before bug reports existed (safe to re-run):
alter table public.feature_requests add column if not exists kind text not null default 'feature';
alter table public.feature_requests drop constraint if exists feature_requests_kind_check;
alter table public.feature_requests add constraint feature_requests_kind_check
  check (kind in ('feature', 'bug'));

-- Migration for boards created before the 'awaiting_feedback' / 'changes_requested'
-- statuses existed ('awaiting_feedback' = dev complete, waiting on the requester to
-- sign off; 'changes_requested' = sent back to the requester for changes). Safe to
-- re-run. Without 'changes_requested', moving an item there — including the server's
-- own respond_feature_request non-approval path — violated the check constraint.
alter table public.feature_requests drop constraint if exists feature_requests_status_check;
alter table public.feature_requests add constraint feature_requests_status_check
  check (status in ('submitted', 'planned', 'in_progress', 'changes_requested', 'awaiting_feedback', 'done', 'declined'));

-- Tags (free-form labels like 'mobile', 'quality of life') and a triage priority.
-- Tags are a plain text[]; the app normalizes them to lowercase. Priority defaults
-- to 'medium' and can be raised/lowered on create or edit.
alter table public.feature_requests add column if not exists tags text[] not null default '{}'::text[];
alter table public.feature_requests add column if not exists priority text not null default 'medium';
alter table public.feature_requests drop constraint if exists feature_requests_priority_check;
alter table public.feature_requests add constraint feature_requests_priority_check
  check (priority in ('low', 'medium', 'high'));

-- Effort: a story-point-style size estimate (how much work an item is), separate
-- from priority (how important it is). Defaults to 'medium'; set/changed on create
-- or edit, same as priority. The select-* issues view re-expands to include it
-- when this file is re-run.
alter table public.feature_requests add column if not exists effort text not null default 'medium';
alter table public.feature_requests drop constraint if exists feature_requests_effort_check;
alter table public.feature_requests add constraint feature_requests_effort_check
  check (effort in ('low', 'medium', 'high'));

-- One row per user per request — the primary key prevents double-voting.
create table if not exists public.feature_votes (
  request_id uuid not null references public.feature_requests (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- Comment thread per request. parent_id (nullable) makes a row a reply to another
-- comment, which is how "you were replied to" notifications are targeted.
create table if not exists public.feature_comments (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.feature_requests (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  parent_id  uuid references public.feature_comments (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_comments_request_idx
  on public.feature_comments (request_id, created_at);

-- Emoji reactions on comments. One row per user per comment per emoji; the check
-- constraint pins the allowed set so clients can't store arbitrary values.
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.feature_comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

alter table public.comment_reactions drop constraint if exists comment_reactions_emoji_check;
alter table public.comment_reactions add constraint comment_reactions_emoji_check
  check (emoji in ('👍', '❤️', '🎉', '😄'));

create index if not exists comment_reactions_comment_idx
  on public.comment_reactions (comment_id);

-- Attachments on a feature/bug report: screenshots and log/text files, stored in
-- the 'attachments' storage bucket (policies below). One row per file. Comments
-- don't have attachments.
create table if not exists public.feature_attachments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.feature_requests (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- url: public URL (with ?v= cache-buster). path: storage path, kept for deletion.
  url          text not null,
  path         text not null,
  name         text not null,        -- original filename, shown in the UI
  content_type text not null,
  size         integer not null,
  created_at   timestamptz not null default now()
);

create index if not exists feature_attachments_request_idx
  on public.feature_attachments (request_id, created_at);

-- comment_id: when set, this attachment belongs to a comment (not the report
-- body). Null = a report-level attachment. request_id stays populated either way
-- (it's the parent request, used for grouping + the storage path). Additive +
-- cascades if the comment is deleted.
alter table public.feature_attachments
  add column if not exists comment_id uuid references public.feature_comments (id) on delete cascade;

create index if not exists feature_attachments_comment_idx
  on public.feature_attachments (comment_id);

-- ---------------------------------------------------------------------------
-- Notifications: per-user alerts. Rows are created only by the security-definer
-- triggers below (one user's action can alert another) — never by the client.
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,  -- recipient
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- Users may mark their own notifications read — only the read_at column, never the
-- content. Inserts come exclusively from triggers (no insert grant/policy).
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Universal economy ledger: one immutable row per coin/charter movement. Like
-- notifications, rows are inserted ONLY by the security-definer economy RPCs
-- (never the client) and form a permanent, append-only "bank statement". It is
-- dual-currency from the start (coin_delta + charter_delta) so Import Charters
-- log here too. coin_balance_after is the running balance snapshotted at write
-- time — robust, since pre-ledger history can't be reconstructed. game_title is
-- denormalized so a row survives the game being deleted (game_id then nulls).
create table if not exists public.coin_events (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  kind                  text not null,
  coin_delta            integer not null default 0,
  charter_delta         integer not null default 0,
  coin_balance_after    integer,
  charter_balance_after integer,
  game_id               uuid references public.games (id) on delete set null,
  game_title            text,
  label                 text,
  created_at            timestamptz not null default now()
);

-- Keyset pagination reads newest-first; id is the stable tiebreak for same-instant rows.
create index if not exists coin_events_user_idx
  on public.coin_events (user_id, created_at desc, id desc);

-- detail: optional structured metadata for an event (additive). Used e.g. by a
-- Shelve It to record {forfeit, price_paid} so "Sunk Costs" is a plain sum
-- instead of pairing each refund back to its purchase.
alter table public.coin_events add column if not exists detail jsonb not null default '{}'::jsonb;

-- Vouchers as a third ledger currency (additive, mirroring charter_delta). A
-- signup/admin grant moves +n; a redemption moves −1; every other event is
-- voucher-neutral (delta 0). voucher_balance_after snapshots the running balance
-- like the other currencies. Existing rows default to 0 / null — no backfill.
alter table public.coin_events add column if not exists voucher_delta integer not null default 0;
alter table public.coin_events add column if not exists voucher_balance_after integer;

-- The ledger is strictly read-only to clients: they may SELECT their own rows
-- (RLS below) but never write. Inserts come exclusively from the definer RPCs.
revoke insert, update, delete on public.coin_events from authenticated;
revoke insert, update, delete on public.coin_events from anon;

-- One-time opening-balance baseline so the running balance is internally
-- consistent from the first real event onward (the ledger starts mid-stream for
-- existing users). Idempotent — only seeds users without an opening row — and
-- purely additive (new rows in a new table, no existing data touched).
insert into public.coin_events
  (user_id, kind, coin_delta, charter_delta, coin_balance_after, charter_balance_after, label)
select p.id, 'opening', 0, 0, p.coins, 0, 'Opening balance'
  from public.profiles p
 where not exists (
   select 1 from public.coin_events e where e.user_id = p.id and e.kind = 'opening'
 );

-- ---------------------------------------------------------------------------
-- Badges & titles: prestige markers shown on a player's profile. `badges` is the
-- catalog (add a badge = one row); `user_badges` records who holds what. Phase 1
-- badges are admin-granted ('granted' kind); 'competitive' is reserved for a
-- later phase. A user picks one held badge to display as their title via
-- profiles.selected_badge_id. Public prestige: everyone can read the catalog and
-- holders; only the security-definer functions below (admin-gated) write.
-- ---------------------------------------------------------------------------
create table if not exists public.badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,                 -- stable key (e.g. 'beta-tester')
  name        text not null,
  description text,
  icon        text not null default 'award',        -- lucide icon name; see src/lib/badges.ts
  kind        text not null default 'granted'
                check (kind in ('granted', 'competitive')),
  prestige    integer not null default 0,           -- higher = rarer/fancier (sort + colour)
  created_at  timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id    uuid not null references auth.users (id) on delete cascade,
  badge_id   uuid not null references public.badges (id) on delete cascade,
  source     text not null default 'admin'
               check (source in ('admin', 'cohort', 'auto')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  -- revoked_at: soft-revoke so the record of who held a badge (and when) is never
  -- destroyed. Active = revoked_at is null.
  revoked_at timestamptz,
  primary key (user_id, badge_id)
);

create index if not exists user_badges_user_idx on public.user_badges (user_id);

-- The badge a user has chosen to display as their title (null = none). Added here
-- (after the badges table exists) so the FK resolves; clearing the badge clears
-- the title.
alter table public.profiles
  add column if not exists selected_badge_id uuid references public.badges (id) on delete set null;

alter table public.badges      enable row level security;
alter table public.user_badges enable row level security;

-- The catalog and holdings are public prestige — readable by anyone signed in.
-- There are deliberately no write policies: all writes go through the
-- security-definer functions below, so clients can't grant themselves a badge.
drop policy if exists "badges_select" on public.badges;
create policy "badges_select" on public.badges
  for select to authenticated using (true);

drop policy if exists "user_badges_select" on public.user_badges;
create policy "user_badges_select" on public.user_badges
  for select to authenticated using (true);

-- Seed the launch badge and grant it to everyone who already has an account (the
-- beta cohort). Purely additive + idempotent: re-running adds nothing and removes
-- nothing, so no existing data is touched. New signups after this migration won't
-- receive it — being a beta tester is a one-time, time-bounded distinction.
insert into public.badges (slug, name, description, icon, kind, prestige)
values ('beta-tester', 'Beta Tester',
        'Was here during the Backlog Bazaar beta — thanks for helping shape it!',
        'flask-conical', 'granted', 10)
on conflict (slug) do nothing;

insert into public.user_badges (user_id, badge_id, source)
select p.id, b.id, 'cohort'
  from public.profiles p
  cross join public.badges b
 where b.slug = 'beta-tester'
on conflict (user_id, badge_id) do nothing;

-- Read helpers for embedding badges in the profile/leaderboard/admin payloads.
-- Defined here (right after the tables) so the functions further down that call
-- them already exist when those are created. Plain (not security definer): when
-- called inside a security-definer function they run as the owner and so bypass
-- RLS; called directly by a signed-in user they rely on the public-read policies.

-- A user's active badges as a JSON array (rarest/highest-prestige first).
create or replace function public.user_badges_json(p_user uuid)
returns jsonb
language sql stable set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id, 'slug', b.slug, 'name', b.name,
        'description', b.description, 'icon', b.icon, 'prestige', b.prestige
      )
      order by b.prestige desc, b.name
    ) filter (where b.id is not null),
    '[]'::jsonb
  )
  from public.user_badges ub
  join public.badges b on b.id = ub.badge_id
  where ub.user_id = p_user and ub.revoked_at is null;
$$;

-- The single badge a user displays as their title, as a JSON object (or null if
-- unset or the badge was revoked — so a revoked title never lingers).
create or replace function public.user_title_json(p_user uuid)
returns jsonb
language sql stable set search_path = public
as $$
  select case when b.id is null then null else
    jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name,
      'description', b.description, 'icon', b.icon, 'prestige', b.prestige
    )
  end
  from public.profiles p
  left join public.user_badges ub
    on ub.user_id = p.id and ub.badge_id = p.selected_badge_id and ub.revoked_at is null
  left join public.badges b on b.id = ub.badge_id
  where p.id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Game catalog: a small community-shared metadata table keyed by RAWG id. Today
-- it only collects platforms a game released on, so a platform one player adds
-- (because RAWG was missing it) shows up for everyone who adds that game later.
-- Readable by all; only mutated through contribute_platforms (which unions, never
-- overwrites), so one user can't clobber another's contributions.
-- ---------------------------------------------------------------------------
create table if not exists public.game_catalog (
  rawg_id    integer primary key,
  platforms  jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_catalog enable row level security;
drop policy if exists "game_catalog_read" on public.game_catalog;
create policy "game_catalog_read" on public.game_catalog
  for select to anon, authenticated using (true);
-- No direct insert/update/delete policies: writes go through the RPC below.

-- Set a game's catalog platforms to exactly the supplied list (trimmed, deduped
-- case-insensitively, first spelling kept). This is authoritative — an editor can
-- both add and remove platforms, and future adders of this RAWG game inherit the
-- result. Security-definer + a signed-in check so users can curate without direct
-- table write access. (Replaces the earlier add-only contribute_platforms, which
-- couldn't remove a wrongly-listed platform.)
create or replace function public.set_catalog_platforms(p_rawg_id integer, p_platforms text[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_clean text[] := array[]::text[];
  v_label text;
begin
  if p_rawg_id is null then
    return;
  end if;
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;

  if p_platforms is not null then
    foreach v_label in array p_platforms loop
      v_label := btrim(v_label);
      if v_label <> '' and not (
        lower(v_label) = any (select lower(x) from unnest(v_clean) as x)
      ) then
        v_clean := array_append(v_clean, v_label);
      end if;
    end loop;
  end if;

  insert into public.game_catalog (rawg_id, platforms, updated_at)
  values (p_rawg_id, to_jsonb(v_clean), now())
  on conflict (rawg_id) do update set platforms = excluded.platforms, updated_at = now();
end;
$$;

-- Superseded by set_catalog_platforms (add + remove). Safe to re-run.
drop function if exists public.contribute_platforms(integer, text[]);

-- ---------------------------------------------------------------------------
-- Community-driven catalog (moderated). catalog_games is the master metadata
-- record for a game — RAWG games (rawg_id set) and community-added games
-- (rawg_id null, identified by the uuid id). game_submissions is the staging
-- queue: users propose edits/new games, an admin approves, and only then does
-- the approve RPC write the master record and cascade it to every owner's copy.
-- This replaces the old instant-share platform editing (set_catalog_platforms,
-- dropped below): nothing reaches the global catalog without moderation.
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_games (
  id         uuid primary key default gen_random_uuid(),
  rawg_id    integer unique,                 -- null for community-added games
  title      text,
  image      text,
  platforms  jsonb not null default '[]'::jsonb,
  genres     jsonb not null default '[]'::jsonb,
  released   date,
  hours      real,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- developers: the studio(s) that made the game, community-editable like platforms
-- and genres. Additive: existing rows default to an empty list.
alter table public.catalog_games add column if not exists developers jsonb not null default '[]'::jsonb;
-- screenshots: an ordered list of public image URLs (a few preview shots per game),
-- community-editable through the moderation queue like the other catalog fields.
-- Catalog-level only (never cascaded to personal games). Additive: defaults empty.
alter table public.catalog_games add column if not exists screenshots jsonb not null default '[]'::jsonb;

-- Preserve every existing community platform contribution: copy the legacy
-- game_catalog rows (platforms-only, keyed by rawg_id) into the new table. The
-- old table is left intact; this is purely additive.
insert into public.catalog_games (rawg_id, platforms)
select gc.rawg_id, gc.platforms from public.game_catalog gc
on conflict (rawg_id) do nothing;

alter table public.catalog_games enable row level security;
drop policy if exists "catalog_games_read" on public.catalog_games;
create policy "catalog_games_read" on public.catalog_games
  for select to anon, authenticated using (true);
-- No write policies: the catalog is only mutated by the approve RPC below.

-- Link a user's game copy to its catalog master (so an approved edit can cascade
-- to community-added games too, which have no rawg_id). RAWG games still match by
-- rawg_id; this is set on approval and when adding a community game.
alter table public.games add column if not exists catalog_id uuid
  references public.catalog_games (id) on delete set null;
create index if not exists games_catalog_id_idx on public.games (catalog_id);

-- The moderation staging queue. A submission never touches the live tables; the
-- admin approve/reject RPCs are the only path forward.
create table if not exists public.game_submissions (
  id          uuid primary key default gen_random_uuid(),
  submitter   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('edit', 'new')),
  catalog_id  uuid references public.catalog_games (id) on delete cascade, -- edit of a known catalog game
  rawg_id     integer,                         -- edit of a RAWG game not yet in catalog_games
  -- Proposed metadata (a full snapshot of the form, current values + edits).
  title       text,
  image       text,
  platforms   jsonb not null default '[]'::jsonb,
  genres      jsonb not null default '[]'::jsonb,
  released    date,
  hours       real,
  developers  jsonb not null default '[]'::jsonb, -- proposed studio(s) (see catalog_games.developers)
  -- Snapshot of the values at submit time, so the admin diff has a baseline even
  -- when no catalog row exists yet.
  before      jsonb,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer    uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now()
);
create index if not exists game_submissions_status_idx
  on public.game_submissions (status, created_at);
-- reward: coins actually paid to the submitter on approval (null until decided).
-- Recorded so the submitter can see the payout on their contributions page.
alter table public.game_submissions add column if not exists reward integer;
-- approved_fields: which fields were actually committed on approval (all of them
-- for a full approval, a subset for a partial). Lets the submitter see exactly
-- what went live vs. what was declined. Null until approved.
alter table public.game_submissions add column if not exists approved_fields text[];
-- developers: the proposed studio list (added after launch; existing rows default
-- to an empty list). Committed to catalog_games on approval like the other fields.
alter table public.game_submissions add column if not exists developers jsonb not null default '[]'::jsonb;
-- screenshots: the proposed preview image URLs (added after launch; existing rows
-- default to an empty list). Committed to catalog_games on approval like the other
-- fields, but NOT cascaded to personal games (catalog-level metadata only).
alter table public.game_submissions add column if not exists screenshots jsonb not null default '[]'::jsonb;
-- deleted_at: an admin soft-delete, so a spam/bad submission can be removed from the
-- active queue while its history (who/what/when) survives. Null = not deleted.
alter table public.game_submissions add column if not exists deleted_at timestamptz;
-- reverted_*: an admin rolled an approved EDIT back to its pre-approval values
-- (restoring the `before` snapshot onto catalog_games + cascading to copies). The
-- submission stays in the log as the audit trail of what happened; these columns
-- are the append-only record of who undid it, when, and which fields were rolled
-- back (a subset of approved_fields — fields a later edit superseded are skipped).
-- Null reverted_at = never reverted. See revert_game_submission below.
alter table public.game_submissions add column if not exists reverted_at timestamptz;
alter table public.game_submissions add column if not exists reverted_by uuid
  references public.profiles (id) on delete set null;
alter table public.game_submissions add column if not exists reverted_fields text[];

alter table public.game_submissions enable row level security;
-- A user may read their own submissions; admins may read all (the admin queue
-- also goes through the security-definer RPC below).
drop policy if exists "game_submissions_select" on public.game_submissions;
create policy "game_submissions_select" on public.game_submissions
  for select to authenticated using (
    auth.uid() = submitter
    or public.has_permission('submissions.games.moderate')
  );
-- A user may file their own submission (kind/fields validated by the form +
-- approve RPC). Status moves only via the RPCs, which run as security-definer.
drop policy if exists "game_submissions_insert_own" on public.game_submissions;
create policy "game_submissions_insert_own" on public.game_submissions
  for insert to authenticated with check (auth.uid() = submitter);

-- Keep a submission's history when its catalog row is deleted. Originally this FK
-- cascaded (deleting a catalog row destroyed every submission that targeted it,
-- losing the moderation audit trail). Flip it to SET NULL so the append-only record
-- survives — who proposed/approved what stays, it just loses its live link. Drop +
-- re-add is idempotent (the constraint name is the Postgres default).
alter table public.game_submissions
  drop constraint if exists game_submissions_catalog_id_fkey;
alter table public.game_submissions
  add constraint game_submissions_catalog_id_fkey
  foreign key (catalog_id) references public.catalog_games (id) on delete set null;

-- ---------------------------------------------------------------------------
-- One-time repair (idempotent): community catalog games (rawg_id null) had no
-- uniqueness, and a bug let every EDIT of an unlinked community game mint a fresh
-- duplicate catalog row that matched no copy ("approved but never applied" + ghost
-- listings in search). Merge duplicates by normalized title into the earliest row,
-- relink every dependent, delete the now-redundant extras, backfill the link onto
-- legacy custom copies, then enforce uniqueness so it can't recur. No user game,
-- coin, or submission row is lost — only redundant, now-orphaned catalog rows.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;       -- one normalized-title group with >1 community row
  v_keep uuid;    -- the surviving (earliest) row in the group
begin
  for r in
    select lower(btrim(title)) as norm
      from public.catalog_games
     where rawg_id is null and title is not null and btrim(title) <> ''
     group by lower(btrim(title))
    having count(*) > 1
  loop
    select id into v_keep from public.catalog_games
     where rawg_id is null and lower(btrim(title)) = r.norm
     order by created_at asc
     limit 1;

    -- Consolidate the best non-empty value of each field from the whole group onto
    -- the survivor, so approved metadata that landed on a later duplicate isn't lost.
    -- (max() over the group ignores nulls; '[]' jsonb is treated as "empty".)
    update public.catalog_games keep set
      title       = coalesce(nullif(btrim(keep.title), ''), agg.title),
      image       = coalesce(nullif(keep.image, ''), agg.image),
      released    = coalesce(keep.released, agg.released),
      hours       = coalesce(keep.hours, agg.hours),
      platforms   = case when keep.platforms = '[]'::jsonb then coalesce(agg.platforms, keep.platforms) else keep.platforms end,
      genres      = case when keep.genres = '[]'::jsonb then coalesce(agg.genres, keep.genres) else keep.genres end,
      developers  = case when keep.developers = '[]'::jsonb then coalesce(agg.developers, keep.developers) else keep.developers end,
      screenshots = case when keep.screenshots = '[]'::jsonb then coalesce(agg.screenshots, keep.screenshots) else keep.screenshots end,
      updated_at  = now()
    from (
      -- jsonb has no max() aggregate, so pick the first non-empty value with
      -- (array_agg(...) filter (...))[1]; scalar fields use max() (nulls ignored).
      select
        max(title)    filter (where btrim(title) <> '')        as title,
        max(image)    filter (where btrim(coalesce(image, '')) <> '') as image,
        max(released)                                          as released,
        max(hours)                                             as hours,
        (array_agg(platforms)   filter (where platforms   <> '[]'::jsonb))[1] as platforms,
        (array_agg(genres)      filter (where genres      <> '[]'::jsonb))[1] as genres,
        (array_agg(developers)  filter (where developers  <> '[]'::jsonb))[1] as developers,
        (array_agg(screenshots) filter (where screenshots <> '[]'::jsonb))[1] as screenshots
      from public.catalog_games
      where rawg_id is null and lower(btrim(title)) = r.norm and id <> v_keep
    ) agg
    where keep.id = v_keep;

    -- Relink every dependent to the survivor BEFORE deleting the duplicates.
    update public.games set catalog_id = v_keep
     where catalog_id in (
       select id from public.catalog_games
        where rawg_id is null and lower(btrim(title)) = r.norm and id <> v_keep);
    update public.game_submissions set catalog_id = v_keep
     where catalog_id in (
       select id from public.catalog_games
        where rawg_id is null and lower(btrim(title)) = r.norm and id <> v_keep);

    delete from public.catalog_games
     where rawg_id is null and lower(btrim(title)) = r.norm and id <> v_keep;
  end loop;
end $$;

-- Backfill: link community library copies added as custom games (no rawg, no catalog
-- link) to the canonical catalog row sharing their title, so future approved edits
-- cascade to them.
update public.games g
   set catalog_id = c.id
  from public.catalog_games c
 where g.rawg_id is null and g.catalog_id is null
   and c.rawg_id is null and c.title is not null
   and lower(btrim(g.title)) = lower(btrim(c.title));

-- Now that community titles are de-duplicated, enforce uniqueness so a duplicate
-- can't return. Same normal form the dedup used; excludes platforms-only (null-title)
-- backfill rows and all RAWG rows (which already have a unique rawg_id).
create unique index if not exists catalog_games_community_title_idx
  on public.catalog_games (lower(btrim(title)))
  where rawg_id is null and title is not null;

-- ---------------------------------------------------------------------------
-- Catalog storage bucket. Public read (proposed cover art shows in the queue and
-- becomes the global cover on approval); a user may only write under their own
-- uid folder: catalog/<uid>/<filename>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do update set public = true;

drop policy if exists "catalog_public_read" on storage.objects;
create policy "catalog_public_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'catalog');

drop policy if exists "catalog_insert_own" on storage.objects;
create policy "catalog_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catalog' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "catalog_update_own" on storage.objects;
create policy "catalog_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'catalog' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'catalog' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "catalog_delete_own" on storage.objects;
create policy "catalog_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'catalog' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deprecate the legacy instant-share platform write. Platform corrections now go
-- through the moderation queue like every other metadata change. The read path
-- (game_catalog / catalog_games platforms) is unaffected.
drop function if exists public.set_catalog_platforms(integer, text[]);

-- Approve a submission (admin only): upsert the master catalog record, cascade
-- the catalog-only metadata to every existing copy of the game, reward the
-- submitter, and notify them. Security-definer so it can write the global tables
-- and the notification; re-checks the caller is an admin.
--
-- p_fields is the set of fields to commit (subset of title/image/platforms/
-- genres/released/hours). NULL = approve everything (full reward); a non-null
-- subset is a PARTIAL approval — only those fields change and the reward is
-- halved. Fields left out keep their current value on the master record and on
-- every copy.
--
-- The signature changed (added p_fields), so the old 2-arg version is dropped.
drop function if exists public.approve_game_submission(uuid, text);
create or replace function public.approve_game_submission(p_id uuid, p_note text, p_fields text[] default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s         public.game_submissions%rowtype;
  v_catalog uuid;
  v_reward  integer;
  v_partial boolean;
  v_new_coins integer;
  v_norm    text;
  v_t boolean; v_i boolean; v_p boolean; v_g boolean; v_r boolean; v_h boolean; v_d boolean; v_s boolean;
begin
  if not public.has_permission('submissions.games.moderate') then
    raise exception 'Not authorized';
  end if;

  select * into s from public.game_submissions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.status <> 'pending' then raise exception 'Submission already reviewed'; end if;

  -- Decide which fields to commit. NULL p_fields = full approval (all fields).
  v_partial := p_fields is not null;
  if v_partial and coalesce(array_length(p_fields, 1), 0) = 0 then
    raise exception 'Select at least one field to approve';
  end if;
  v_t := not v_partial or 'title'     = any(p_fields);
  v_i := not v_partial or 'image'     = any(p_fields);
  v_p := not v_partial or 'platforms' = any(p_fields);
  v_g := not v_partial or 'genres'     = any(p_fields);
  v_d := not v_partial or 'developers' = any(p_fields);
  v_r := not v_partial or 'released'   = any(p_fields);
  v_h := not v_partial or 'hours'      = any(p_fields);
  v_s := not v_partial or 'screenshots' = any(p_fields);
  -- A new catalog entry must carry its title.
  if s.kind = 'new' then v_t := true; end if;

  -- Resolve (creating if needed) the catalog row this submission targets. The
  -- metadata is written by the conditional UPDATE below, not the insert.
  if s.catalog_id is not null then
    v_catalog := s.catalog_id;
  elsif s.rawg_id is not null then
    insert into public.catalog_games (rawg_id, created_by)
    values (s.rawg_id, s.submitter)
    on conflict (rawg_id) do update set updated_at = now()
    returning id into v_catalog;
  else
    -- Community submission (no catalog link, no RAWG id). An EDIT of a community
    -- game whose library copy was never linked must NOT mint a fresh duplicate on
    -- every approval — resolve the existing community row by normalized title (the
    -- pre-edit title the unlinked copies still hold). Only create a brand-new row
    -- when this game truly isn't catalogued yet.
    v_norm := lower(btrim(coalesce(nullif(btrim(s.before->>'title'), ''), s.title)));
    if v_norm <> '' then
      select id into v_catalog from public.catalog_games
       where rawg_id is null and lower(btrim(title)) = v_norm
       order by created_at asc
       limit 1;
    end if;
    if v_catalog is null then
      insert into public.catalog_games (created_by, title) values (s.submitter, s.title)
      returning id into v_catalog;
    end if;
    -- Adopt any community copies that were added as custom games before this game
    -- entered the catalog (rawg_id null, catalog_id null, same title) so the cascade
    -- below reaches them and the edit actually applies.
    if v_norm <> '' then
      update public.games
         set catalog_id = v_catalog
       where rawg_id is null and catalog_id is null
         and lower(btrim(title)) = v_norm;
    end if;
  end if;

  -- Write the accepted fields onto the master record (others keep their value).
  update public.catalog_games set
    title     = case when v_t then s.title     else title     end,
    image     = case when v_i then s.image     else image     end,
    platforms = case when v_p then s.platforms  else platforms  end,
    genres    = case when v_g then s.genres     else genres     end,
    developers = case when v_d then s.developers else developers end,
    released  = case when v_r then s.released    else released   end,
    hours     = case when v_h then s.hours      else hours      end,
    screenshots = case when v_s then s.screenshots else screenshots end,
    updated_at = now()
  where id = v_catalog;

  -- Cascade the accepted fields to every existing copy (match by rawg_id or the
  -- catalog link). Personal data is never touched — played hours, copies, status,
  -- coins, and progress notes are left as-is. A user's custom cover survives: only
  -- stock_image is reset to the new art (so "restore default" lands on it), and
  -- image is updated only when they hadn't customized it. NOTE: screenshots are
  -- catalog-level only — intentionally NOT cascaded here (the gallery reads them
  -- straight from the catalog row).
  update public.games g set
    catalog_id  = c.id,
    title       = case when v_t then c.title      else g.title      end,
    platforms   = case when v_p then c.platforms  else g.platforms  end,
    genres      = case when v_g then c.genres     else g.genres     end,
    developers  = case when v_d then c.developers else g.developers end,
    released    = case when v_r then c.released    else g.released   end,
    hours       = case when v_h then c.hours      else g.hours      end,
    image       = case when v_i and (g.image is null or g.image is not distinct from g.stock_image)
                       then c.image else g.image end,
    stock_image = case when v_i then c.image else g.stock_image end
  from public.catalog_games c
  where c.id = v_catalog
    and ((c.rawg_id is not null and g.rawg_id = c.rawg_id) or g.catalog_id = c.id);

  -- An approved new game is NOT auto-added to the submitter's Bazaar — it just
  -- becomes available in the shared catalog (searchable by everyone), and anyone,
  -- including the submitter, can add it from there if they want it.

  -- Reward the submitter (server-authoritative). A partial approval pays half,
  -- rounded down, but at least 1 coin when the reward is set above 0.
  select submission_reward into v_reward from public.app_config where id = 1;
  v_reward := coalesce(v_reward, 15);
  if v_partial then
    v_reward := greatest(case when v_reward > 0 then 1 else 0 end, v_reward / 2);
  end if;
  -- No contribution reward for a self-review: a moderator approving their own
  -- submission (e.g. a direct edit that bypasses the queue) doesn't earn coins.
  if s.submitter = auth.uid() then
    v_reward := 0;
  end if;
  update public.profiles set coins = coins + v_reward where id = s.submitter
    returning coins into v_new_coins;

  -- Log the contribution reward to the submitter's ledger (only when it pays).
  -- Snapshot the game title + the kind of contribution so the Transaction Ledger
  -- can show what the reward was for (e.g. "Catalog edit" of a given game). Only
  -- new rewards carry this detail — existing ledger rows are left as-is.
  if v_reward > 0 then
    perform public.log_coin_event(
      s.submitter, 'submission_reward', v_reward, 0, v_new_coins, null,
      null,
      coalesce(nullif(btrim(s.title), ''), 'Catalog contribution'),
      case when s.kind = 'new' then 'New game' else 'Catalog edit' end
        || case when v_partial then ' · partial approval' else '' end
    );
  end if;

  -- Notify the submitter (server-side; never notify yourself about your own action).
  -- The link deep-points at this item on their My contributions page.
  if s.submitter <> auth.uid() then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      s.submitter, 'submission_approved',
      case when v_partial then 'Your game contribution was partly approved'
           else 'Your game contribution was approved' end,
      coalesce(
        nullif(btrim(p_note), ''),
        case when v_partial then 'Some of your changes are now live for everyone.'
             else 'Your changes are now live for everyone.' end
      ) || ' (+' || v_reward || ' coins)',
      'mysubmissions:' || p_id
    );
  end if;

  update public.game_submissions set
    status = 'approved', reviewer = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(p_note), ''), reward = v_reward,
    approved_fields = coalesce(
      p_fields,
      array['title', 'image', 'platforms', 'genres', 'developers', 'released', 'hours', 'screenshots']
    )
  where id = p_id;
end;
$$;

-- Reject a submission (admin only): mark it and notify the submitter. No live
-- tables change.
create or replace function public.reject_game_submission(p_id uuid, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s public.game_submissions%rowtype;
begin
  if not public.has_permission('submissions.games.moderate') then
    raise exception 'Not authorized';
  end if;

  select * into s from public.game_submissions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.status <> 'pending' then raise exception 'Submission already reviewed'; end if;

  update public.game_submissions set
    status = 'rejected', reviewer = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(p_note), '')
  where id = p_id;

  if s.submitter <> auth.uid() then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      s.submitter, 'submission_rejected',
      'Your game contribution wasn''t approved',
      nullif(btrim(p_note), ''),
      'mysubmissions:' || p_id
    );
  end if;
end;
$$;

-- Admin soft-delete of a game submission: removes it from the active queue while
-- preserving the row. Does NOT revert any already-approved catalog change (the
-- shared game stays); it just clears the moderation record. Idempotent.
create or replace function public.delete_game_submission(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('submissions.games.moderate') then
    raise exception 'Not authorized';
  end if;
  update public.game_submissions set deleted_at = now() where id = p_id;
end;
$$;

-- Revert an approved catalog EDIT (admin only): roll the master catalog record
-- (and every existing copy) back to the pre-approval `before` snapshot for the
-- fields this submission committed, then mark the submission reverted. The inverse
-- of approve_game_submission — same cascade + custom-cover guards, restoring the
-- old values instead of the proposed ones. The submission row is kept as the audit
-- trail; the reward coins are NOT clawed back.
--
-- Safety: only approved edits qualify (a 'new' approval has no prior state and may
-- already be in players' libraries — never deletes a catalog game). A field is
-- restored ONLY if the catalog's current value still equals what this approval set
-- it to; a field a LATER edit changed is skipped (never clobbers newer data) and
-- reported back. Returns {reverted: text[], skipped: text[]}.
create or replace function public.revert_game_submission(p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s         public.game_submissions%rowtype;
  c         public.catalog_games%rowtype;
  v_catalog uuid;
  v_reverted text[] := '{}';
  v_skipped  text[] := '{}';
  v_t boolean; v_i boolean; v_p boolean; v_g boolean; v_d boolean; v_r boolean; v_h boolean; v_s boolean;
begin
  if not public.has_permission('submissions.games.moderate') then
    raise exception 'Not authorized';
  end if;

  select * into s from public.game_submissions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.kind <> 'edit' then
    raise exception 'Only an approved edit can be reverted (a new game may already be in player libraries)';
  end if;
  if s.status <> 'approved' then raise exception 'Only an approved submission can be reverted'; end if;
  if s.reverted_at is not null then raise exception 'This submission was already reverted'; end if;
  if s.before is null then raise exception 'No prior values to restore'; end if;

  -- Resolve the catalog row this approval wrote to (by explicit link or rawg_id).
  select * into c from public.catalog_games
   where id = s.catalog_id
      or (s.rawg_id is not null and rawg_id = s.rawg_id)
   limit 1;
  if not found then raise exception 'Nothing to revert — the catalog entry no longer exists'; end if;
  v_catalog := c.id;

  -- A field is revertable only if it was approved AND the catalog still holds the
  -- exact value this approval set (else a later edit superseded it — skip it).
  v_t := 'title'      = any(s.approved_fields) and c.title      is not distinct from s.title;
  v_i := 'image'      = any(s.approved_fields) and c.image      is not distinct from s.image;
  v_p := 'platforms'  = any(s.approved_fields) and c.platforms  = s.platforms;
  v_g := 'genres'     = any(s.approved_fields) and c.genres     = s.genres;
  v_d := 'developers' = any(s.approved_fields) and c.developers = s.developers;
  v_r := 'released'   = any(s.approved_fields) and c.released   is not distinct from s.released;
  v_h := 'hours'      = any(s.approved_fields) and c.hours      is not distinct from s.hours;
  -- Screenshots: gate on the catalog still holding the proposed set rather than on
  -- approved_fields. Early approvals omitted 'screenshots' from approved_fields, so
  -- a membership check would never revert them; the catalog-match below is the
  -- reliable signal that this approval is what put these screenshots live.
  v_s := s.screenshots is distinct from coalesce(s.before->'screenshots', '[]'::jsonb)
         and c.screenshots = s.screenshots;

  -- Record what's being reverted vs. skipped (skipped = approved but superseded).
  -- array_append (not ||) so the text element can't be misparsed as an array literal.
  if v_t then v_reverted := array_append(v_reverted, 'title');      elsif 'title'      = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'title');      end if;
  if v_i then v_reverted := array_append(v_reverted, 'image');      elsif 'image'      = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'image');      end if;
  if v_p then v_reverted := array_append(v_reverted, 'platforms');  elsif 'platforms'  = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'platforms');  end if;
  if v_g then v_reverted := array_append(v_reverted, 'genres');     elsif 'genres'     = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'genres');     end if;
  if v_d then v_reverted := array_append(v_reverted, 'developers'); elsif 'developers' = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'developers'); end if;
  if v_r then v_reverted := array_append(v_reverted, 'released');   elsif 'released'   = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'released');   end if;
  if v_h then v_reverted := array_append(v_reverted, 'hours');      elsif 'hours'      = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'hours');      end if;
  if v_s then v_reverted := array_append(v_reverted, 'screenshots'); elsif 'screenshots' = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'screenshots'); end if;

  if coalesce(array_length(v_reverted, 1), 0) = 0 then
    raise exception 'Nothing to revert — these values have all changed since approval';
  end if;

  -- Restore the master record's reverted fields to the pre-approval snapshot.
  update public.catalog_games set
    title     = case when v_t then s.before->>'title'           else title     end,
    image     = case when v_i then nullif(s.before->>'image', '') else image     end,
    platforms = case when v_p then coalesce(s.before->'platforms',  '[]'::jsonb) else platforms  end,
    genres    = case when v_g then coalesce(s.before->'genres',     '[]'::jsonb) else genres     end,
    developers = case when v_d then coalesce(s.before->'developers', '[]'::jsonb) else developers end,
    released  = case when v_r then nullif(s.before->>'released', '')::date else released end,
    hours     = case when v_h then nullif(s.before->>'hours', '')::real    else hours    end,
    screenshots = case when v_s then coalesce(s.before->'screenshots', '[]'::jsonb) else screenshots end,
    updated_at = now()
  where id = v_catalog;

  -- Cascade the restored fields to every existing copy — identical guards to
  -- approve_game_submission: only catalog-derived fields, custom covers preserved
  -- (image only when the user hadn't customized; stock_image reset to the restored
  -- art), personal data (played hours, copies, status, coins, notes) untouched.
  update public.games g set
    catalog_id  = cg.id,
    title       = case when v_t then cg.title      else g.title      end,
    platforms   = case when v_p then cg.platforms  else g.platforms  end,
    genres      = case when v_g then cg.genres     else g.genres     end,
    developers  = case when v_d then cg.developers else g.developers end,
    released    = case when v_r then cg.released    else g.released   end,
    hours       = case when v_h then cg.hours      else g.hours      end,
    image       = case when v_i and (g.image is null or g.image is not distinct from g.stock_image)
                       then cg.image else g.image end,
    stock_image = case when v_i then cg.image else g.stock_image end
  from public.catalog_games cg
  where cg.id = v_catalog
    and ((cg.rawg_id is not null and g.rawg_id = cg.rawg_id) or g.catalog_id = cg.id);

  -- Mark the submission reverted (kept in the log; approved_fields/status stay as
  -- the historical record of the approval itself).
  update public.game_submissions set
    reverted_at = now(), reverted_by = auth.uid(), reverted_fields = v_reverted
  where id = p_id;

  -- Notify the submitter their live change was rolled back (never notify yourself).
  -- Coins are unaffected; say so to avoid alarm.
  if s.submitter <> auth.uid() then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      s.submitter, 'submission_reverted',
      'A change of yours was rolled back',
      'An admin reverted your approved edit to "'
        || coalesce(nullif(btrim(s.title), ''), 'a game')
        || '". Your reward coins are unaffected.',
      'mysubmissions:' || p_id
    );
  end if;

  return jsonb_build_object('reverted', to_jsonb(v_reverted), 'skipped', to_jsonb(v_skipped));
end;
$$;

-- The admin moderation queue: every submission (pending + decided) with the
-- submitter's name, the live catalog values for the diff, and — once reviewed —
-- who decided it, when, which fields they took, and the reward paid. Admin-only;
-- returns nothing for non-admins (a SQL function can't raise). The client filters
-- and sorts (e.g. to show only pending). Dropped first: the return shape changed.
drop function if exists public.list_game_submissions();
create or replace function public.list_game_submissions()
returns table (
  id              uuid,
  submitter       uuid,
  submitter_name  text,
  kind            text,
  catalog_id      uuid,
  rawg_id         integer,
  title           text,
  image           text,
  platforms       jsonb,
  genres          jsonb,
  developers      jsonb,
  released        date,
  hours           real,
  screenshots     jsonb,
  before          jsonb,
  current         jsonb,
  status          text,
  reviewer        uuid,
  reviewer_name   text,
  reviewed_at     timestamptz,
  review_note     text,
  reward          integer,
  approved_fields text[],
  created_at      timestamptz,
  deleted_at      timestamptz,
  reverted_at     timestamptz,
  reverted_by     uuid,
  reverted_by_name text,
  reverted_fields text[]
)
language sql
security definer set search_path = public
as $$
  select
    s.id, s.submitter, p.display_name, s.kind, s.catalog_id, s.rawg_id,
    s.title, s.image, s.platforms, s.genres, s.developers, s.released, s.hours, s.screenshots, s.before,
    (
      select to_jsonb(c) from public.catalog_games c
      where c.id = s.catalog_id
         or (s.rawg_id is not null and c.rawg_id = s.rawg_id)
      limit 1
    ) as current,
    s.status, s.reviewer, rp.display_name, s.reviewed_at, s.review_note,
    s.reward, s.approved_fields,
    s.created_at, s.deleted_at,
    s.reverted_at, s.reverted_by, vp.display_name, s.reverted_fields
  from public.game_submissions s
  join public.profiles p on p.id = s.submitter
  left join public.profiles rp on rp.id = s.reviewer
  left join public.profiles vp on vp.id = s.reverted_by
  -- Hidden accounts (test/bot) are kept out of the queue entirely, like they are
  -- on the leaderboard. Un-hide the account to bring their submissions back.
  where not p.hidden
    and public.has_permission('submissions.games.moderate')
  order by s.created_at desc;
$$;

-- The pending count behind the admin sidebar badge — excludes hidden accounts so
-- test/bot submissions don't inflate it. Returns 0 for non-admins (the where
-- clause filters everything out when the caller isn't an admin).
create or replace function public.pending_submission_count()
returns integer
language sql
security definer set search_path = public
as $$
  select count(*)::int
  from public.game_submissions s
  join public.profiles p on p.id = s.submitter
  where s.status = 'pending'
    and not p.hidden
    and public.has_permission('submissions.games.moderate');
$$;

-- ---------------------------------------------------------------------------
-- Admin community-catalog manager. Community games (rawg_id null) are the only
-- catalog rows an admin can browse/edit/delete directly here; RAWG rows are keyed
-- by their unique rawg_id and managed through the moderation queue. All three RPCs
-- are security-definer + gated on submissions.games.moderate.
-- ---------------------------------------------------------------------------

-- Every community catalog entry with how many player libraries currently link to it
-- (owner_count needs definer to count across all users' games, past per-user RLS).
-- Admin-only; returns nothing for non-admins. Dropped first in case the shape changes.
drop function if exists public.list_community_catalog();
create or replace function public.list_community_catalog()
returns table (
  id          uuid,
  title       text,
  image       text,
  platforms   jsonb,
  genres      jsonb,
  developers  jsonb,
  released    date,
  hours       real,
  screenshots jsonb,
  owner_count bigint,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    c.id, c.title, c.image, c.platforms, c.genres, c.developers,
    c.released, c.hours, c.screenshots,
    (select count(*) from public.games g where g.catalog_id = c.id) as owner_count,
    c.created_at, c.updated_at
  from public.catalog_games c
  where c.rawg_id is null and c.title is not null and btrim(c.title) <> ''
    and public.has_permission('catalog.manage')
  order by c.title asc;
$$;

-- Admin direct edit of a community catalog entry (bypasses the suggestion queue):
-- write the master row, cascade catalog-derived fields to every copy (identical
-- guards to approve_game_submission — personal data + custom covers preserved), and
-- log the change as an append-only approved game_submissions row for the audit trail.
create or replace function public.admin_edit_catalog_game(
  p_id          uuid,
  p_title       text,
  p_image       text,
  p_platforms   jsonb,
  p_genres      jsonb,
  p_developers  jsonb,
  p_released    date,
  p_hours       real,
  p_screenshots jsonb
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c        public.catalog_games%rowtype;
  v_before jsonb;
begin
  if not public.has_permission('catalog.manage') then
    raise exception 'Not authorized';
  end if;

  select * into c from public.catalog_games where id = p_id and rawg_id is null for update;
  if not found then raise exception 'Community catalog entry not found'; end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'Title is required';
  end if;

  -- Snapshot the pre-edit values so the audit row can diff/revert like a normal
  -- moderated edit (mirrors game_submissions.before).
  v_before := jsonb_build_object(
    'title', c.title, 'image', c.image, 'platforms', c.platforms, 'genres', c.genres,
    'developers', c.developers, 'released', c.released, 'hours', c.hours,
    'screenshots', c.screenshots
  );

  update public.catalog_games set
    title = btrim(p_title), image = nullif(btrim(coalesce(p_image, '')), ''),
    platforms = coalesce(p_platforms, '[]'::jsonb),
    genres = coalesce(p_genres, '[]'::jsonb),
    developers = coalesce(p_developers, '[]'::jsonb),
    released = p_released, hours = p_hours,
    screenshots = coalesce(p_screenshots, '[]'::jsonb),
    updated_at = now()
  where id = p_id;

  -- Cascade catalog-derived fields to every copy (screenshots stay catalog-only).
  update public.games g set
    catalog_id  = p_id,
    title       = c2.title,
    platforms   = c2.platforms,
    genres      = c2.genres,
    developers  = c2.developers,
    released    = c2.released,
    hours       = c2.hours,
    image       = case when g.image is null or g.image is not distinct from g.stock_image
                       then c2.image else g.image end,
    stock_image = c2.image
  from public.catalog_games c2
  where c2.id = p_id and g.catalog_id = p_id;

  -- Append-only audit trail: an approved edit attributed to the admin (no reward,
  -- no self-notify since the actor is the submitter). Lets it show in My
  -- contributions and be reverted with the existing tooling.
  insert into public.game_submissions (
    submitter, kind, catalog_id, title, image, platforms, genres, developers,
    released, hours, screenshots, before, status, reviewer, reviewed_at,
    review_note, reward, approved_fields
  ) values (
    auth.uid(), 'edit', p_id, btrim(p_title), nullif(btrim(coalesce(p_image, '')), ''),
    coalesce(p_platforms, '[]'::jsonb), coalesce(p_genres, '[]'::jsonb),
    coalesce(p_developers, '[]'::jsonb), p_released, p_hours,
    coalesce(p_screenshots, '[]'::jsonb), v_before, 'approved', auth.uid(), now(),
    'Admin direct edit', 0,
    array['title', 'image', 'platforms', 'genres', 'developers', 'released', 'hours', 'screenshots']
  );
end;
$$;

-- Admin delete of a community catalog entry. Guarded: refuse while any library still
-- links to it (so no owned game is orphaned / loses future edits). Submission audit
-- rows survive (FK is on delete set null).
create or replace function public.admin_delete_catalog_game(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_owners bigint;
begin
  if not public.has_permission('catalog.manage') then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from public.catalog_games where id = p_id and rawg_id is null) then
    raise exception 'Community catalog entry not found';
  end if;
  select count(*) into v_owners from public.games where catalog_id = p_id;
  if v_owners > 0 then
    raise exception 'Still in % player librar%, so it can''t be deleted — edit it instead.',
      v_owners, case when v_owners = 1 then 'y' else 'ies' end;
  end if;
  delete from public.catalog_games where id = p_id and rawg_id is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Community compilation templates (moderated). compilation_templates is the
-- shared master: a compilation's STRUCTURE only — title + the games it bundles
-- ({name, hours?, image?, rawg_id?, catalog_id?, genres?}). No money or ownership
-- is shared (cost/platform/format stay personal). compilation_submissions is the
-- staging queue (mirrors game_submissions): users propose a new template or an
-- edit to an existing one; an admin approves and only then does the approve RPC
-- write the shared template. Approved contributions pay the catalog reward.
-- ---------------------------------------------------------------------------
create table if not exists public.compilation_templates (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  games      jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compilation_templates_title_idx
  on public.compilation_templates (lower(title));

alter table public.compilation_templates enable row level security;
drop policy if exists "compilation_templates_read" on public.compilation_templates;
create policy "compilation_templates_read" on public.compilation_templates
  for select to anon, authenticated using (true);
-- No write policies: only the approve RPC mutates the shared templates.

create table if not exists public.compilation_submissions (
  id          uuid primary key default gen_random_uuid(),
  submitter   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('new', 'edit')),
  template_id uuid references public.compilation_templates (id) on delete cascade,
  title       text,
  games       jsonb not null default '[]'::jsonb,
  before      jsonb, -- snapshot of the target template at submit time (edits)
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer    uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  reward      integer,
  created_at  timestamptz not null default now()
);
create index if not exists compilation_submissions_status_idx
  on public.compilation_submissions (status, created_at);

alter table public.compilation_submissions enable row level security;
drop policy if exists "compilation_submissions_select" on public.compilation_submissions;
create policy "compilation_submissions_select" on public.compilation_submissions
  for select to authenticated using (
    auth.uid() = submitter
    or public.has_permission('submissions.compilations.moderate')
  );
drop policy if exists "compilation_submissions_insert_own" on public.compilation_submissions;
create policy "compilation_submissions_insert_own" on public.compilation_submissions
  for insert to authenticated with check (auth.uid() = submitter);

-- Deleting a shared template must NOT erase the submission history that produced
-- it, so the link is set null (not cascade) on template delete. Idempotent.
alter table public.compilation_submissions
  drop constraint if exists compilation_submissions_template_id_fkey;
alter table public.compilation_submissions
  add constraint compilation_submissions_template_id_fkey
  foreign key (template_id) references public.compilation_templates (id) on delete set null;

-- Templates also carry the platform/format the compilation released on (structure,
-- not personal cost), so picking one can pre-fill them and the picker can tell
-- same-title releases apart (e.g. Switch vs PS5). Additive.
alter table public.compilation_templates  add column if not exists platform text;
alter table public.compilation_templates  add column if not exists format   text;
alter table public.compilation_submissions add column if not exists platform text;
alter table public.compilation_submissions add column if not exists format   text;
-- Admin soft-delete (mirrors game_submissions.deleted_at).
alter table public.compilation_submissions add column if not exists deleted_at timestamptz;
-- content_hash: a normalized signature of (title, platform, format, games) computed
-- client-side, used to block submitting a duplicate that's already awaiting review.
alter table public.compilation_submissions add column if not exists content_hash text;
create index if not exists compilation_submissions_hash_idx
  on public.compilation_submissions (content_hash) where status = 'pending';

-- File a compilation submission, blocking an exact duplicate that's already
-- awaiting review (any submitter) — the client can't see others' pending rows, so
-- this is enforced server-side via the normalized content_hash. Raises
-- 'DUPLICATE_PENDING' so the client can show a friendly message.
create or replace function public.submit_compilation_template(
  p_kind        text,
  p_template_id uuid,
  p_title       text,
  p_platform    text,
  p_format      text,
  p_games       jsonb,
  p_before      jsonb,
  p_hash        text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Title required'; end if;
  if p_kind not in ('new', 'edit') then raise exception 'Invalid kind'; end if;

  if exists (
    select 1 from public.compilation_submissions
     where content_hash = p_hash and status = 'pending' and deleted_at is null
  ) then
    raise exception 'DUPLICATE_PENDING';
  end if;

  insert into public.compilation_submissions
    (submitter, kind, template_id, title, platform, format, games, before, content_hash)
  values (
    auth.uid(), p_kind,
    case when p_kind = 'edit' then p_template_id else null end,
    btrim(p_title),
    nullif(btrim(coalesce(p_platform, '')), ''),
    nullif(btrim(coalesce(p_format, '')), ''),
    coalesce(p_games, '[]'::jsonb),
    case when p_kind = 'edit' then p_before else null end,
    p_hash
  );
end;
$$;

-- Approve a compilation submission (admin only): create the shared template (new)
-- or overwrite the target template's title/games (edit), reward + notify the
-- submitter. Mirrors approve_game_submission.
create or replace function public.approve_compilation_submission(p_id uuid, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s          public.compilation_submissions%rowtype;
  v_template uuid;
  v_reward   integer;
  v_new_coins integer;
begin
  if not public.has_permission('submissions.compilations.moderate') then
    raise exception 'Not authorized';
  end if;

  select * into s from public.compilation_submissions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.status <> 'pending' then raise exception 'Submission already reviewed'; end if;
  if coalesce(btrim(s.title), '') = '' then raise exception 'Submission has no title'; end if;

  -- Format is a personal attribute (like cost), not part of the shared template,
  -- so it's intentionally NOT written here. The compilation_templates.format
  -- column is kept (existing data preserved) but no longer populated.
  if s.kind = 'edit' and s.template_id is not null then
    update public.compilation_templates
       set title = btrim(s.title), games = s.games,
           platform = s.platform, updated_at = now()
     where id = s.template_id
     returning id into v_template;
  end if;
  -- New submission, or an edit whose target template has since vanished.
  if v_template is null then
    insert into public.compilation_templates (title, games, platform, created_by)
    values (btrim(s.title), s.games, s.platform, s.submitter)
    returning id into v_template;
  end if;

  -- Reward the submitter (server-authoritative), like a catalog contribution.
  select submission_reward into v_reward from public.app_config where id = 1;
  v_reward := coalesce(v_reward, 15);
  update public.profiles set coins = coins + v_reward where id = s.submitter
    returning coins into v_new_coins;
  if v_reward > 0 then
    perform public.log_coin_event(
      s.submitter, 'submission_reward', v_reward, 0, v_new_coins, null, null,
      btrim(s.title),
      case when s.kind = 'edit' then 'Compilation edit' else 'Compilation template' end
    );
  end if;

  if s.submitter <> auth.uid() then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      s.submitter, 'compilation_submission_approved',
      'Your compilation was approved',
      coalesce(nullif(btrim(p_note), ''), 'Your compilation is now available for everyone.')
        || ' (+' || v_reward || ' coins)',
      'mysubmissions:' || p_id
    );
  end if;

  update public.compilation_submissions set
    status = 'approved', reviewer = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(p_note), ''), reward = v_reward, template_id = v_template
  where id = p_id;
end;
$$;

-- Reject a compilation submission (admin only): mark it + notify. No shared table
-- changes.
create or replace function public.reject_compilation_submission(p_id uuid, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s public.compilation_submissions%rowtype;
begin
  if not public.has_permission('submissions.compilations.moderate') then
    raise exception 'Not authorized';
  end if;

  select * into s from public.compilation_submissions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if s.status <> 'pending' then raise exception 'Submission already reviewed'; end if;

  update public.compilation_submissions set
    status = 'rejected', reviewer = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(p_note), '')
  where id = p_id;

  if s.submitter <> auth.uid() then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      s.submitter, 'compilation_submission_rejected',
      'Your compilation wasn''t approved',
      nullif(btrim(p_note), ''),
      'mysubmissions:' || p_id
    );
  end if;
end;
$$;

-- The admin moderation queue for compilation submissions (mirrors
-- list_game_submissions): each submission with the submitter's name and, for an
-- edit, the live template snapshot for the diff. Admin-only.
drop function if exists public.list_compilation_submissions();
create or replace function public.list_compilation_submissions()
returns table (
  id             uuid,
  submitter      uuid,
  submitter_name text,
  kind           text,
  template_id    uuid,
  title          text,
  platform       text,
  format         text,
  games          jsonb,
  before         jsonb,
  current        jsonb,
  status         text,
  reviewer       uuid,
  reviewer_name  text,
  reviewed_at    timestamptz,
  review_note    text,
  reward         integer,
  created_at     timestamptz,
  deleted_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    s.id, s.submitter, p.display_name, s.kind, s.template_id,
    s.title, s.platform, s.format, s.games, s.before,
    (select to_jsonb(t) from public.compilation_templates t where t.id = s.template_id limit 1) as current,
    s.status, s.reviewer, rp.display_name, s.reviewed_at, s.review_note, s.reward,
    s.created_at, s.deleted_at
  from public.compilation_submissions s
  join public.profiles p on p.id = s.submitter
  left join public.profiles rp on rp.id = s.reviewer
  where not p.hidden
    and public.has_permission('submissions.compilations.moderate')
  order by s.created_at desc;
$$;

-- Delete a published shared compilation template (admin only). The submission
-- history that produced it survives (the FK is on delete set null). Used to clear
-- duplicates / bad templates from the autocomplete.
create or replace function public.delete_compilation_template(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('submissions.compilations.moderate') then
    raise exception 'Not authorized';
  end if;
  delete from public.compilation_templates where id = p_id;
end;
$$;

-- Admin soft-delete of a compilation submission: removes it from the active queue
-- (preserving the row) AND deletes the shared template it published, if any — so a
-- duplicate disappears from the autocomplete too. Idempotent.
create or replace function public.delete_compilation_submission(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_template uuid;
begin
  if not public.has_permission('submissions.compilations.moderate') then
    raise exception 'Not authorized';
  end if;
  update public.compilation_submissions set deleted_at = now()
   where id = p_id
   returning template_id into v_template;
  if v_template is not null then
    delete from public.compilation_templates where id = v_template;
  end if;
end;
$$;

-- The admin badge counts BOTH queues — but each only for a caller who can
-- moderate it, so a games-only moderator's badge never reflects compilations and
-- vice versa. Super-admins satisfy has_permission for both.
create or replace function public.pending_submission_count()
returns integer
language sql
security definer set search_path = public
as $$
  select (
    case when public.has_permission('submissions.games.moderate') then
      (select count(*) from public.game_submissions s
         join public.profiles p on p.id = s.submitter
        where s.status = 'pending' and s.deleted_at is null and not p.hidden)
    else 0 end
    + case when public.has_permission('submissions.compilations.moderate') then
      (select count(*) from public.compilation_submissions s
         join public.profiles p on p.id = s.submitter
        where s.status = 'pending' and s.deleted_at is null and not p.hidden)
    else 0 end
  )::int;
$$;

-- ---------------------------------------------------------------------------
-- App config (singleton row): maintenance toggle, readable by everyone.
-- Toggle maintenance by editing this row in the Supabase Table Editor.
-- ---------------------------------------------------------------------------

create table if not exists public.app_config (
  id          integer primary key default 1,
  maintenance boolean not null default false,
  message     text,
  -- "Shelve It" refund: % of the price paid that's refunded to you when a game
  -- is dropped from Now Playing without finishing it (the rest is forfeited).
  shelve_refund_pct integer not null default 50,
  -- Replay Bonus: % of the normal completion bonus paid for finishing a linked
  -- edition after the family's first clear (see Game Families above).
  replay_bonus_pct integer not null default 25,
  -- default_coin: the app-wide coin skin shown to everyone (see src/lib/coins.ts
  -- + public/coins/*.svg). Admin-picked in Account settings.
  default_coin text not null default 'bb',
  -- price_formula / bounty_formula: the configurable economy formulas (see
  -- src/lib/economy.ts FormulaConfig). Admin-tuned on the Economy page. Defaults
  -- reproduce the original economy: price = 40 + 3/hour + up to 120 newness;
  -- bounty = a flat 40. Loaded client-side and normalized, so a partial/edited
  -- value can't break pricing.
  price_formula jsonb not null default '{"base":40,"recencyDecayYears":8,"factors":{"length":{"enabled":true,"weight":3},"recency":{"enabled":true,"weight":120},"paid":{"enabled":false,"weight":0},"played":{"enabled":false,"weight":0},"rating":{"enabled":false,"weight":0},"metacritic":{"enabled":false,"weight":0}}}'::jsonb,
  bounty_formula jsonb not null default '{"base":40,"recencyDecayYears":8,"factors":{"length":{"enabled":false,"weight":0},"recency":{"enabled":false,"weight":0},"paid":{"enabled":false,"weight":0},"played":{"enabled":false,"weight":0},"rating":{"enabled":false,"weight":0},"metacritic":{"enabled":false,"weight":0}}}'::jsonb,
  constraint app_config_singleton check (id = 1)
);
insert into public.app_config (id) values (1) on conflict (id) do nothing;

-- Migration for the shelve refund (safe to re-run). Earlier builds stored this
-- as shelve_penalty_pct (a fee that was deducted); it's now shelve_refund_pct (a
-- refund that's credited). The default 50 means the same thing either way — half.
alter table public.app_config add column if not exists shelve_refund_pct integer not null default 50;
alter table public.app_config drop constraint if exists app_config_shelve_pct_range;
alter table public.app_config drop column if exists shelve_penalty_pct;
alter table public.app_config drop constraint if exists app_config_shelve_refund_range;
alter table public.app_config add constraint app_config_shelve_refund_range
  check (shelve_refund_pct between 0 and 100);

-- Migration for the replay bonus (safe to re-run).
alter table public.app_config add column if not exists replay_bonus_pct integer not null default 25;
alter table public.app_config drop constraint if exists app_config_replay_bonus_range;
alter table public.app_config add constraint app_config_replay_bonus_range
  check (replay_bonus_pct between 0 and 100);

-- Migration for the app-wide coin skin (safe to re-run).
alter table public.app_config add column if not exists default_coin text not null default 'bb';
alter table public.app_config drop constraint if exists app_config_default_coin_check;
alter table public.app_config add constraint app_config_default_coin_check
  check (default_coin in ('b', 'bb', 'chest', 'stall'));

-- Migration for the configurable economy formulas (safe to re-run). Defaults
-- reproduce the original economy (see the create-table block above).
alter table public.app_config add column if not exists price_formula jsonb not null
  default '{"base":40,"recencyDecayYears":8,"factors":{"length":{"enabled":true,"weight":3},"recency":{"enabled":true,"weight":120},"paid":{"enabled":false,"weight":0},"played":{"enabled":false,"weight":0},"rating":{"enabled":false,"weight":0},"metacritic":{"enabled":false,"weight":0}}}'::jsonb;
alter table public.app_config add column if not exists bounty_formula jsonb not null
  default '{"base":40,"recencyDecayYears":8,"factors":{"length":{"enabled":false,"weight":0},"recency":{"enabled":false,"weight":0},"paid":{"enabled":false,"weight":0},"played":{"enabled":false,"weight":0},"rating":{"enabled":false,"weight":0},"metacritic":{"enabled":false,"weight":0}}}'::jsonb;

-- submission_reward: coins awarded to a user when their catalog edit / new-game
-- submission is approved by a moderator. Admin-tuned on the Economy page.
alter table public.app_config add column if not exists submission_reward integer not null default 15;
alter table public.app_config drop constraint if exists app_config_submission_reward_range;
alter table public.app_config add constraint app_config_submission_reward_range
  check (submission_reward between 0 and 1000);

-- Import Charter economics, admin-tuned on the Economy page:
--  • charter_cost: coins to buy one charter.
--  • charter_resale_pct: % of the cost returned when selling one back (a haircut
--    so charters aren't a liquid bank — resale = floor(cost * pct / 100)).
alter table public.app_config add column if not exists charter_cost integer not null default 100;
alter table public.app_config drop constraint if exists app_config_charter_cost_range;
alter table public.app_config add constraint app_config_charter_cost_range
  check (charter_cost between 0 and 100000);
alter table public.app_config add column if not exists charter_resale_pct integer not null default 75;
alter table public.app_config drop constraint if exists app_config_charter_resale_range;
alter table public.app_config add constraint app_config_charter_resale_range
  check (charter_resale_pct between 0 and 100);

-- Onboarding vouchers granted to each new account at signup (the "Jumpstart"
-- starter pack). Admin-tunable on the Economy page; defaults to 2.
alter table public.app_config add column if not exists onboarding_vouchers integer not null default 2;
alter table public.app_config drop constraint if exists app_config_onboarding_vouchers_range;
alter table public.app_config add constraint app_config_onboarding_vouchers_range
  check (onboarding_vouchers between 0 and 100);

-- default_general_slots: how many General Now Playing slots a brand-new account
-- starts with (the admin "default loadout", alongside slot_definitions
-- .default_grant_count). Applied by handle_new_user on signup only.
alter table public.app_config add column if not exists default_general_slots integer not null default 2;
alter table public.app_config drop constraint if exists app_config_default_general_slots_range;
alter table public.app_config add constraint app_config_default_general_slots_range
  check (default_general_slots between 0 and 99);

alter table public.app_config enable row level security;
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config
  for select to anon, authenticated using (true);

-- App config holds both the economy levers and the site maintenance toggle, all
-- in one row. RLS can't gate per-column dynamically, so either an economy editor
-- or a maintenance manager may update the row; the client routes each control to
-- its specific capability (economy.edit vs site.maintenance). Super-admins satisfy
-- has_permission for both.
drop policy if exists "app_config_admin_update" on public.app_config;
create policy "app_config_admin_update" on public.app_config
  for update to authenticated
  using (public.has_permission('economy.edit') or public.has_permission('site.maintenance'))
  with check (public.has_permission('economy.edit') or public.has_permission('site.maintenance'));

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

-- ---------------------------------------------------------------------------
-- Avatars storage bucket. Public read (so avatars show on the leaderboard etc.);
-- a user may only write files under their own uid folder: avatars/<uid>/avatar.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Covers storage bucket. Public read (cover art shows on every board, including
-- when visiting another player); a user may only write files under their own uid
-- folder: covers/<uid>/<gameId>.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

drop policy if exists "covers_public_read" on storage.objects;
create policy "covers_public_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'covers');

drop policy if exists "covers_insert_own" on storage.objects;
create policy "covers_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "covers_update_own" on storage.objects;
create policy "covers_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "covers_delete_own" on storage.objects;
create policy "covers_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Attachments storage bucket. Public read (screenshots/logs render in the
-- Requests board); a user may only write files under their own uid folder:
-- attachments/<uid>/<requestId>/<filename>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "attachments_public_read" on storage.objects;
create policy "attachments_public_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'attachments');

drop policy if exists "attachments_insert_own" on storage.objects;
create policy "attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments_update_own" on storage.objects;
create policy "attachments_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments_delete_own" on storage.objects;
create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- Games: a user can only see and change their own games.
drop policy if exists "games_select_own" on public.games;
create policy "games_select_own" on public.games
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "games_modify_own" on public.games;
create policy "games_modify_own" on public.games
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Feature requests: public board. Anyone signed in may READ all and INSERT their
-- own. Only admins may UPDATE (status moves happen via direct update). A request
-- may be DELETEd by its owner (withdraw) or any admin (remove).
alter table public.feature_requests enable row level security;
alter table public.feature_votes    enable row level security;

drop policy if exists "feature_requests_select" on public.feature_requests;
create policy "feature_requests_select" on public.feature_requests
  for select to authenticated using (true);

drop policy if exists "feature_requests_insert_own" on public.feature_requests;
create policy "feature_requests_insert_own" on public.feature_requests
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "feature_requests_admin_update" on public.feature_requests;
create policy "feature_requests_admin_update" on public.feature_requests
  for update to authenticated
  using (public.has_permission('issues.moderate'))
  with check (public.has_permission('issues.moderate'));

drop policy if exists "feature_requests_delete" on public.feature_requests;
create policy "feature_requests_delete" on public.feature_requests
  for delete to authenticated
  using (
    auth.uid() = user_id
    or public.has_permission('issues.moderate')
  );

-- Votes: anyone signed in may read the tally; a user may only add/remove their
-- own vote.
drop policy if exists "feature_votes_select" on public.feature_votes;
create policy "feature_votes_select" on public.feature_votes
  for select to authenticated using (true);

drop policy if exists "feature_votes_insert_own" on public.feature_votes;
create policy "feature_votes_insert_own" on public.feature_votes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "feature_votes_delete_own" on public.feature_votes;
create policy "feature_votes_delete_own" on public.feature_votes
  for delete to authenticated using (auth.uid() = user_id);

-- Comments: anyone signed in may READ all and INSERT their own. A comment may be
-- EDITED or DELETED by its author or any admin (no privileged column, so plain RLS).
alter table public.feature_comments enable row level security;

drop policy if exists "feature_comments_select" on public.feature_comments;
create policy "feature_comments_select" on public.feature_comments
  for select to authenticated using (true);

drop policy if exists "feature_comments_insert_own" on public.feature_comments;
create policy "feature_comments_insert_own" on public.feature_comments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "feature_comments_update" on public.feature_comments;
create policy "feature_comments_update" on public.feature_comments
  for update to authenticated
  using (
    auth.uid() = user_id
    or public.has_permission('issues.moderate')
  );

drop policy if exists "feature_comments_delete" on public.feature_comments;
create policy "feature_comments_delete" on public.feature_comments
  for delete to authenticated
  using (
    auth.uid() = user_id
    or public.has_permission('issues.moderate')
  );

-- Attachments: anyone signed in may READ; a user may only INSERT their own; an
-- attachment may be DELETED by its uploader or any admin. The files themselves
-- live in the 'attachments' storage bucket (its own policies above).
alter table public.feature_attachments enable row level security;

drop policy if exists "feature_attachments_select" on public.feature_attachments;
create policy "feature_attachments_select" on public.feature_attachments
  for select to authenticated using (true);

drop policy if exists "feature_attachments_insert_own" on public.feature_attachments;
create policy "feature_attachments_insert_own" on public.feature_attachments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "feature_attachments_delete" on public.feature_attachments;
create policy "feature_attachments_delete" on public.feature_attachments
  for delete to authenticated
  using (
    auth.uid() = user_id
    or public.has_permission('issues.moderate')
  );

-- Comment reactions: anyone signed in may read the tallies; a user may only
-- add/remove their own reaction.
alter table public.comment_reactions enable row level security;

drop policy if exists "comment_reactions_select" on public.comment_reactions;
create policy "comment_reactions_select" on public.comment_reactions
  for select to authenticated using (true);

drop policy if exists "comment_reactions_insert_own" on public.comment_reactions;
create policy "comment_reactions_insert_own" on public.comment_reactions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "comment_reactions_delete_own" on public.comment_reactions;
create policy "comment_reactions_delete_own" on public.comment_reactions
  for delete to authenticated using (auth.uid() = user_id);

-- Notifications: a user may only read and mark-read their own. They are a
-- permanent history — there is deliberately no DELETE policy, and no INSERT
-- policy either (only the security-definer triggers below insert).
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Notifications persist as history; drop any delete policy from earlier versions.
drop policy if exists "notifications_delete_own" on public.notifications;

-- Coin events: a user may only read their own ledger. Like notifications, there
-- is deliberately no INSERT/UPDATE/DELETE policy — the rows are immutable and
-- written only by the security-definer economy RPCs (which bypass RLS).
alter table public.coin_events enable row level security;

drop policy if exists "coin_events_select_own" on public.coin_events;
create policy "coin_events_select_own" on public.coin_events
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_coins   integer;
  v_general integer;
begin
  -- The admin "default loadout": new accounts start with the configured number of
  -- general slots (falls back to the column default of 2).
  select default_general_slots into v_general from public.app_config where id = 1;

  insert into public.profiles (id, display_name, general_slots)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(v_general, 2)
  )
  on conflict (id) do nothing
  returning coins into v_coins;

  -- Seed an opening-balance baseline so the running balance is consistent from
  -- the new user's first transaction (mirrors the migration seed for existing
  -- users). Skipped on conflict (no insert => v_coins is null).
  if v_coins is not null then
    perform public.log_coin_event(
      new.id, 'opening', 0, 0, v_coins, 0, null, null, 'Opening balance'
    );

    -- Default targeted-slot grants: one user_slots row per copy of each active
    -- definition with a default_grant_count > 0 (the rest of the default loadout).
    insert into public.user_slots (user_id, definition_id)
    select new.id, d.id
      from public.slot_definitions d
      cross join generate_series(1, d.default_grant_count) g
     where d.active and d.default_grant_count > 0;

    -- Jumpstart Activation: don't grant the starter vouchers yet — flag them as
    -- pending so they're credited when the user finishes the onboarding tour
    -- (complete_onboarding), after they've learned the loop.
    update public.profiles set onboarding_vouchers_pending = true where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Append one immutable ledger row. Called from the economy RPCs below (all
-- security definer) — never the client. plpgsql defers name resolution, so the
-- callers defined earlier in this file (e.g. approve_game_submission) still bind
-- to this at runtime. Pass null for a balance-after that doesn't apply to the
-- event (e.g. charter_balance_after for a pure coin event).
-- ---------------------------------------------------------------------------
-- p_detail added (defaulted) for optional structured metadata; the old 9-arg
-- version is dropped so the signature change doesn't leave an overload behind.
-- p_voucher_delta/p_voucher_after added (defaulted) for the third currency; the
-- prior 10-arg overload is dropped for the same reason. Existing callers that
-- pass ≤10 args still bind — vouchers default to a neutral (0 / null) movement.
drop function if exists public.log_coin_event(uuid, text, integer, integer, integer, integer, uuid, text, text);
drop function if exists public.log_coin_event(uuid, text, integer, integer, integer, integer, uuid, text, text, jsonb);
create or replace function public.log_coin_event(
  p_user          uuid,
  p_kind          text,
  p_coin_delta    integer,
  p_charter_delta integer,
  p_coin_after    integer,
  p_charter_after integer,
  p_game          uuid,
  p_game_title    text,
  p_label         text,
  p_detail        jsonb default '{}'::jsonb,
  p_voucher_delta integer default 0,
  p_voucher_after integer default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.coin_events (
    user_id, kind, coin_delta, charter_delta,
    coin_balance_after, charter_balance_after,
    game_id, game_title, label, detail,
    voucher_delta, voucher_balance_after
  ) values (
    p_user, p_kind, coalesce(p_coin_delta, 0), coalesce(p_charter_delta, 0),
    p_coin_after, p_charter_after,
    p_game, p_game_title, p_label, coalesce(p_detail, '{}'::jsonb),
    coalesce(p_voucher_delta, 0), p_voucher_after
  );
end;
$$;

-- Lifetime gain/loss summary for the caller's own ledger: positive and negative
-- coin (and charter) movements summed separately, so the UI can show total
-- earned vs. spent at a glance. Security definer + an explicit auth.uid() filter,
-- so it only ever totals the caller's own rows.
-- Dropped first because adding the voucher totals changes the RETURNS TABLE shape.
drop function if exists public.ledger_totals();
create or replace function public.ledger_totals()
returns table (
  coins_in bigint, coins_out bigint,
  charters_in bigint, charters_out bigint,
  vouchers_in bigint, vouchers_out bigint
)
language sql
security definer set search_path = public
as $$
  select
    coalesce( sum(coin_delta)    filter (where coin_delta    > 0), 0),
    coalesce(-sum(coin_delta)    filter (where coin_delta    < 0), 0),
    coalesce( sum(charter_delta) filter (where charter_delta > 0), 0),
    coalesce(-sum(charter_delta) filter (where charter_delta < 0), 0),
    coalesce( sum(voucher_delta) filter (where voucher_delta > 0), 0),
    coalesce(-sum(voucher_delta) filter (where voucher_delta < 0), 0)
  from public.coin_events
  where user_id = auth.uid();
$$;

revoke execute on function public.ledger_totals() from public, anon;

-- ---------------------------------------------------------------------------
-- Buy a game: deduct coins + flip status, atomically.
-- Price/reward are computed in the app (single source of truth in pricing.ts)
-- and passed in. Returns the new coin balance.
-- ---------------------------------------------------------------------------

-- Decide which slot a backlog game should land in when started, validating the
-- player's chosen placement. The single source of truth for start-slot placement,
-- shared by apply_purchase and apply_voucher_redemption. Returns the slot id to
-- use (null = a general slot), or raises if there's no room / the choice is
-- invalid. A linked edition reuses its family's slot (no capacity used).
--   p_slot    — an explicit targeted slot (standard/endless; never replay).
--   p_general — force a general slot (skip the targeted auto-pick).
--   neither   — auto: a matching standard slot, else a general slot.
create or replace function public.pick_start_slot(p_game uuid, p_slot uuid, p_general boolean)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_hours      real;
  v_family     uuid;
  v_released   date;
  v_genres     jsonb;
  v_platforms  jsonb;
  v_metacritic integer;
  v_slot       uuid;
  v_general    integer;
  v_gen_used   integer;
  v_def        public.slot_definitions;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- The game must be in the backlog; grab the metadata standard slots match on.
  select hours, family_id, released, genres, platforms, metacritic
    into v_hours, v_family, v_released, v_genres, v_platforms, v_metacritic
    from public.games
   where id = p_game and user_id = v_uid and status = 'backlog';
  if not found then
    raise exception 'Game not available to buy';
  end if;

  -- A linked edition shares its family's slot: if a sibling edition is already
  -- playing, reuse its slot and skip the capacity check entirely.
  if v_family is not null then
    select g.slot_id into v_slot
      from public.games g
     where g.user_id = v_uid and g.family_id = v_family
       and g.status = 'playing' and g.id <> p_game
     limit 1;
    if found then return v_slot; end if;
  end if;

  -- An explicit targeted slot: owned, active, an accepted kind (standard/endless —
  -- never replay), open, and — for a standard slot — matching its criteria.
  if p_slot is not null then
    select d.* into v_def
      from public.slot_definitions d
      join public.user_slots us on us.definition_id = d.id
     where us.id = p_slot and us.user_id = v_uid;
    if not found then raise exception 'Slot not found'; end if;
    if not v_def.active or v_def.kind not in ('standard', 'endless') then
      raise exception 'Game does not fit this slot';
    end if;
    if v_def.kind = 'standard'
       and not public.slot_matches(v_def, v_hours, v_released, v_genres, v_platforms, v_metacritic) then
      raise exception 'Game does not fit this slot';
    end if;
    if exists (select 1 from public.games g where g.slot_id = p_slot and g.status = 'playing') then
      raise exception 'Slot already in use';
    end if;
    return p_slot;
  end if;

  -- Auto (not forced general): prefer an open matching STANDARD slot, reserving
  -- general slots for games that don't fit a specialized slot. Endless/replay are
  -- never auto-filled.
  if not coalesce(p_general, false) then
    select us.id into v_slot
      from public.user_slots us
      join public.slot_definitions d on d.id = us.definition_id
     where us.user_id = v_uid
       and d.active
       and d.kind = 'standard'
       and public.slot_matches(d, v_hours, v_released, v_genres, v_platforms, v_metacritic)
       and not exists (select 1 from public.games g where g.slot_id = us.id and g.status = 'playing')
     order by d.created_at
     limit 1;
    if v_slot is not null then return v_slot; end if;
  end if;

  -- General slot (the auto fallback, or the explicit p_general choice). A family
  -- counts once however many of its editions occupy a general slot.
  select general_slots into v_general from public.profiles where id = v_uid;
  select count(distinct coalesce(family_id, id)) into v_gen_used
    from public.games
   where user_id = v_uid and status = 'playing' and slot_id is null;
  if v_gen_used >= coalesce(v_general, 2) then
    raise exception 'No open Now Playing slot';
  end if;
  return null;
end;
$$;

-- Returns the new coin balance plus the slot the game was placed in (null = a
-- general slot). Dropped first because the return type changed from integer.
drop function if exists public.apply_purchase(uuid, integer);
drop function if exists public.apply_purchase(uuid, integer, uuid);
drop function if exists public.apply_purchase(uuid, integer, uuid, boolean);
-- p_slot/p_general (optional): direct the purchase into a chosen slot, or force a
-- general slot. Null/false = auto-place (matching standard slot, else general).
create or replace function public.apply_purchase(
  p_game uuid, p_price integer, p_slot uuid default null, p_general boolean default false
)
returns table (coins integer, slot_id uuid)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_new_coins integer;
  v_slot      uuid;
  v_title     text;
begin
  select title into v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'backlog';
  if not found then
    raise exception 'Game not available to buy';
  end if;

  v_slot := public.pick_start_slot(p_game, p_slot, p_general);

  update public.profiles
     set coins = coins - p_price
   where id = auth.uid() and coins >= p_price
   returning coins into v_new_coins;

  if v_new_coins is null then
    raise exception 'Not enough coins';
  end if;

  update public.games
     set status = 'playing', started_at = now(), price_paid = p_price, slot_id = v_slot
   where id = p_game and user_id = auth.uid() and status = 'backlog';

  perform public.log_coin_event(
    auth.uid(), 'purchase', -p_price, 0, v_new_coins, null, p_game, v_title, null
  );

  return query select v_new_coins, v_slot;
end;
$$;

-- Jumpstart Activation: redeem one Onboarding Voucher to move a Bazaar (backlog)
-- game directly into Now Playing, bypassing the coin activation fee. The slot
-- logic is identical to apply_purchase (a voucher is just a free activation), but
-- coins are untouched and price_paid is recorded as 0 (you paid nothing, so a
-- later Shelve It refunds nothing). The voucher pathway is STRICTLY backlog →
-- Now Playing: the source row must be 'backlog', so it can never be used from the
-- Wishlist (importing or otherwise). Logs a 'voucher_redeem' ledger row with a
-- zero coin cost and a −1 voucher movement. Returns the remaining voucher balance
-- and the slot the game landed in.
drop function if exists public.apply_voucher_redemption(uuid);
drop function if exists public.apply_voucher_redemption(uuid, uuid);
drop function if exists public.apply_voucher_redemption(uuid, uuid, boolean);
-- p_slot/p_general (optional): direct the activation into a chosen slot, or force a
-- general slot — mirroring apply_purchase. Null/false = auto-place.
create or replace function public.apply_voucher_redemption(
  p_game uuid, p_slot uuid default null, p_general boolean default false
)
returns table (vouchers integer, slot_id uuid)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_coins     integer;
  v_vouchers  integer;
  v_slot      uuid;
  v_title     text;
begin
  -- The game must be in the backlog (the only valid voucher pathway).
  select title into v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'backlog';
  if not found then
    raise exception 'Game not available to activate';
  end if;

  v_slot := public.pick_start_slot(p_game, p_slot, p_general);

  -- Spend exactly one voucher (atomic guard: only if the caller holds ≥1).
  update public.profiles
     set vouchers = vouchers - 1
   where id = auth.uid() and vouchers >= 1
   returning coins, vouchers into v_coins, v_vouchers;

  if v_vouchers is null then
    raise exception 'No vouchers available';
  end if;

  update public.games
     set status = 'playing', started_at = now(), price_paid = 0, slot_id = v_slot
   where id = p_game and user_id = auth.uid() and status = 'backlog';

  -- Ledger row: zero coin cost (keeps financial analytics accurate) + a −1
  -- voucher movement with the running voucher balance snapshotted.
  perform public.log_coin_event(
    auth.uid(), 'voucher_redeem', 0, 0, v_coins, null, p_game, v_title, null,
    '{}'::jsonb, -1, v_vouchers
  );

  return query select v_vouchers, v_slot;
end;
$$;

-- Mark the caller's onboarding walkthrough finished (or skipped) and, for a fresh
-- signup, credit the deferred starter vouchers exactly once. Idempotent: the
-- completion is stamped only the first time, and the grant fires only while
-- onboarding_vouchers_pending is true (so re-completing — e.g. after an admin
-- reset — never double-grants, and admin-granted accounts get nothing extra).
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_pending  boolean;
  v_coins    integer;
  v_grant    integer;
  v_vouchers integer;
begin
  select onboarding_vouchers_pending, coins into v_pending, v_coins
    from public.profiles where id = auth.uid();

  update public.profiles
     set onboarding_completed_at = now()
   where id = auth.uid() and onboarding_completed_at is null;

  if coalesce(v_pending, false) then
    select onboarding_vouchers into v_grant from public.app_config where id = 1;
    v_grant := coalesce(v_grant, 2);
    update public.profiles
       set vouchers = vouchers + v_grant, onboarding_vouchers_pending = false
     where id = auth.uid()
     returning vouchers into v_vouchers;
    if v_grant > 0 then
      perform public.log_coin_event(
        auth.uid(), 'voucher_grant', 0, 0, v_coins, null, null, null,
        'Onboarding vouchers', '{}'::jsonb, v_grant, v_vouchers
      );
    end if;
  end if;
end;
$$;

-- Finish a game: flip status + award coins, atomically. The reward is decided
-- HERE so the client can't farm full payouts off linked editions: a finish pays
-- p_full_reward only if it's the FIRST clear in the game's family; once any
-- sibling edition is finished, subsequent clears pay the smaller p_replay_reward.
-- Returns the new balance, the coins actually awarded, and whether it was a
-- replay. Dropped first because the return type changed from integer to a table.
drop function if exists public.apply_finish(uuid, integer);
create or replace function public.apply_finish(
  p_game uuid, p_full_reward integer, p_replay_reward integer
)
returns table (coins integer, reward integer, replay boolean)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_family  uuid;
  v_slot_id uuid;
  v_replay  boolean;
  v_award   integer;
  v_coins   integer;
  v_title   text;
begin
  select family_id, slot_id, title into v_family, v_slot_id, v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'playing';
  if not found then
    raise exception 'Game not available to finish';
  end if;

  -- Replay (smaller bounty) if another edition in the same family is already
  -- finished, OR the game is being cleared from a Replay slot (a finished game
  -- pulled back into play for free) — so a free replay can't farm a full bounty.
  v_replay := (v_family is not null and exists (
    select 1 from public.games g
     where g.user_id = auth.uid() and g.family_id = v_family
       and g.id <> p_game and g.status = 'finished'
  )) or exists (
    select 1 from public.user_slots us
      join public.slot_definitions d on d.id = us.definition_id
     where us.id = v_slot_id and d.kind = 'replay'
  );
  v_award := case when v_replay then greatest(0, coalesce(p_replay_reward, 0))
                  else greatest(0, coalesce(p_full_reward, 0)) end;

  update public.games
     set status = 'finished', finished_at = now(), reward = v_award, slot_id = null
   where id = p_game and user_id = auth.uid() and status = 'playing';

  update public.profiles
     set coins = coins + v_award
   where id = auth.uid()
   returning coins into v_coins;

  perform public.log_coin_event(
    auth.uid(),
    case when v_replay then 'replay_bonus' else 'bounty' end,
    v_award, 0, v_coins, null, p_game, v_title, null
  );

  return query select v_coins, v_award, v_replay;
end;
$$;

-- Replay: pull a FINISHED game back into active play through a Replay slot,
-- bypassing the purchase flow entirely (no coins — the game is already fully
-- owned). The target slot must be the caller's, active, kind='replay', and open
-- (no playing game holds it). The game flips finished → playing for free; its
-- finished_at/reward are cleared (the games_log_status trigger has already
-- captured the original finish in game_status_events, so the history survives).
-- Re-finishing later pays the smaller Replay Bonus (see apply_finish).
create or replace function public.apply_replay(p_game uuid, p_slot uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_kind text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- The game must be one of the caller's finished games.
  if not exists (
    select 1 from public.games
     where id = p_game and user_id = auth.uid() and status = 'finished'
  ) then
    raise exception 'Game not available to replay';
  end if;

  -- The slot must be the caller's, active, and a replay slot.
  select d.kind into v_kind
    from public.user_slots us
    join public.slot_definitions d on d.id = us.definition_id
   where us.id = p_slot and us.user_id = auth.uid() and d.active;
  if v_kind is null then
    raise exception 'Slot not found';
  end if;
  if v_kind <> 'replay' then
    raise exception 'Not a replay slot';
  end if;

  -- The slot must be open (single-occupant).
  if exists (
    select 1 from public.games g where g.slot_id = p_slot and g.status = 'playing'
  ) then
    raise exception 'Slot already in use';
  end if;

  update public.games
     set status = 'playing', started_at = now(), price_paid = 0,
         finished_at = null, reward = null, slot_id = p_slot
   where id = p_game and user_id = auth.uid() and status = 'finished';
end;
$$;

-- Abort a replay: send a game that's currently in a Replay slot straight back to
-- Finished WITHOUT paying any bounty (the inverse of apply_replay). No coins move
-- — the replay was free, so backing out is free too. The game must be the caller's,
-- playing, and sitting in one of their replay-kind slots. The games_log_status
-- trigger records the playing → finished transition for the audit trail.
create or replace function public.abort_replay(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1
      from public.games g
      join public.user_slots us on us.id = g.slot_id
      join public.slot_definitions d on d.id = us.definition_id
     where g.id = p_game and g.user_id = auth.uid() and g.status = 'playing'
       and d.kind = 'replay'
  ) then
    raise exception 'Game is not in a replay slot';
  end if;

  update public.games
     set status = 'finished', finished_at = now(), slot_id = null
   where id = p_game and user_id = auth.uid() and status = 'playing';
end;
$$;

-- Log play time on a game you're currently playing: add the hours, atomically.
-- Logging time no longer pays coins (the whole payout is the finish bounty in
-- apply_finish); we still record the hours for stats and return the unchanged
-- balance + total played so the client can update in place. The `coins` OUT
-- column is kept for backward compatibility with the client RPC shape.
-- p_platform added (defaulted) so a session can be attributed to the platform you
-- played on; the old 2-arg version is dropped so the signature change is clean.
-- Signature changed (added p_format), so the older overloads are dropped first.
drop function if exists public.log_playtime(uuid, real);
drop function if exists public.log_playtime(uuid, real, text);
create or replace function public.log_playtime(p_game uuid, p_hours real, p_platform text default null, p_format text default null)
returns table (coins integer, played_hours real)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
-- The OUT columns (coins, played_hours) share names with real table columns;
-- the directive above resolves any ambiguous reference to the COLUMN, not the
-- OUT var, so "set played_hours = played_hours + p_hours" targets the table.
declare
  v_played    real;
  v_coins     integer;
begin
  if p_hours is null or p_hours <= 0 then
    raise exception 'Hours must be positive';
  end if;

  -- Hand the chosen version (platform + format) to the playtime trigger via
  -- transaction-local GUCs, so the event records exactly where the session was
  -- played (multi-version games).
  if p_platform is not null and btrim(p_platform) <> '' then
    perform set_config('app.play_platform', p_platform, true);
    if p_format is not null and btrim(p_format) <> '' then
      perform set_config('app.play_format', p_format, true);
    end if;
  end if;

  update public.games
     set played_hours = played_hours + p_hours
   where id = p_game and user_id = auth.uid() and status = 'playing'
   returning played_hours into v_played;

  if v_played is null then
    raise exception 'Game not available to log time';
  end if;

  select coins into v_coins from public.profiles where id = auth.uid();

  return query select v_coins, v_played;
end;
$$;

-- Shelve a game ("Shelve It"): drop it from Now Playing back to the backlog and
-- refund part of what you paid, atomically. The refund is computed here from
-- app_config.shelve_refund_pct and the game's price_paid (so the client can't
-- inflate it); the rest is forfeited to the Bazaar. Returns the new balance plus
-- the coins refunded. Dropped first because the OUT columns changed (an earlier
-- build returned a 'penalty' column instead of 'refund').
drop function if exists public.apply_shelve(uuid);
create or replace function public.apply_shelve(p_game uuid)
returns table (coins integer, refund integer)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_price   integer;
  v_pct     integer;
  v_refund  integer;
  v_forfeit integer;
  v_coins   integer;
  v_title   text;
begin
  select price_paid, title into v_price, v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'playing'
   for update;

  if not found then
    raise exception 'Game not available to shelve';
  end if;

  update public.games
     set status = 'backlog', started_at = null, price_paid = null, slot_id = null
   where id = p_game;

  select shelve_refund_pct into v_pct from public.app_config where id = 1;
  v_pct := greatest(0, least(100, coalesce(v_pct, 50)));
  v_refund := greatest(0, round(coalesce(v_price, 0) * v_pct / 100.0))::integer;
  -- The forfeited remainder of what you paid (the Bazaar's cut) — recorded on the
  -- event so "Sunk Costs" is a direct sum.
  v_forfeit := greatest(0, coalesce(v_price, 0) - v_refund);

  update public.profiles
     set coins = coins + v_refund
   where id = auth.uid()
   returning coins into v_coins;

  perform public.log_coin_event(
    auth.uid(), 'shelve_refund', v_refund, 0, v_coins, null, p_game, v_title, null,
    jsonb_build_object('forfeit', v_forfeit, 'price_paid', coalesce(v_price, 0))
  );

  return query select v_coins, v_refund;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import Charters: buy / sell / consume. All security definer + atomic, all log
-- to the coin_events ledger, and all read their prices from app_config (server-
-- authoritative, so the client can't dictate cost/resale).
-- ---------------------------------------------------------------------------

-- Buy one Import Charter: spend charter_cost coins, gain one charter.
create or replace function public.buy_charter()
returns table (coins integer, charters integer)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_cost   integer;
  v_coins  integer;
  v_charts integer;
begin
  select charter_cost into v_cost from public.app_config where id = 1;
  v_cost := greatest(0, coalesce(v_cost, 100));

  update public.profiles
     set coins = coins - v_cost, charters = charters + 1
   where id = auth.uid() and coins >= v_cost
   returning coins, charters into v_coins, v_charts;

  if v_coins is null then
    raise exception 'Not enough coins';
  end if;

  perform public.log_coin_event(
    auth.uid(), 'charter_buy', -v_cost, 1, v_coins, v_charts, null, null, null
  );

  return query select v_coins, v_charts;
end;
$$;

-- Sell one Import Charter back: lose a charter, gain the depreciated resale value.
create or replace function public.sell_charter()
returns table (coins integer, charters integer)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_cost   integer;
  v_pct    integer;
  v_resale integer;
  v_coins  integer;
  v_charts integer;
begin
  select charter_cost, charter_resale_pct into v_cost, v_pct
    from public.app_config where id = 1;
  v_cost := greatest(0, coalesce(v_cost, 100));
  v_pct  := greatest(0, least(100, coalesce(v_pct, 75)));
  v_resale := floor(v_cost * v_pct / 100.0)::integer;

  update public.profiles
     set charters = charters - 1, coins = coins + v_resale
   where id = auth.uid() and charters >= 1
   returning coins, charters into v_coins, v_charts;

  if v_coins is null then
    raise exception 'No charters to sell';
  end if;

  perform public.log_coin_event(
    auth.uid(), 'charter_sell', v_resale, -1, v_coins, v_charts, null, null, null
  );

  return query select v_coins, v_charts;
end;
$$;

-- Consume one Import Charter to move a Wishlist game into the Bazaar. Coins are
-- untouched — the activation fee still applies later when buying it into Now
-- Playing (the "double gate"). Returns the remaining charter balance.
create or replace function public.import_with_charter(p_game uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_title  text;
  v_coins  integer;
  v_charts integer;
begin
  select title into v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'wishlist';
  if not found then
    raise exception 'Game not available to import';
  end if;

  update public.profiles
     set charters = charters - 1
   where id = auth.uid() and charters >= 1
   returning coins, charters into v_coins, v_charts;

  if v_charts is null then
    raise exception 'No charters available';
  end if;

  update public.games set status = 'backlog'
   where id = p_game and user_id = auth.uid();

  perform public.log_coin_event(
    auth.uid(), 'charter_consume', 0, -1, v_coins, v_charts, p_game, v_title, null
  );

  return v_charts;
end;
$$;

-- Move a playing game into a different Now Playing slot (e.g. shift a short game
-- out of a general slot into a matching targeted slot to free the general one).
-- p_slot null = a general slot. Validated here so a game can't be parked in a
-- slot it doesn't fit, an occupied slot, or one the caller doesn't own.
create or replace function public.move_game_to_slot(p_game uuid, p_slot uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_hours      real;
  v_family     uuid;
  v_released   date;
  v_genres     jsonb;
  v_platforms  jsonb;
  v_metacritic integer;
  v_unit       uuid;   -- this game's occupant key: its family, or itself
  v_general    integer;
  v_gen_used   integer;
  v_def        public.slot_definitions;
begin
  select hours, family_id, released, genres, platforms, metacritic
    into v_hours, v_family, v_released, v_genres, v_platforms, v_metacritic
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'playing';
  if not found then
    raise exception 'Game not in Now Playing';
  end if;
  v_unit := coalesce(v_family, p_game);

  if p_slot is null then
    -- Moving back to a general slot: one must be free (not counting this unit).
    select general_slots into v_general from public.profiles where id = auth.uid();
    select count(distinct coalesce(family_id, id)) into v_gen_used
      from public.games
     where user_id = auth.uid() and status = 'playing' and slot_id is null
       and coalesce(family_id, id) <> v_unit;
    if v_gen_used >= coalesce(v_general, 2) then
      raise exception 'No open general slot';
    end if;
  else
    -- Moving into a targeted slot: must own it, it must be active, an accepted
    -- kind, the game must fit, and it must not already hold a different unit's
    -- game. A standard slot gates on its criteria; an endless slot is
    -- criteria-agnostic; a replay slot can't be entered this way (only via
    -- apply_replay from a finished game).
    select d.* into v_def
      from public.slot_definitions d
      join public.user_slots us on us.definition_id = d.id
     where us.id = p_slot and us.user_id = auth.uid();
    if not found then
      raise exception 'Slot not found';
    end if;
    if v_def.kind = 'replay' then
      raise exception 'Replay slots are entered from a finished game';
    end if;
    if not v_def.active
       or (v_def.kind = 'standard'
           and not public.slot_matches(v_def, v_hours, v_released, v_genres, v_platforms, v_metacritic)) then
      raise exception 'Game does not fit this slot';
    end if;
    if exists (
      select 1 from public.games g
       where g.slot_id = p_slot and g.status = 'playing'
         and coalesce(g.family_id, g.id) <> v_unit
    ) then
      raise exception 'Slot already in use';
    end if;
  end if;

  -- Move the whole occupant unit (all playing editions of this family) so a
  -- linked family keeps sharing exactly one slot.
  update public.games
     set slot_id = p_slot
   where user_id = auth.uid() and status = 'playing'
     and coalesce(family_id, id) = v_unit;
end;
$$;

-- Link two of your games into one "Game Family" (editions/remasters of the same
-- core title), merging their existing families if either already had one. Both
-- games must belong to the caller. Idempotent if they're already linked.
create or replace function public.link_games(p_game uuid, p_other uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_a_fam uuid;
  v_b_fam uuid;
  v_fam   uuid;
begin
  if p_game = p_other then
    raise exception 'Cannot link a game to itself';
  end if;

  select family_id into v_a_fam
    from public.games where id = p_game and user_id = auth.uid();
  if not found then raise exception 'Game not found'; end if;

  select family_id into v_b_fam
    from public.games where id = p_other and user_id = auth.uid();
  if not found then raise exception 'Game not found'; end if;

  -- Keep an existing family if there is one (prefer the first game's); else mint.
  v_fam := coalesce(v_a_fam, v_b_fam, gen_random_uuid());

  update public.games
     set family_id = v_fam
   where user_id = auth.uid()
     and (id in (p_game, p_other)
          or (family_id is not null and family_id in (v_a_fam, v_b_fam)));

  return v_fam;
end;
$$;

-- Remove one of your games from its family. If that leaves a single lonely
-- member, the remaining member is unlinked too (a family of one is meaningless).
create or replace function public.unlink_game(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_fam       uuid;
  v_remaining integer;
begin
  select family_id into v_fam
    from public.games where id = p_game and user_id = auth.uid();
  if not found then raise exception 'Game not found'; end if;
  if v_fam is null then return; end if;

  update public.games set family_id = null
   where id = p_game and user_id = auth.uid();

  select count(*) into v_remaining
    from public.games where user_id = auth.uid() and family_id = v_fam;
  if v_remaining <= 1 then
    update public.games set family_id = null
     where user_id = auth.uid() and family_id = v_fam;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Compilations: create a financial-container purchase plus one standalone child
-- game per bundled title, atomically. p_children is a JSON array of
-- { name, hours?, cost } (cost in dollars = that child's split of p_total).
-- Each child gets a single copy carrying the container's platform/format and its
-- cost share, so the existing per-copy spend UI just works. Returns the inserted
-- game rows so the client can append them without a refetch.
-- ---------------------------------------------------------------------------
create or replace function public.create_compilation(
  p_title    text,
  p_total    numeric,
  p_platform text,
  p_format   text,
  p_status   text,
  p_children jsonb
)
returns setof public.games
language plpgsql
security definer set search_path = public
as $$
declare
  v_comp_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Title required'; end if;
  if p_status not in ('backlog', 'wishlist', 'finished') then
    raise exception 'Invalid status';
  end if;
  if p_children is null or jsonb_typeof(p_children) <> 'array'
     or jsonb_array_length(p_children) = 0 then
    raise exception 'A compilation needs at least one game';
  end if;
  -- A child may carry its own landing status (Bazaar/Finished), overriding the
  -- container default; reject anything else so a bad value can't slip in.
  if exists (
    select 1 from jsonb_array_elements(p_children) c
    where coalesce(nullif(c->>'status', ''), 'backlog') not in ('backlog', 'finished')
  ) then
    raise exception 'Invalid per-game status';
  end if;

  insert into public.compilations (user_id, title, total_cost, platform, format)
  values (auth.uid(), btrim(p_title), coalesce(p_total, 0),
          nullif(btrim(coalesce(p_platform, '')), ''),
          nullif(btrim(coalesce(p_format, '')), ''))
  returning id into v_comp_id;

  insert into public.games
    (user_id, title, hours, genres, image, stock_image, original_image, rawg_id,
     released, metacritic, platforms, developers, esrb, catalog_id, status, copies,
     compilation_id, compilation_name, finished_at, played_hours)
  select
    auth.uid(),
    btrim(c->>'name'),
    nullif(c->>'hours', '')::real,
    coalesce(c->'genres', '[]'::jsonb),
    nullif(c->>'image', ''),
    nullif(c->>'image', ''),
    nullif(c->>'image', ''),
    nullif(c->>'rawg_id', '')::integer,
    nullif(c->>'released', '')::date,
    nullif(c->>'metacritic', '')::integer,
    coalesce(c->'platforms', '[]'::jsonb),
    coalesce(c->'developers', '[]'::jsonb),
    nullif(c->>'esrb', ''),
    nullif(c->>'catalog_id', '')::uuid,
    coalesce(nullif(c->>'status', ''), p_status),
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'platform', nullif(btrim(coalesce(p_platform, '')), ''),
      'format', nullif(btrim(coalesce(p_format, '')), ''),
      'cost', nullif(c->>'cost', '')::numeric
    ))),
    v_comp_id,
    btrim(p_title),
    case when coalesce(nullif(c->>'status', ''), p_status) = 'finished' then now() else null end,
    0
  from jsonb_array_elements(p_children) as c
  where coalesce(btrim(c->>'name'), '') <> '';

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  values (auth.uid(), v_comp_id, 'created', btrim(p_title), coalesce(p_total, 0),
          jsonb_array_length(p_children));

  return query
    select * from public.games
     where compilation_id = v_comp_id and user_id = auth.uid();
end;
$$;

-- Delete a compilation and all of its child games in one step (the only way to
-- remove a compilation's games — they can't be deleted individually). Records a
-- 'deleted' audit row first so the purchase history survives.
create or replace function public.delete_compilation(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid   uuid;
  v_title text;
  v_total numeric;
  v_count integer;
begin
  select user_id, title, total_cost into v_uid, v_title, v_total
    from public.compilations where id = p_id;
  if not found or v_uid <> auth.uid() then
    raise exception 'Compilation not found';
  end if;

  select count(*) into v_count
    from public.games where compilation_id = p_id and user_id = auth.uid();

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  values (auth.uid(), p_id, 'deleted', v_title, v_total, v_count);

  -- Children go via the FK's on delete cascade, but remove them explicitly too
  -- so the intent is clear and ordering is independent of the cascade.
  delete from public.games where compilation_id = p_id and user_id = auth.uid();
  delete from public.compilations where id = p_id and user_id = auth.uid();
end;
$$;

-- Edit a compilation: update the container (title/total/platform/format) and
-- reconcile its games against p_children. Each child carries an optional
-- 'game_id': present = an existing child to update (its title, length and cost
-- copy), absent = a newly added game to insert. Existing children NOT listed are
-- removed (a user-initiated deletion from the editor). Existing children keep
-- their own image/genres — only newly added ones take the picked metadata, so
-- editing never clobbers a child's customizations. A child may carry an explicit
-- 'status' (Bazaar/Finished) to move that game; absent it, status is left as-is.
-- Returns the resulting rows.
create or replace function public.update_compilation(
  p_id       uuid,
  p_title    text,
  p_total    numeric,
  p_platform text,
  p_format   text,
  p_children jsonb
)
returns setof public.games
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select user_id into v_uid from public.compilations where id = p_id;
  if not found or v_uid <> auth.uid() then raise exception 'Compilation not found'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Title required'; end if;
  if p_children is null or jsonb_typeof(p_children) <> 'array'
     or jsonb_array_length(p_children) = 0 then
    raise exception 'A compilation needs at least one game';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_children) c
    where coalesce(nullif(c->>'status', ''), 'backlog') not in ('backlog', 'finished')
  ) then
    raise exception 'Invalid per-game status';
  end if;

  update public.compilations
     set title = btrim(p_title),
         total_cost = coalesce(p_total, 0),
         platform = nullif(btrim(coalesce(p_platform, '')), ''),
         format = nullif(btrim(coalesce(p_format, '')), '')
   where id = p_id and user_id = auth.uid();

  -- Remove child games dropped from the editor.
  delete from public.games
   where compilation_id = p_id and user_id = auth.uid()
     and id not in (
       select (c->>'game_id')::uuid
         from jsonb_array_elements(p_children) c
        where coalesce(c->>'game_id', '') <> ''
     );

  -- Update the children that remain (title, length, denormalized name, the cost
  -- copy from the new split/platform/format). A child may also carry an explicit
  -- 'status' (Bazaar/Finished) to move that game — applied only when present, so a
  -- child left untouched keeps its own status (including 'playing'/'wishlist'). The
  -- move is direct, like the per-game card menu: no coin reward/refund. Moving out
  -- of a status frees any Now Playing slot, and finished_at is stamped/cleared to
  -- match (preserving an existing finish time). The status trigger audits the move.
  update public.games g set
     title = btrim(c->>'name'),
     hours = nullif(c->>'hours', '')::real,
     compilation_name = btrim(p_title),
     status = case when nullif(c->>'status', '') is not null
                   then c->>'status' else g.status end,
     slot_id = case when nullif(c->>'status', '') is not null
                    then null else g.slot_id end,
     finished_at = case
                     when nullif(c->>'status', '') = 'finished' then coalesce(g.finished_at, now())
                     when nullif(c->>'status', '') = 'backlog'  then null
                     else g.finished_at end,
     copies = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
       'id', gen_random_uuid()::text,
       'platform', nullif(btrim(coalesce(p_platform, '')), ''),
       'format', nullif(btrim(coalesce(p_format, '')), ''),
       'cost', nullif(c->>'cost', '')::numeric
     )))
  from jsonb_array_elements(p_children) c
  where coalesce(c->>'game_id', '') <> ''
    and g.id = (c->>'game_id')::uuid
    and g.user_id = auth.uid()
    and g.compilation_id = p_id;

  -- Insert newly added games (no game_id). New children take their chosen landing
  -- status (Bazaar/Finished), defaulting to the Bazaar; existing children above
  -- keep their own status untouched.
  insert into public.games
    (user_id, title, hours, genres, image, stock_image, original_image, rawg_id,
     released, metacritic, platforms, developers, esrb, catalog_id, status, copies,
     compilation_id, compilation_name, finished_at, played_hours)
  select
    auth.uid(),
    btrim(c->>'name'),
    nullif(c->>'hours', '')::real,
    coalesce(c->'genres', '[]'::jsonb),
    nullif(c->>'image', ''),
    nullif(c->>'image', ''),
    nullif(c->>'image', ''),
    nullif(c->>'rawg_id', '')::integer,
    nullif(c->>'released', '')::date,
    nullif(c->>'metacritic', '')::integer,
    coalesce(c->'platforms', '[]'::jsonb),
    coalesce(c->'developers', '[]'::jsonb),
    nullif(c->>'esrb', ''),
    nullif(c->>'catalog_id', '')::uuid,
    coalesce(nullif(c->>'status', ''), 'backlog'),
    jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'platform', nullif(btrim(coalesce(p_platform, '')), ''),
      'format', nullif(btrim(coalesce(p_format, '')), ''),
      'cost', nullif(c->>'cost', '')::numeric
    ))),
    p_id,
    btrim(p_title),
    case when coalesce(nullif(c->>'status', ''), 'backlog') = 'finished' then now() else null end,
    0
  from jsonb_array_elements(p_children) c
  where coalesce(c->>'game_id', '') = ''
    and coalesce(btrim(c->>'name'), '') <> '';

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  values (auth.uid(), p_id, 'updated', btrim(p_title), coalesce(p_total, 0),
          jsonb_array_length(p_children));

  return query
    select * from public.games
     where compilation_id = p_id and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard: aggregates only (no one sees another player's actual games).
-- ---------------------------------------------------------------------------

-- Dropped first because adding columns changes the return type.
drop function if exists public.leaderboard();
-- Dropped first because adding the `title` column changes the return type.
drop function if exists public.leaderboard();
create or replace function public.leaderboard()
returns table (
  id             uuid,
  display_name   text,
  avatar_url     text,
  coins          integer,
  games_finished bigint,
  hours_finished bigint,
  last_seen_at   timestamptz,
  activity       text,
  title          jsonb
)
language sql
security definer set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    p.coins,
    count(g.*) filter (where g.status = 'finished')                  as games_finished,
    -- hours is `real`; round the total to whole hours for the bigint column.
    coalesce(round(sum(g.hours) filter (where g.status = 'finished')), 0)::bigint as hours_finished,
    -- Presence is hidden for users who chose to appear offline.
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.last_seen_at end                           as last_seen_at,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.activity end                               as activity,
    public.user_title_json(p.id)                                     as title
  from public.profiles p
  left join public.games g on g.user_id = p.id
  -- Admin-hidden accounts (test/bot/etc.) never appear here, and because the
  -- per-row aggregates are computed from this set, they're excluded from the
  -- leaderboard's stats entirely.
  where not p.hidden
  group by p.id, p.display_name, p.avatar_url, p.coins, p.last_seen_at, p.activity, p.privacy
  order by p.coins desc;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which would let anyone with the
-- (public) anon key call these. Lock them to signed-in users only. (The
-- comprehensive grant/revoke block near the end of this file covers the rest,
-- including the apply_voucher_redemption/apply_replay slot functions.)
revoke execute on function public.apply_purchase(uuid, integer, uuid, boolean) from public;
revoke execute on function public.pick_start_slot(uuid, uuid, boolean)         from public;
revoke execute on function public.apply_finish(uuid, integer, integer)         from public;
revoke execute on function public.leaderboard()                                from public;

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
  v_old     integer;
begin
  if p_coins < 0 then
    raise exception 'Coins must be 0 or more';
  end if;

  select coins into v_old from public.profiles where id = auth.uid() and is_admin;

  update public.profiles
     set coins = p_coins
   where id = auth.uid()
     and is_admin
   returning coins into new_coins;

  if new_coins is null then
    raise exception 'Not authorized';
  end if;

  -- Record the manual adjustment as a ledger event (skip a no-op set).
  if new_coins is distinct from v_old then
    perform public.log_coin_event(
      auth.uid(), 'admin_adjust', new_coins - coalesce(v_old, 0), 0,
      new_coins, null, null, null, 'Manual balance adjustment'
    );
  end if;

  return new_coins;
end;
$$;

-- ---------------------------------------------------------------------------
-- User Management (admin). Security definer so an admin can read every profile
-- (plus the email from auth.users) and edit/delete other users. Each function
-- re-checks that the caller is an admin.
-- ---------------------------------------------------------------------------

-- List every user with the bits an admin manages. Returns nothing for non-admins
-- (a SQL function can't raise), which is a safe default. Dropped first because
-- adding avatar_url changes the return type.
drop function if exists public.admin_list_users();
-- Dropped first because adding presence columns changes the return type.
drop function if exists public.admin_list_users();
-- Dropped first because adding the `hidden` column changes the return type.
drop function if exists public.admin_list_users();
-- Dropped first because adding `vouchers` changes the RETURNS TABLE shape.
drop function if exists public.admin_list_users();
-- Shape change: a `roles` column was added, so drop the old definition first.
drop function if exists public.admin_list_users();
-- Dropped first: the RETURNS TABLE shape changed (added targeted_slots).
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
  id             uuid,
  email          text,
  display_name   text,
  avatar_url     text,
  coins          integer,
  vouchers       integer,
  general_slots  integer,
  targeted_slots jsonb,
  is_admin       boolean,
  blocked        boolean,
  blocked_reason text,
  hidden         boolean,
  created_at     timestamptz,
  onboarding_completed_at timestamptz,
  games_count    bigint,
  last_seen_at   timestamptz,
  activity       text,
  badges         jsonb,
  roles          jsonb
)
language sql
security definer set search_path = public
as $$
  select
    p.id, u.email, p.display_name, p.avatar_url, p.coins, p.vouchers, p.general_slots,
    -- The targeted Now Playing slots granted to this user (name + kind), so the
    -- admin list can reflect the different slot types at a glance.
    coalesce((
      select jsonb_agg(jsonb_build_object('name', sd.name, 'kind', sd.kind) order by sd.name)
        from public.user_slots us
        join public.slot_definitions sd on sd.id = us.definition_id
       where us.user_id = p.id
    ), '[]'::jsonb)                                                  as targeted_slots,
    p.is_admin, p.blocked, p.blocked_reason, p.hidden, p.created_at, p.onboarding_completed_at,
    (select count(*) from public.games g where g.user_id = p.id) as games_count,
    -- Honour appear-offline here too, for consistency with the leaderboard.
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.last_seen_at end                          as last_seen_at,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.activity end                              as activity,
    public.user_badges_json(p.id)                                   as badges,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name) order by r.name)
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.user_id = p.id
    ), '[]'::jsonb)                                                  as roles
  from public.profiles p
  left join auth.users u on u.id = p.id
  where public.has_permission('users.view')
  order by p.created_at asc;
$$;

-- Edit a user's admin-managed fields in one call. Re-checks the caller is an
-- admin and guards against an admin demoting or blocking themselves (so the last
-- admin can't accidentally lock the door from the inside).
-- Dropped first because adding p_hidden, then p_vouchers, changes the signature
-- (otherwise an old overload would linger alongside the new one).
drop function if exists public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text);
drop function if exists public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean);
create or replace function public.admin_update_user(
  p_user           uuid,
  p_display_name   text,
  p_coins          integer,
  p_general_slots  integer,
  p_is_admin       boolean,
  p_blocked        boolean,
  p_blocked_reason text,
  p_hidden         boolean,
  p_vouchers       integer
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_old      integer;
  v_old_vou  integer;
  v_super    boolean;
  v_econ     boolean;
  v_block    boolean;
  v_cur      public.profiles%rowtype;
begin
  v_super := exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin);
  v_econ  := public.has_permission('users.economy');
  v_block := public.has_permission('users.block');
  -- Must hold at least one user-editing permission to change anything.
  if not (v_super or v_econ or v_block) then
    raise exception 'Not authorized';
  end if;
  if p_coins < 0 then
    raise exception 'Coins must be 0 or more';
  end if;
  if p_vouchers < 0 then
    raise exception 'Vouchers must be 0 or more';
  end if;
  if p_general_slots < 0 or p_general_slots > 99 then
    raise exception 'Slots must be between 0 and 99';
  end if;

  select * into v_cur from public.profiles where id = p_user;
  if not found then
    raise exception 'User not found';
  end if;
  v_old     := v_cur.coins;
  v_old_vou := v_cur.vouchers;

  -- Per-field authority: a delegate may only change the field groups they hold.
  -- Compare each requested value to the current one and reject a change they
  -- can't make (the blanket update below is then safe).
  if (p_coins is distinct from v_cur.coins
      or p_vouchers is distinct from v_cur.vouchers
      or p_general_slots is distinct from v_cur.general_slots)
     and not (v_super or v_econ) then
    raise exception 'Not authorized to change coins, vouchers or slots';
  end if;
  if (p_blocked is distinct from v_cur.blocked
      or nullif(btrim(p_blocked_reason), '') is distinct from v_cur.blocked_reason
      or p_hidden is distinct from v_cur.hidden)
     and not (v_super or v_block) then
    raise exception 'Not authorized to block or hide users';
  end if;
  -- Promoting/demoting a super-admin is reserved for super-admins, regardless of
  -- any granular permission a delegate might hold.
  if p_is_admin is distinct from v_cur.is_admin and not v_super then
    raise exception 'Only a super-admin can change admin status';
  end if;

  -- Self-guard: don't let a super-admin strip their own admin, and don't let
  -- anyone block themselves out of the app.
  if p_user = auth.uid() and ((v_super and not p_is_admin) or p_blocked) then
    raise exception 'You cannot remove your own admin or block yourself';
  end if;

  update public.profiles
     set display_name   = coalesce(nullif(btrim(p_display_name), ''), display_name),
         coins          = p_coins,
         vouchers       = p_vouchers,
         general_slots  = p_general_slots,
         is_admin       = p_is_admin,
         blocked        = p_blocked,
         blocked_reason = nullif(btrim(p_blocked_reason), ''),
         hidden         = p_hidden
   where id = p_user;

  -- Record an admin coin grant/deduction on the target user's ledger.
  if p_coins is distinct from v_old then
    perform public.log_coin_event(
      p_user, 'admin_adjust', p_coins - coalesce(v_old, 0), 0,
      p_coins, null, null, null, 'Admin balance change'
    );
  end if;

  -- Record an admin voucher grant/deduction (coins untouched) on the ledger.
  if p_vouchers is distinct from v_old_vou then
    perform public.log_coin_event(
      p_user, 'voucher_grant', 0, 0, p_coins, null, null, null,
      'Admin voucher change', '{}'::jsonb,
      p_vouchers - coalesce(v_old_vou, 0), p_vouchers
    );
  end if;
end;
$$;

-- Admin: reset a user's onboarding so the FULL fresh-signup tour runs for them
-- again, exactly as if they'd just signed up — clear the completion stamp and
-- re-flag the deferred starter grant, so finishing the tour re-credits the
-- configured vouchers. Admin-only, security definer.
create or replace function public.admin_reset_onboarding(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('users.onboarding') then
    raise exception 'Not authorized';
  end if;
  update public.profiles
     set onboarding_completed_at = null, onboarding_vouchers_pending = true
   where id = p_user;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

-- Send a user a notification about an admin action on their account (a coin
-- adjustment, a slot grant/revoke, etc.) with an optional reason. Security-
-- definer so the notification is created server-side (the client never inserts
-- notifications directly); admin-only, and never fires for your own account.
create or replace function public.admin_notify(p_user uuid, p_title text, p_body text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('users.notify') then
    raise exception 'Not authorized';
  end if;
  if p_user is null or p_user = auth.uid() then
    return; -- never notify yourself about your own action
  end if;
  insert into public.notifications (user_id, type, title, body)
  values (
    p_user,
    'admin_change',
    coalesce(nullif(btrim(p_title), ''), 'Account update'),
    nullif(btrim(p_body), '')
  );
end;
$$;

-- Permanently delete a user. Removing the auth.users row cascades to their
-- profile, games, requests, comments, etc. An admin can't delete themselves here.
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('users.delete') then
    raise exception 'Not authorized';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot delete your own account here';
  end if;
  delete from auth.users where id = p_user;
  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Badge admin grant/revoke + title selection. (The user_badges_json /
-- user_title_json read helpers are defined up in the badges section, since the
-- leaderboard/view_profile/admin_list_users functions above already use them.)
-- ---------------------------------------------------------------------------

-- Grant a badge to a user (admin only). Idempotent: re-granting clears any prior
-- soft-revoke and refreshes the grant. Notifies the recipient server-side (never
-- yourself), matching the notifications-only-from-the-server rule.
create or replace function public.admin_grant_badge(p_user uuid, p_badge uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not public.has_permission('badges.grant') then
    raise exception 'Not authorized';
  end if;
  select name into v_name from public.badges where id = p_badge;
  if v_name is null then
    raise exception 'Badge not found';
  end if;
  insert into public.user_badges (user_id, badge_id, source, granted_by)
  values (p_user, p_badge, 'admin', auth.uid())
  on conflict (user_id, badge_id)
  do update set revoked_at = null, granted_by = auth.uid(), granted_at = now();
  if p_user <> auth.uid() then
    insert into public.notifications (user_id, type, title, body)
    values (p_user, 'badge_granted', 'You earned a badge',
            'You were awarded the "' || v_name || '" badge.');
  end if;
end;
$$;

-- Revoke a badge from a user (admin only). Soft-revoke (keeps history) and clears
-- the title if the user was displaying it.
create or replace function public.admin_revoke_badge(p_user uuid, p_badge uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('badges.grant') then
    raise exception 'Not authorized';
  end if;
  update public.user_badges set revoked_at = now()
   where user_id = p_user and badge_id = p_badge and revoked_at is null;
  update public.profiles set selected_badge_id = null
   where id = p_user and selected_badge_id = p_badge;
end;
$$;

-- Choose which earned badge to display as your title (p_badge null clears it).
-- You must currently hold the badge. Routed through this definer function because
-- selected_badge_id is intentionally not in the user's direct profiles grant.
create or replace function public.set_selected_title(p_badge uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_badge is not null and not exists (
    select 1 from public.user_badges
     where user_id = auth.uid() and badge_id = p_badge and revoked_at is null
  ) then
    raise exception 'You do not have that badge';
  end if;
  update public.profiles set selected_badge_id = p_badge where id = auth.uid();
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
  -- A visitor never sees games the owner marked private; the owner themselves
  -- (p_user = auth.uid()) always sees their full library through this function.
  select * from public.games
   where user_id = p_user
     and (p_user = auth.uid() or not coalesce(private, false))
   order by added_at desc;
$$;

-- The public header for visiting another player's Bazaar: their display name,
-- avatar, coins, chosen theme (so we render their page in their theme), finished
-- totals, and whether they've hidden their real-world spend from visitors.
-- Security definer so it can read any profile regardless of RLS. Dropped first
-- because it's new (and to keep the return shape authoritative).
drop function if exists public.view_profile(uuid);
create or replace function public.view_profile(p_user uuid)
returns table (
  display_name   text,
  avatar_url     text,
  coins          integer,
  theme          text,
  games_finished bigint,
  hours_finished bigint,
  hide_spend     boolean,
  last_seen_at   timestamptz,
  activity       text,
  badges         jsonb,
  title          jsonb
)
language sql
security definer set search_path = public
as $$
  select
    p.display_name,
    p.avatar_url,
    p.coins,
    p.theme,
    count(g.*) filter (where g.status = 'finished')                  as games_finished,
    -- hours is `real`; round the total to whole hours for the bigint column.
    coalesce(round(sum(g.hours) filter (where g.status = 'finished')), 0)::bigint as hours_finished,
    coalesce((p.privacy->>'hide_spend')::boolean, false)             as hide_spend,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.last_seen_at end                           as last_seen_at,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.activity end                               as activity,
    public.user_badges_json(p.id)                                    as badges,
    public.user_title_json(p.id)                                     as title
  from public.profiles p
  left join public.games g on g.user_id = p.id
  where p.id = p_user
  group by p.id, p.display_name, p.avatar_url, p.coins, p.theme, p.privacy,
           p.last_seen_at, p.activity;
$$;

-- The feature board, in one call: every request with its submitter's display
-- name, total upvotes, and whether the caller has voted. Ordered most-wanted
-- first. Security definer so it can read every profile/vote regardless of RLS.
-- Dropped first because adding the `kind` column changes the return type, which
-- create-or-replace can't do.
drop function if exists public.list_feature_requests();
create or replace function public.list_feature_requests()
returns table (
  id            uuid,
  kind          text,
  title         text,
  description   text,
  status        text,
  user_id       uuid,
  requester_name text,
  is_admin_item boolean,
  created_at    timestamptz,
  edited_at     timestamptz,
  vote_count    bigint,
  voted_by_me   boolean,
  comment_count bigint,
  attachment_count bigint,
  tags          text[],
  priority      text,
  effort        text
)
language sql
security definer set search_path = public
as $$
  select
    r.id,
    r.kind,
    r.title,
    r.description,
    r.status,
    r.user_id,
    p.display_name,
    r.is_admin_item,
    r.created_at,
    r.edited_at,
    count(v.user_id)                                  as vote_count,
    coalesce(bool_or(v.user_id = auth.uid()), false)  as voted_by_me,
    (select count(*) from public.feature_comments c where c.request_id = r.id) as comment_count,
    (select count(*) from public.feature_attachments a
      where a.request_id = r.id and a.comment_id is null) as attachment_count,
    r.tags,
    r.priority,
    r.effort
  from public.feature_requests r
  left join public.profiles p     on p.id = r.user_id
  left join public.feature_votes v on v.request_id = r.id
  group by r.id, p.display_name
  order by count(v.user_id) desc, r.created_at desc;
$$;

-- Edit a request's title/description/kind/tags/priority/effort. Security definer so
-- the owner can edit their own row even though the table's UPDATE policy is
-- admin-only (status moves stay admin-only); admins may edit any. Deliberately
-- never touches status. Dropped first because adding params changes the signature.
drop function if exists public.edit_feature_request(uuid, text, text);
drop function if exists public.edit_feature_request(uuid, text, text, text);
drop function if exists public.edit_feature_request(uuid, text, text, text, text[], text);
create or replace function public.edit_feature_request(
  p_id uuid, p_title text, p_description text, p_kind text,
  p_tags text[], p_priority text, p_effort text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_kind not in ('feature', 'bug') then
    raise exception 'Invalid kind';
  end if;
  if p_priority not in ('low', 'medium', 'high') then
    raise exception 'Invalid priority';
  end if;
  if p_effort not in ('low', 'medium', 'high') then
    raise exception 'Invalid effort';
  end if;
  update public.feature_requests
     set title = p_title,
         description = nullif(btrim(p_description), ''),
         kind = p_kind,
         tags = coalesce(p_tags, '{}'::text[]),
         priority = p_priority,
         effort = p_effort,
         updated_at = now(),
         edited_at = now()
   where id = p_id
     and (user_id = auth.uid()
          or public.has_permission('issues.moderate'));
  if not found then
    raise exception 'Not allowed to edit this request';
  end if;
end;
$$;

-- Let the SUBMITTER sign off on an item that's awaiting their feedback: approve
-- it (-> done) or request changes (-> in_progress). Security definer because the
-- table's UPDATE policy is admin-only; this path is restricted to the request's
-- own owner and only from the 'awaiting_feedback' state. Admins still move items
-- freely via the normal admin update. Notifies admins that the requester
-- responded (the status trigger won't notify, since the owner is the actor).
create or replace function public.respond_feature_request(p_id uuid, p_approve boolean)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner      uuid;
  v_status     text;
  v_title      text;
  v_new_status text;
  who          text;
begin
  select user_id, status, title into v_owner, v_status, v_title
    from public.feature_requests where id = p_id;

  if v_owner is null then
    raise exception 'Request not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Only the submitter can respond to this request';
  end if;
  if v_status <> 'awaiting_feedback' then
    raise exception 'This request is not awaiting your feedback';
  end if;

  v_new_status := case when p_approve then 'done' else 'changes_requested' end;
  update public.feature_requests
     set status = v_new_status, updated_at = now()
   where id = p_id;

  -- Notify admins that the requester signed off / asked for more work. Use a
  -- distinct type for "requested changes" so the bell can show an appropriate
  -- icon (a checkmark only makes sense for approvals).
  select coalesce(display_name, 'Someone') into who
    from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, title, body, link)
  select p.id,
         case when p_approve then 'feature_response' else 'feature_changes' end,
         v_title,
         who || case when p_approve then ' approved this and marked it done'
                     else ' requested changes' end,
         'features:' || p_id
  from public.profiles p
  where p.is_admin and p.id <> auth.uid();

  return v_new_status;
end;
$$;

-- All comments for one request, with each author's display name plus reaction
-- tallies. `reactions` is an emoji→count object; `my_reactions` lists the emojis
-- the caller used. Security definer so it can read every profile/reaction
-- regardless of RLS. Oldest first (thread order). Dropped first because the added
-- columns change the return type.
drop function if exists public.list_request_comments(uuid);
create or replace function public.list_request_comments(p_request uuid)
returns table (
  id           uuid,
  request_id   uuid,
  user_id      uuid,
  parent_id    uuid,
  author_name  text,
  body         text,
  created_at   timestamptz,
  updated_at   timestamptz,
  reactions    jsonb,
  my_reactions text[],
  attachments  jsonb
)
language sql
security definer set search_path = public
as $$
  select
    c.id, c.request_id, c.user_id, c.parent_id, p.display_name, c.body, c.created_at, c.updated_at,
    coalesce(
      (select jsonb_object_agg(z.emoji, z.cnt)
         from (select r.emoji, count(*) as cnt
                 from public.comment_reactions r
                where r.comment_id = c.id
                group by r.emoji) z),
      '{}'::jsonb
    ) as reactions,
    coalesce(
      (select array_agg(r.emoji)
         from public.comment_reactions r
        where r.comment_id = c.id and r.user_id = auth.uid()),
      '{}'::text[]
    ) as my_reactions,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', a.id, 'request_id', a.request_id, 'user_id', a.user_id,
                'url', a.url, 'path', a.path, 'name', a.name,
                'content_type', a.content_type, 'size', a.size, 'created_at', a.created_at
              ) order by a.created_at)
         from public.feature_attachments a
        where a.comment_id = c.id),
      '[]'::jsonb
    ) as attachments
  from public.feature_comments c
  left join public.profiles p on p.id = c.user_id
  where c.request_id = p_request
  order by c.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Notification triggers on feature_requests. Security definer so they can insert
-- into notifications for a *different* user; auth.uid() is the actor making the
-- change, so we never notify someone about their own action.
-- ---------------------------------------------------------------------------

create or replace function public.notify_feature_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.user_id <> auth.uid() then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.user_id,
      'feature_status',
      new.title,
      'Moved to ' || case new.status
        when 'submitted'         then 'Submitted'
        when 'planned'           then 'Planned'
        when 'in_progress'       then 'In Progress'
        when 'awaiting_feedback' then 'Awaiting Feedback'
        when 'done'              then 'Done'
        when 'declined'          then 'Declined'
        else new.status
      end,
      'features:' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists feature_requests_notify_status on public.feature_requests;
create trigger feature_requests_notify_status
  after update on public.feature_requests
  for each row execute function public.notify_feature_status();

create or replace function public.notify_feature_new()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  who text;
begin
  select coalesce(display_name, 'Someone') into who
    from public.profiles where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'feature_new',
         case when new.kind = 'bug' then 'New bug report' else 'New feature request' end,
         who || ': "' || new.title || '"', 'features:' || new.id
  from public.profiles p
  where p.is_admin and p.id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists feature_requests_notify_new on public.feature_requests;
create trigger feature_requests_notify_new
  after insert on public.feature_requests
  for each row execute function public.notify_feature_new();

-- A new comment notifies the request owner; a reply also notifies the author of
-- everyone else who participated in that thread. Never notify the commenter
-- about their own action, and don't double-notify the request owner.
create or replace function public.notify_feature_comment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  who       text;
  req_owner uuid;
  req_title text;
  snippet   text;
begin
  select coalesce(display_name, 'Someone') into who
    from public.profiles where id = new.user_id;
  select user_id, title into req_owner, req_title
    from public.feature_requests where id = new.request_id;
  snippet := left(new.body, 80);

  -- Notify the request owner (unless they wrote the comment).
  if req_owner is not null and req_owner <> new.user_id then
    insert into public.notifications (user_id, type, title, body, link)
    values (req_owner, 'feature_comment', req_title,
            who || ' commented: "' || snippet || '"', 'features:' || new.request_id);
  end if;

  -- On a reply, notify everyone who participated in the thread (the root
  -- comment's author + anyone who has replied), minus the commenter and the
  -- already-notified owner. The thread root is new.parent_id (replies are one
  -- level deep), so participants = that comment + all comments sharing it as
  -- their parent (the just-inserted row included, excluded by the uid filter).
  if new.parent_id is not null then
    insert into public.notifications (user_id, type, title, body, link)
    select distinct u.uid, 'feature_reply', req_title,
           who || ' replied: "' || snippet || '"', 'features:' || new.request_id
    from (
      select user_id as uid from public.feature_comments where id = new.parent_id
      union
      select user_id as uid from public.feature_comments where parent_id = new.parent_id
    ) u
    where u.uid is not null
      and u.uid <> new.user_id
      and u.uid is distinct from req_owner;
  end if;

  return new;
end;
$$;

drop trigger if exists feature_comments_notify on public.feature_comments;
create trigger feature_comments_notify
  after insert on public.feature_comments
  for each row execute function public.notify_feature_comment();

-- A reaction on a comment notifies that comment's author (never yourself).
create or replace function public.notify_comment_reaction()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  who            text;
  comment_author uuid;
  req_id         uuid;
  req_title      text;
begin
  select user_id, request_id into comment_author, req_id
    from public.feature_comments where id = new.comment_id;
  if comment_author is null or comment_author = new.user_id then
    return new; -- self-reaction (or missing comment): nothing to send
  end if;

  select coalesce(display_name, 'Someone') into who
    from public.profiles where id = new.user_id;
  select title into req_title from public.feature_requests where id = req_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (comment_author, 'feature_reaction', req_title,
          who || ' reacted ' || new.emoji || ' to your comment', 'features:' || req_id);

  return new;
end;
$$;

drop trigger if exists comment_reactions_notify on public.comment_reactions;
create trigger comment_reactions_notify
  after insert on public.comment_reactions
  for each row execute function public.notify_comment_reaction();

-- ---------------------------------------------------------------------------
-- Player history (audit/event logging — Phase A). Append-only, timestamped
-- records of player activity, so future features can grant history, compute
-- time-windowed/streak stats, and retroactively compensate existing users. Like
-- coin_events these are written ONLY by triggers (never the client) and are
-- read-only to clients (own rows + admins). Purely additive; triggers fire on
-- new events only, so there is no retroactive backfill of past activity.
--
--   • playtime_events    — one row per change to a game's logged hours (the delta
--                          plus the new total), so "logged 2.5h on X at T" is kept
--                          even though games.played_hours only stores the sum.
--   • game_status_events — one row per status transition (add, buy, shelve,
--                          finish, import, move to/from wishlist, delete), so the
--                          full lifecycle survives even when single timestamps on
--                          games (started_at/finished_at) get overwritten/nulled.
-- Both denormalize the game title and use `on delete set null` for game_id, so a
-- row outlives the game being deleted (mirrors coin_events.game_title).
-- ---------------------------------------------------------------------------

create table if not exists public.playtime_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  game_id      uuid references public.games (id) on delete set null,
  game_title   text,
  -- hours: the change applied this event (positive when logging time, negative
  -- when an edit corrects the total down). played_after: the new running total.
  hours        real not null,
  played_after real,
  created_at   timestamptz not null default now()
);
create index if not exists playtime_events_user_idx
  on public.playtime_events (user_id, created_at desc, id desc);
create index if not exists playtime_events_game_idx
  on public.playtime_events (game_id);

create table if not exists public.game_status_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game_title  text,
  -- from_status is null for the initial add; to_status is the literal 'deleted'
  -- sentinel when the game row is removed (game_id is left null in that case so
  -- the insert doesn't reference the row being deleted).
  from_status text,
  to_status   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists game_status_events_user_idx
  on public.game_status_events (user_id, created_at desc, id desc);
create index if not exists game_status_events_game_idx
  on public.game_status_events (game_id);

-- Additive columns (safe to re-run):
--  • platform (playtime only): which platform the session was played on — the
--    one log_playtime passed, or auto-detected when the game is owned on exactly
--    one platform. Makes "most-played system" answerable.
--  • genres/developers/platforms/game_hours: a snapshot of the game's classifying
--    metadata AT EVENT TIME, so genre/length/developer analytics survive the game
--    being deleted (game_id then nulls) or its catalog metadata later changing.
--  • source: 'live' for real-time events, 'backfill' for the one-time synthetic
--    history seeded below — so time-windowed stats can exclude the backfill while
--    All-Time totals include it.
alter table public.playtime_events add column if not exists platform    text;
-- format (playtime only): the copy format the session was played on (physical /
-- digital), so two copies on the same platform but different formats are tracked
-- apart. Null when no format was recorded. Additive; existing rows stay null.
alter table public.playtime_events add column if not exists format      text;
alter table public.playtime_events add column if not exists genres      jsonb;
alter table public.playtime_events add column if not exists developers  jsonb;
alter table public.playtime_events add column if not exists game_hours   real;
alter table public.playtime_events add column if not exists source       text not null default 'live';
alter table public.playtime_events drop constraint if exists playtime_events_source_check;
alter table public.playtime_events add constraint playtime_events_source_check
  check (source in ('live', 'backfill'));

alter table public.game_status_events add column if not exists genres     jsonb;
alter table public.game_status_events add column if not exists developers jsonb;
alter table public.game_status_events add column if not exists platforms  jsonb;
alter table public.game_status_events add column if not exists game_hours real;
alter table public.game_status_events add column if not exists source     text not null default 'live';
alter table public.game_status_events drop constraint if exists game_status_events_source_check;
alter table public.game_status_events add constraint game_status_events_source_check
  check (source in ('live', 'backfill'));

-- Strictly read-only to clients: SELECT your own rows (admins see all); writes
-- come exclusively from the triggers below. Mirrors the coin_events posture.
alter table public.playtime_events    enable row level security;
alter table public.game_status_events enable row level security;

revoke insert, update, delete on public.playtime_events    from authenticated, anon;
revoke insert, update, delete on public.game_status_events from authenticated, anon;

drop policy if exists "playtime_events_select" on public.playtime_events;
create policy "playtime_events_select" on public.playtime_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "game_status_events_select" on public.game_status_events;
create policy "game_status_events_select" on public.game_status_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Record a playtime change. Fires for every path that moves games.played_hours
-- (the log_playtime RPC's increment and the manual "edit playtime" update alike),
-- so capture is uniform and can't be bypassed by the client.
create or replace function public.log_playtime_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_platform text;
  v_format   text;
  v_explicit boolean;
begin
  if new.played_hours is distinct from old.played_hours then
    -- Attribute the session to a version (platform + format): the one passed via
    -- transaction-local GUCs, else auto-detected when the game is owned on exactly
    -- one copy. Null when ambiguous (multiple copies, no choice given). When the
    -- caller marks it "explicit" (set_platform_playtime, the per-version editor),
    -- use the values verbatim — including a deliberate null for the Unspecified
    -- bucket — and skip the single-copy auto-detect so a correction lands exactly
    -- where intended.
    v_explicit := coalesce(current_setting('app.play_platform_explicit', true), '') = 'true';
    v_platform := nullif(current_setting('app.play_platform', true), '');
    v_format   := nullif(current_setting('app.play_format', true), '');
    if not v_explicit
       and v_platform is null
       and jsonb_typeof(new.copies) = 'array'
       and jsonb_array_length(new.copies) = 1 then
      v_platform := new.copies -> 0 ->> 'platform';
      v_format   := new.copies -> 0 ->> 'format';
    end if;
    insert into public.playtime_events
      (user_id, game_id, game_title, hours, played_after, platform, format, genres, developers, game_hours)
    values (new.user_id, new.id, new.title, new.played_hours - old.played_hours, new.played_hours,
            v_platform, v_format, new.genres, new.developers, new.hours);
  end if;
  return new;
end;
$$;

drop trigger if exists games_log_playtime on public.games;
create trigger games_log_playtime
  after update of played_hours on public.games
  for each row execute function public.log_playtime_event();

-- Set the total logged hours attributed to one version (platform) of a game — or
-- the Unspecified bucket when p_platform is null/blank — to p_hours. Used by the
-- per-version playtime editor in the Edit Game modal. Works by logging an
-- attributed correction: it sums the bucket's current hours from the event log,
-- then nudges games.played_hours by the difference with the platform marked
-- explicit, so the capture trigger records the delta against exactly that bucket
-- (including a deliberate null). The game's grand total stays the sum of its
-- buckets. Security-definer + an ownership check; usable on a game in any status
-- (corrections aren't limited to Now Playing). Returns the new grand total.
-- Signature changed (added p_format), so the older 3-arg version is dropped.
drop function if exists public.set_platform_playtime(uuid, text, real);
create or replace function public.set_platform_playtime(p_game uuid, p_platform text, p_format text, p_hours real)
returns real
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_platform text := nullif(btrim(p_platform), '');
  v_format   text := nullif(btrim(p_format), '');
  v_current  real;
  v_total    real;
begin
  if p_hours is null or p_hours < 0 then
    raise exception 'Hours must be zero or positive';
  end if;
  if not exists (select 1 from public.games where id = p_game and user_id = auth.uid()) then
    raise exception 'Game not available';
  end if;

  -- Hours currently attributed to this version (platform + format, or the
  -- Unspecified bucket when platform is null), summed from the append-only log.
  select coalesce(sum(hours), 0) into v_current
    from public.playtime_events
   where game_id = p_game and user_id = auth.uid()
     and nullif(btrim(platform), '') is not distinct from v_platform
     and nullif(btrim(format), '')   is not distinct from v_format;

  if p_hours = v_current then
    select played_hours into v_total from public.games where id = p_game;
    return v_total;
  end if;

  -- Attribute the correction explicitly to this version so the trigger records it
  -- verbatim (no single-copy auto-detect, and a null stays null).
  perform set_config('app.play_platform_explicit', 'true', true);
  perform set_config('app.play_platform', coalesce(v_platform, ''), true);
  perform set_config('app.play_format', coalesce(v_format, ''), true);
  update public.games
     set played_hours = greatest(0, played_hours + (p_hours - v_current))
   where id = p_game and user_id = auth.uid()
   returning played_hours into v_total;

  return v_total;
end;
$$;

-- Record a game's lifecycle: its initial add, every status change, and its
-- removal. On delete game_id is left null (the row is going away) but the title
-- snapshot is kept, so the history line still reads sensibly.
create or replace function public.log_game_status_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.game_status_events
      (user_id, game_id, game_title, from_status, to_status, genres, developers, platforms, game_hours)
    values (new.user_id, new.id, new.title, null, new.status,
            new.genres, new.developers, new.platforms, new.hours);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.game_status_events
        (user_id, game_id, game_title, from_status, to_status, genres, developers, platforms, game_hours)
      values (new.user_id, new.id, new.title, old.status, new.status,
              new.genres, new.developers, new.platforms, new.hours);
    end if;
    return new;
  else -- DELETE
    -- Only log the removal when the owning user still exists (they deleted just
    -- this game). When the USER is being deleted, the cascade has already removed
    -- their auth.users row, so this insert would violate the user_id FK — and the
    -- event would be cascade-deleted anyway. Guard on the exact FK target so the
    -- check is correct regardless of cascade ordering among the user's children.
    if exists (select 1 from auth.users u where u.id = old.user_id) then
      insert into public.game_status_events
        (user_id, game_id, game_title, from_status, to_status, genres, developers, platforms, game_hours)
      values (old.user_id, null, old.title, old.status, 'deleted',
              old.genres, old.developers, old.platforms, old.hours);
    end if;
    return old;
  end if;
end;
$$;

drop trigger if exists games_log_status on public.games;
create trigger games_log_status
  after insert or update or delete on public.games
  for each row execute function public.log_game_status_event();

-- Game visibility history (audit/event logging). One append-only, timestamped
-- row per time a game is made private or public again, so future features can
-- audit who hid what and when even though games.private overwrites in place.
-- Written ONLY by the trigger below; read-own + admin, mirroring the other
-- Phase A event tables. game_id is `on delete set null` with a title snapshot so
-- the history outlives the game.
create table if not exists public.game_visibility_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game_title  text,
  private     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists game_visibility_events_user_idx
  on public.game_visibility_events (user_id, created_at desc, id desc);
create index if not exists game_visibility_events_game_idx
  on public.game_visibility_events (game_id);

alter table public.game_visibility_events enable row level security;
revoke insert, update, delete on public.game_visibility_events from authenticated, anon;

drop policy if exists "game_visibility_events_select" on public.game_visibility_events;
create policy "game_visibility_events_select" on public.game_visibility_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Record each visibility flip (private on/off). Fires only when games.private
-- actually changes, so a plain save that doesn't touch it logs nothing.
create or replace function public.log_game_visibility_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.private is distinct from old.private then
    insert into public.game_visibility_events (user_id, game_id, game_title, private)
    values (new.user_id, new.id, new.title, new.private);
  end if;
  return new;
end;
$$;

drop trigger if exists games_log_visibility on public.games;
create trigger games_log_visibility
  after update of private on public.games
  for each row execute function public.log_game_visibility_event();

-- ---------------------------------------------------------------------------
-- Community board history (audit/event logging — Phase B). One append-only,
-- timestamped table records activity on the feature/bug board, so future
-- features can count contributions, measure engagement, and audit moderation —
-- even though the live tables overwrite status in place and hard-delete votes,
-- reactions and comments.
--
-- Capture is INSERT-driven (and the few meaningful request UPDATEs): a 'vote',
-- 'reaction' or 'comment' event is the durable signal that the engagement
-- happened, and it PERSISTS after the user later un-votes / un-reacts / deletes
-- the comment (the live row going away doesn't erase the history). Logging only
-- the cast — never the removal — also deliberately avoids a flood of spurious
-- "removed" events when a whole request is deleted and its votes/comments
-- cascade away. request-level lifecycle ('created', 'status' with from→to and
-- the acting admin, 'edited', 'deleted') is captured from feature_requests.
--
-- Written ONLY by the triggers below (never the client); read-own (by actor) +
-- admin, matching coin_events / Phase A. request_id is `on delete set null` with
-- a denormalized request_title, so a row outlives the request; a deleted
-- comment's body is kept as a short snippet in `detail` for moderation/history.
-- ---------------------------------------------------------------------------

create table if not exists public.feature_request_events (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references public.feature_requests (id) on delete set null,
  request_title text,
  actor_id      uuid references auth.users (id) on delete set null,
  type          text not null
                  check (type in ('created', 'status', 'edited', 'deleted', 'vote', 'comment', 'reaction')),
  -- from_status / to_status are populated for 'status' (and to_status carries the
  -- initial status for 'created', from_status the last status for 'deleted').
  from_status   text,
  to_status     text,
  -- detail: type-specific extras — e.g. {kind}, {comment_id, parent_id, snippet},
  -- {comment_id, emoji}. Kept flexible so new event shapes don't need a migration.
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists feature_request_events_actor_idx
  on public.feature_request_events (actor_id, created_at desc, id desc);
create index if not exists feature_request_events_request_idx
  on public.feature_request_events (request_id, created_at desc);
create index if not exists feature_request_events_type_idx
  on public.feature_request_events (type, created_at desc);

-- kind: 'feature' or 'bug', denormalized onto every event (even votes/comments/
-- reactions, resolved from the parent) so "upvotes on bugs vs features" and other
-- splits are a plain group-by with no join — and survive the request's deletion.
alter table public.feature_request_events add column if not exists kind text;

alter table public.feature_request_events enable row level security;
revoke insert, update, delete on public.feature_request_events from authenticated, anon;

drop policy if exists "feature_request_events_select" on public.feature_request_events;
create policy "feature_request_events_select" on public.feature_request_events
  for select to authenticated using (
    auth.uid() = actor_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- feature_requests: the creation, every status move (with the acting admin), an
-- edit (edited_at changes — the edit RPC sets it and never touches status, so
-- edits and status moves never conflate), and removal.
create or replace function public.log_feature_request_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.feature_request_events
      (request_id, request_title, actor_id, type, kind, to_status)
    values (new.id, new.title, new.user_id, 'created', new.kind, new.status);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.feature_request_events
        (request_id, request_title, actor_id, type, kind, from_status, to_status)
      values (new.id, new.title, auth.uid(), 'status', new.kind, old.status, new.status);
    end if;
    if new.edited_at is distinct from old.edited_at and new.edited_at is not null then
      insert into public.feature_request_events
        (request_id, request_title, actor_id, type, kind)
      values (new.id, new.title, auth.uid(), 'edited', new.kind);
    end if;
    return new;
  else -- DELETE: request_id left null (the row is going away); identity kept in detail.
    insert into public.feature_request_events
      (request_id, request_title, actor_id, type, kind, from_status, detail)
    values (null, old.title, auth.uid(), 'deleted', old.kind, old.status,
            jsonb_build_object('request_id', old.id));
    return old;
  end if;
end;
$$;

drop trigger if exists feature_requests_log_event on public.feature_requests;
create trigger feature_requests_log_event
  after insert or update or delete on public.feature_requests
  for each row execute function public.log_feature_request_event();

-- A vote cast (the durable engagement signal; un-votes aren't logged — see above).
create or replace function public.log_feature_vote_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_title text; v_kind text;
begin
  select title, kind into v_title, v_kind from public.feature_requests where id = new.request_id;
  insert into public.feature_request_events
    (request_id, request_title, actor_id, type, kind)
  values (new.request_id, v_title, new.user_id, 'vote', v_kind);
  return new;
end;
$$;

drop trigger if exists feature_votes_log_event on public.feature_votes;
create trigger feature_votes_log_event
  after insert on public.feature_votes
  for each row execute function public.log_feature_vote_event();

-- A comment posted (kept with a short body snippet so the history survives the
-- comment being deleted).
create or replace function public.log_feature_comment_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_title text; v_kind text;
begin
  select title, kind into v_title, v_kind from public.feature_requests where id = new.request_id;
  insert into public.feature_request_events
    (request_id, request_title, actor_id, type, kind, detail)
  values (new.request_id, v_title, new.user_id, 'comment', v_kind,
          jsonb_build_object('comment_id', new.id, 'parent_id', new.parent_id,
                             'snippet', left(new.body, 500)));
  return new;
end;
$$;

drop trigger if exists feature_comments_log_event on public.feature_comments;
create trigger feature_comments_log_event
  after insert on public.feature_comments
  for each row execute function public.log_feature_comment_event();

-- A reaction added on a comment (resolve the request via the comment).
create or replace function public.log_comment_reaction_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_req uuid; v_title text; v_kind text;
begin
  select request_id into v_req from public.feature_comments where id = new.comment_id;
  select title, kind into v_title, v_kind from public.feature_requests where id = v_req;
  insert into public.feature_request_events
    (request_id, request_title, actor_id, type, kind, detail)
  values (v_req, v_title, new.user_id, 'reaction', v_kind,
          jsonb_build_object('comment_id', new.comment_id, 'emoji', new.emoji));
  return new;
end;
$$;

drop trigger if exists comment_reactions_log_event on public.comment_reactions;
create trigger comment_reactions_log_event
  after insert on public.comment_reactions
  for each row execute function public.log_comment_reaction_event();

-- ---------------------------------------------------------------------------
-- Issue relations: Jira-style links between two issues (a feature/bug request
-- "blocks", "duplicates", or "relates" to another). Each link is one directed
-- row; the inverse label ("blocked by" / "duplicated by") is derived per side at
-- read time. 'relates' is symmetric, stored once in canonical (least→greatest)
-- order so it can't be duplicated. Anyone signed in may link/unlink for now —
-- the single gate is the RLS policy below, easy to tighten to roles later.
-- Defined BEFORE the issue_* views below, since issue_relations selects from it.
-- ---------------------------------------------------------------------------
create table if not exists public.feature_relations (
  id           uuid primary key default gen_random_uuid(),
  from_request uuid not null references public.feature_requests (id) on delete cascade,
  to_request   uuid not null references public.feature_requests (id) on delete cascade,
  kind         text not null check (kind in ('blocks', 'duplicates', 'relates')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint feature_relations_distinct check (from_request <> to_request),
  unique (from_request, to_request, kind)
);
create index if not exists feature_relations_from_idx on public.feature_relations (from_request);
create index if not exists feature_relations_to_idx on public.feature_relations (to_request);

alter table public.feature_relations enable row level security;

drop policy if exists "feature_relations_select" on public.feature_relations;
create policy "feature_relations_select" on public.feature_relations
  for select to authenticated using (true);

-- Anyone signed in may add a link (they must stamp themselves as created_by).
drop policy if exists "feature_relations_insert" on public.feature_relations;
create policy "feature_relations_insert" on public.feature_relations
  for insert to authenticated with check (auth.uid() = created_by);

-- Anyone signed in may remove a link, for now. Tighten here when roles arrive.
drop policy if exists "feature_relations_delete" on public.feature_relations;
create policy "feature_relations_delete" on public.feature_relations
  for delete to authenticated using (auth.uid() is not null);

-- Append-only audit of links created/removed, so history survives a hard delete
-- of the join row (see the capture-history guidance). A null title on delete
-- means the parent request is already gone => a cascade from a request deletion,
-- which we skip (the deletion itself is already logged on feature_requests).
create or replace function public.log_feature_relation_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_from_title text; v_from_kind text; v_to_title text;
begin
  if tg_op = 'INSERT' then
    select title, kind into v_from_title, v_from_kind
      from public.feature_requests where id = new.from_request;
    select title into v_to_title from public.feature_requests where id = new.to_request;
    insert into public.feature_request_events
      (request_id, request_title, actor_id, type, kind, detail)
    values (new.from_request, v_from_title, new.created_by, 'relation_added', v_from_kind,
            jsonb_build_object('relation_kind', new.kind, 'from_request', new.from_request,
                               'to_request', new.to_request, 'to_title', v_to_title));
    return new;
  else -- DELETE
    select title, kind into v_from_title, v_from_kind
      from public.feature_requests where id = old.from_request;
    if v_from_title is not null then
      insert into public.feature_request_events
        (request_id, request_title, actor_id, type, kind, detail)
      values (old.from_request, v_from_title, auth.uid(), 'relation_removed', v_from_kind,
              jsonb_build_object('relation_kind', old.kind, 'from_request', old.from_request,
                                 'to_request', old.to_request));
    end if;
    return old;
  end if;
end;
$$;

drop trigger if exists feature_relations_log_event on public.feature_relations;
create trigger feature_relations_log_event
  after insert or delete on public.feature_relations
  for each row execute function public.log_feature_relation_event();

-- ---------------------------------------------------------------------------
-- "Issues" naming layer. The board carries BOTH bug reports and feature
-- requests, so "feature" is a misnomer. These updatable views expose the same
-- rows under issue_* names — the vocabulary the client now uses — WITHOUT
-- physically renaming the base tables: zero downtime (the legacy feature_*
-- names keep working for any in-flight client) and fully reversible (drop a
-- view and nothing else changes; no data moves).
--
-- security_invoker = true is REQUIRED: it makes the base tables' RLS apply as
-- the querying user (without it the view would run as its owner and bypass RLS,
-- exposing every row). Writes pass straight through to the base table, firing
-- its triggers, with the same per-row policies. Simple select-* views are
-- auto-updatable, so insert/update/delete work through them too.
-- ---------------------------------------------------------------------------
create or replace view public.issues with (security_invoker = true) as
  select * from public.feature_requests;
create or replace view public.issue_votes with (security_invoker = true) as
  select * from public.feature_votes;
create or replace view public.issue_comments with (security_invoker = true) as
  select * from public.feature_comments;
create or replace view public.issue_attachments with (security_invoker = true) as
  select * from public.feature_attachments;
create or replace view public.issue_events with (security_invoker = true) as
  select * from public.feature_request_events;
create or replace view public.issue_relations with (security_invoker = true) as
  select * from public.feature_relations;

-- DML on the views for signed-in users; the base-table RLS (via security_invoker)
-- still governs which rows. issue_events stays read-only like its base table
-- (writes there come only from the triggers above).
grant select, insert, update, delete on public.issues            to authenticated;
grant select, insert, update, delete on public.issue_votes       to authenticated;
grant select, insert, update, delete on public.issue_comments    to authenticated;
grant select, insert, update, delete on public.issue_attachments to authenticated;
grant select, insert, delete on public.issue_relations to authenticated;
grant select on public.issue_events to authenticated;

-- ---------------------------------------------------------------------------
-- Governance audit (audit/event logging — Phase C). One append-only,
-- timestamped trail of admin actions and configuration/profile changes, so a
-- mis-set economy can be explained and reversed, users can be retroactively
-- compensated, and there is accountability for changes to someone's account.
-- Captured by triggers (never the client). One row per CHANGED field with the
-- old→new value, so "we changed the buy price on date X from A to B" is exact.
--
-- Read by the affected user (their own profile history) or any admin; global
-- config rows (target_user null) are admin-only. Badge grants/revokes are NOT
-- duplicated here — user_badges already records granted_by/granted_at/revoked_at.
-- Coin changes are NOT duplicated — coin_events already logs admin_adjust.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null, -- who made the change
  target_user uuid references auth.users (id) on delete set null, -- whose data changed (null = global config)
  entity      text not null,        -- 'app_config' | 'profile' | 'user_slot'
  entity_id   text,                  -- affected row id as text ('1' for config, a uuid otherwise)
  action      text not null,        -- 'update' | 'grant' | 'revoke' | 'delete'
  field       text,                  -- changed column for an 'update'; null otherwise
  old_value   jsonb,
  new_value   jsonb,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_events_actor_idx
  on public.audit_events (actor_id, created_at desc, id desc);
create index if not exists audit_events_target_idx
  on public.audit_events (target_user, created_at desc, id desc);
create index if not exists audit_events_entity_idx
  on public.audit_events (entity, created_at desc);

alter table public.audit_events enable row level security;
revoke insert, update, delete on public.audit_events from authenticated, anon;

drop policy if exists "audit_events_select" on public.audit_events;
create policy "audit_events_select" on public.audit_events
  for select to authenticated using (
    auth.uid() = target_user
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- app_config: one row per changed lever (economy formulas, charter prices,
-- refunds, maintenance, …) with the old and new value. to_jsonb(row) keys by
-- column name, so we just diff the watched keys.
create or replace function public.log_app_config_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_key text;
  v_cols text[] := array[
    'maintenance', 'message', 'shelve_refund_pct', 'replay_bonus_pct',
    'submission_reward', 'default_coin', 'charter_cost', 'charter_resale_pct',
    'onboarding_vouchers', 'default_general_slots', 'price_formula', 'bounty_formula'
  ];
begin
  foreach v_key in array v_cols loop
    if v_new -> v_key is distinct from v_old -> v_key then
      insert into public.audit_events
        (actor_id, entity, entity_id, action, field, old_value, new_value)
      values (auth.uid(), 'app_config', '1', 'update', v_key, v_old -> v_key, v_new -> v_key);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists app_config_log_event on public.app_config;
create trigger app_config_log_event
  after update on public.app_config
  for each row execute function public.log_app_config_event();

-- profiles: meaningful field changes (name/theme/avatar/platforms/privacy and the
-- admin-managed flags). Coins/charters are excluded (coin_events covers them) and
-- last_seen_at/activity are excluded entirely — the `update of` column list keeps
-- presence pings from firing this trigger at all.
create or replace function public.log_profile_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_key text;
  v_cols text[] := array[
    'display_name', 'avatar_url', 'theme', 'platforms', 'custom_platforms',
    'hidden_market', 'privacy', 'is_admin', 'blocked', 'blocked_reason',
    'hidden', 'general_slots', 'selected_badge_id'
  ];
begin
  foreach v_key in array v_cols loop
    if v_new -> v_key is distinct from v_old -> v_key then
      insert into public.audit_events
        (actor_id, target_user, entity, entity_id, action, field, old_value, new_value)
      values (auth.uid(), new.id, 'profile', new.id::text, 'update', v_key, v_old -> v_key, v_new -> v_key);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_log_event on public.profiles;
create trigger profiles_log_event
  after update of
    display_name, avatar_url, theme, platforms, custom_platforms, hidden_market,
    privacy, is_admin, blocked, blocked_reason, hidden, general_slots, selected_badge_id
  on public.profiles
  for each row execute function public.log_profile_event();

-- Account deletion: keep a tombstone (the display name + id) so a removal is
-- traceable after the row — and all the user's data — cascades away.
create or replace function public.log_profile_delete_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.audit_events
    (actor_id, target_user, entity, entity_id, action, detail)
  values (auth.uid(), null, 'profile', old.id::text, 'delete',
          jsonb_build_object('display_name', old.display_name, 'user_id', old.id));
  return old;
end;
$$;

drop trigger if exists profiles_log_delete on public.profiles;
create trigger profiles_log_delete
  before delete on public.profiles
  for each row execute function public.log_profile_delete_event();

-- Targeted Now Playing slot grants/revokes (admin-managed). entity_id is null on
-- a revoke (the row is gone); the slot + definition are kept in detail.
create or replace function public.log_user_slot_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events
      (actor_id, target_user, entity, entity_id, action, detail)
    values (auth.uid(), new.user_id, 'user_slot', new.id::text, 'grant',
            jsonb_build_object('definition_id', new.definition_id));
    return new;
  else -- DELETE
    insert into public.audit_events
      (actor_id, target_user, entity, entity_id, action, detail)
    values (auth.uid(), old.user_id, 'user_slot', null, 'revoke',
            jsonb_build_object('definition_id', old.definition_id, 'slot_id', old.id));
    return old;
  end if;
end;
$$;

drop trigger if exists user_slots_log_event on public.user_slots;
create trigger user_slots_log_event
  after insert or delete on public.user_slots
  for each row execute function public.log_user_slot_event();

-- ---------------------------------------------------------------------------
-- Active days (audit/event logging — streaks & retention). last_seen_at is a
-- single overwritten timestamp, so there's no record of WHICH days a user showed
-- up. This one-row-per-user-per-day table is filled by the presence ping (cheap
-- no-op after the first ping each day) and unlocks visit streaks, "active N days
-- this month", DAU/MAU, and comeback detection. Day is the UTC date; a future
-- streak feature can localize. Read-own + admin; trigger-written only.
-- ---------------------------------------------------------------------------
create table if not exists public.user_active_days (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(), -- first ping of that day
  primary key (user_id, day)
);
create index if not exists user_active_days_day_idx on public.user_active_days (day);

alter table public.user_active_days enable row level security;
revoke insert, update, delete on public.user_active_days from authenticated, anon;

drop policy if exists "user_active_days_select" on public.user_active_days;
create policy "user_active_days_select" on public.user_active_days
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function public.log_active_day()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Going-offline sets last_seen_at to null; only a real ping marks the day.
  if new.last_seen_at is not null then
    insert into public.user_active_days (user_id, day)
    values (new.id, (new.last_seen_at at time zone 'UTC')::date)
    on conflict (user_id, day) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_log_active_day on public.profiles;
create trigger profiles_log_active_day
  after update of last_seen_at on public.profiles
  for each row execute function public.log_active_day();

-- ---------------------------------------------------------------------------
-- Copy / spend history (audit/event logging — real-money analytics). game.copies
-- (platform + USD cost per copy you own) is edited in place as a jsonb blob, so
-- acquisitions, removals and re-pricing leave no trail. This logs each change by
-- diffing the array on its id, so "$ spent this year", platform mix, and
-- cost-per-finish become queryable. Read-own + admin; trigger-written only.
-- ---------------------------------------------------------------------------
create table if not exists public.copy_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  game_id    uuid references public.games (id) on delete set null,
  game_title text,
  action     text not null check (action in ('add', 'remove', 'update')),
  platform   text,
  cost       numeric,                 -- USD cost recorded on the copy (null = none)
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists copy_events_user_idx on public.copy_events (user_id, created_at desc, id desc);
create index if not exists copy_events_game_idx on public.copy_events (game_id);

alter table public.copy_events enable row level security;
revoke insert, update, delete on public.copy_events from authenticated, anon;

drop policy if exists "copy_events_select" on public.copy_events;
create policy "copy_events_select" on public.copy_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function public.log_copy_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_new   jsonb := coalesce(new.copies, '[]'::jsonb);
  v_old   jsonb := case when tg_op = 'INSERT' then '[]'::jsonb else coalesce(old.copies, '[]'::jsonb) end;
  v_copy  jsonb;
  v_match jsonb;
begin
  -- Added or re-priced copies (present in NEW, matched to OLD by id).
  for v_copy in select value from jsonb_array_elements(v_new) loop
    select value into v_match from jsonb_array_elements(v_old)
      where value ->> 'id' = v_copy ->> 'id' limit 1;
    if v_match is null then
      insert into public.copy_events (user_id, game_id, game_title, action, platform, cost, detail)
      values (new.user_id, new.id, new.title, 'add', v_copy ->> 'platform',
              nullif(v_copy ->> 'cost', '')::numeric, v_copy);
    elsif (v_match ->> 'cost') is distinct from (v_copy ->> 'cost')
       or (v_match ->> 'platform') is distinct from (v_copy ->> 'platform') then
      insert into public.copy_events (user_id, game_id, game_title, action, platform, cost, detail)
      values (new.user_id, new.id, new.title, 'update', v_copy ->> 'platform',
              nullif(v_copy ->> 'cost', '')::numeric,
              jsonb_build_object('before', v_match, 'after', v_copy));
    end if;
    v_match := null;
  end loop;
  -- Removed copies (present in OLD, gone from NEW).
  for v_copy in select value from jsonb_array_elements(v_old) loop
    if not exists (select 1 from jsonb_array_elements(v_new)
                   where value ->> 'id' = v_copy ->> 'id') then
      insert into public.copy_events (user_id, game_id, game_title, action, platform, cost, detail)
      values (new.user_id, new.id, new.title, 'remove', v_copy ->> 'platform',
              nullif(v_copy ->> 'cost', '')::numeric, v_copy);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists games_log_copies on public.games;
create trigger games_log_copies
  after insert or update of copies on public.games
  for each row execute function public.log_copy_event();

-- ---------------------------------------------------------------------------
-- Moderation trail (audit/event logging — extras). Completes the picture: who
-- edited or removed a comment (Phase B only logged a comment's creation), and
-- admin changes to the slot-definition catalog. Comment deletes that are really
-- a cascade from a request deletion are skipped (the parent is already gone).
-- ---------------------------------------------------------------------------
alter table public.feature_request_events drop constraint if exists feature_request_events_type_check;
alter table public.feature_request_events add constraint feature_request_events_type_check
  check (type in ('created', 'status', 'edited', 'deleted', 'vote', 'comment',
                  'reaction', 'comment_edited', 'comment_deleted',
                  'relation_added', 'relation_removed'));

create or replace function public.log_comment_moderation_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_title text; v_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.body is distinct from old.body then
      select title, kind into v_title, v_kind from public.feature_requests where id = new.request_id;
      insert into public.feature_request_events
        (request_id, request_title, actor_id, type, kind, detail)
      values (new.request_id, v_title, auth.uid(), 'comment_edited', v_kind,
              jsonb_build_object('comment_id', new.id, 'snippet', left(new.body, 500)));
    end if;
    return new;
  else -- DELETE
    select title, kind into v_title, v_kind from public.feature_requests where id = old.request_id;
    -- A null title means the parent request is already gone => a cascade delete,
    -- not a direct/moderated comment removal, so skip it.
    if v_title is not null then
      insert into public.feature_request_events
        (request_id, request_title, actor_id, type, kind, detail)
      values (old.request_id, v_title, auth.uid(), 'comment_deleted', v_kind,
              jsonb_build_object('comment_id', old.id, 'author_id', old.user_id,
                                 'by_admin', auth.uid() is distinct from old.user_id,
                                 'snippet', left(old.body, 500)));
    end if;
    return old;
  end if;
end;
$$;

drop trigger if exists feature_comments_log_moderation on public.feature_comments;
create trigger feature_comments_log_moderation
  after update of body or delete on public.feature_comments
  for each row execute function public.log_comment_moderation_event();

-- Admin changes to the slot-definition catalog land in the governance audit.
create or replace function public.log_slot_definition_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (actor_id, entity, entity_id, action, new_value)
    values (auth.uid(), 'slot_definition', new.id::text, 'create', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_events (actor_id, entity, entity_id, action, old_value, new_value)
    values (auth.uid(), 'slot_definition', new.id::text, 'update', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_events (actor_id, entity, entity_id, action, old_value)
    values (auth.uid(), 'slot_definition', old.id::text, 'delete', to_jsonb(old));
    return old;
  end if;
end;
$$;

drop trigger if exists slot_definitions_log_event on public.slot_definitions;
create trigger slot_definitions_log_event
  after insert or update or delete on public.slot_definitions
  for each row execute function public.log_slot_definition_event();

-- ---------------------------------------------------------------------------
-- One-time backfill so "All-Time" stats reflect activity from BEFORE the event
-- logs existed. Purely additive (new rows only; nothing existing is touched) and
-- idempotent (each insert guards against its own prior run). Synthetic rows are
-- marked source='backfill'.
--
-- Lifecycle: only games that have no LIVE status events yet (i.e. untouched since
-- the status log went in) are seeded, so we never duplicate or contradict real
-- history. Timestamps are the games' own added_at/started_at/finished_at. The
-- original add status is unknown, so it's inferred (wishlist stays wishlist,
-- everything else is assumed to have started in the backlog).
-- ---------------------------------------------------------------------------
insert into public.game_status_events
  (user_id, game_id, game_title, from_status, to_status, genres, developers, platforms, game_hours, source, created_at)
select g.user_id, g.id, g.title, null,
       case when g.status = 'wishlist' then 'wishlist' else 'backlog' end,
       g.genres, g.developers, g.platforms, g.hours, 'backfill', g.added_at
from public.games g
where not exists (select 1 from public.game_status_events e where e.game_id = g.id and e.source = 'live')
  and not exists (select 1 from public.game_status_events e
                  where e.game_id = g.id and e.source = 'backfill' and e.from_status is null);

insert into public.game_status_events
  (user_id, game_id, game_title, from_status, to_status, genres, developers, platforms, game_hours, source, created_at)
select g.user_id, g.id, g.title, 'backlog', 'playing',
       g.genres, g.developers, g.platforms, g.hours, 'backfill', g.started_at
from public.games g
where g.started_at is not null
  and not exists (select 1 from public.game_status_events e where e.game_id = g.id and e.source = 'live')
  and not exists (select 1 from public.game_status_events e
                  where e.game_id = g.id and e.source = 'backfill' and e.to_status = 'playing');

insert into public.game_status_events
  (user_id, game_id, game_title, from_status, to_status, genres, developers, platforms, game_hours, source, created_at)
select g.user_id, g.id, g.title, 'playing', 'finished',
       g.genres, g.developers, g.platforms, g.hours, 'backfill', g.finished_at
from public.games g
where g.finished_at is not null
  and not exists (select 1 from public.game_status_events e where e.game_id = g.id and e.source = 'live')
  and not exists (select 1 from public.game_status_events e
                  where e.game_id = g.id and e.source = 'backfill' and e.to_status = 'finished');

-- Playtime baseline: the hours a game accumulated before the playtime log existed
-- = its current played_hours minus what's already been logged as events. One
-- flagged lump per game, dated at its finish/start/add, so All-Time hours are
-- complete while week/month windows can exclude source='backfill' (the lump has
-- no real per-session date). Skips games already fully accounted for by events.
insert into public.playtime_events
  (user_id, game_id, game_title, hours, played_after, genres, developers, game_hours, source, created_at)
select g.user_id, g.id, g.title,
       (g.played_hours - coalesce(e.logged, 0))::real,
       (g.played_hours - coalesce(e.logged, 0))::real,
       g.genres, g.developers, g.hours, 'backfill',
       coalesce(g.finished_at, g.started_at, g.added_at)
from public.games g
left join (
  select game_id, sum(hours) as logged from public.playtime_events group by game_id
) e on e.game_id = g.id
where g.played_hours > 0
  and (g.played_hours - coalesce(e.logged, 0)) > 0.0001
  and not exists (select 1 from public.playtime_events pe
                  where pe.game_id = g.id and pe.source = 'backfill');

-- ---------------------------------------------------------------------------
-- Admin Stats dashboard: a single user's analytics for a [from, to) window
-- (null from = All-Time). Security definer so it reads across users after
-- re-checking the caller is an admin — and so the aggregation runs server-side,
-- immune to the PostgREST row cap that a client-side roll-up would hit. Returns
-- one row.
--
-- Windowing rules (see the data-capture design): coin_events are exact (no
-- source flag). game_status_events backfill carries REAL timestamps, so it's
-- counted in every window. The playtime backfill is a single dateless lump, so
-- it's included ONLY for All-Time (p_from is null) and excluded from bounded
-- windows.
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_stats(
  p_user uuid, p_from timestamptz, p_to timestamptz
)
returns table (
  coins_earned   bigint,
  coins_spent    bigint,
  sunk_cost      bigint,
  hours_played   real,
  games_added    bigint,
  games_finished bigint,
  games_shelved  bigint,
  top_game       text,
  top_genre      text,
  top_platform   text
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('stats.view') then
    raise exception 'Not authorized';
  end if;

  return query
  select
    coalesce((select sum(c.coin_delta) filter (where c.coin_delta > 0)
              from public.coin_events c
              where c.user_id = p_user
                and (p_from is null or c.created_at >= p_from)
                and (p_to is null or c.created_at < p_to)), 0)::bigint,
    coalesce((select -sum(c.coin_delta) filter (where c.coin_delta < 0)
              from public.coin_events c
              where c.user_id = p_user
                and (p_from is null or c.created_at >= p_from)
                and (p_to is null or c.created_at < p_to)), 0)::bigint,
    coalesce((select sum((c.detail ->> 'forfeit')::int)
              from public.coin_events c
              where c.user_id = p_user and c.kind = 'shelve_refund'
                and (p_from is null or c.created_at >= p_from)
                and (p_to is null or c.created_at < p_to)), 0)::bigint,
    coalesce((select sum(p.hours)
              from public.playtime_events p
              where p.user_id = p_user and (p.source = 'live' or p_from is null)
                and (p_from is null or p.created_at >= p_from)
                and (p_to is null or p.created_at < p_to)), 0)::real,
    (select count(*) from public.game_status_events g
      where g.user_id = p_user and g.from_status is null
        and (p_from is null or g.created_at >= p_from)
        and (p_to is null or g.created_at < p_to)),
    (select count(*) from public.game_status_events g
      where g.user_id = p_user and g.to_status = 'finished'
        and (p_from is null or g.created_at >= p_from)
        and (p_to is null or g.created_at < p_to)),
    (select count(*) from public.game_status_events g
      where g.user_id = p_user and g.from_status = 'playing' and g.to_status = 'backlog'
        and (p_from is null or g.created_at >= p_from)
        and (p_to is null or g.created_at < p_to)),
    (select p.game_title from public.playtime_events p
      where p.user_id = p_user and (p.source = 'live' or p_from is null) and p.game_title is not null
        and (p_from is null or p.created_at >= p_from)
        and (p_to is null or p.created_at < p_to)
      group by p.game_title order by sum(p.hours) desc nulls last limit 1),
    (select x.genre from (
       select jsonb_array_elements_text(p.genres) as genre, p.hours
       from public.playtime_events p
       where p.user_id = p_user and (p.source = 'live' or p_from is null) and p.genres is not null
         and (p_from is null or p.created_at >= p_from)
         and (p_to is null or p.created_at < p_to)
     ) x group by x.genre order by sum(x.hours) desc nulls last limit 1),
    (select p.platform from public.playtime_events p
      where p.user_id = p_user and (p.source = 'live' or p_from is null) and p.platform is not null
        and (p_from is null or p.created_at >= p_from)
        and (p_to is null or p.created_at < p_to)
      group by p.platform order by sum(p.hours) desc nulls last limit 1);
end;
$$;

-- Supabase grants EXECUTE directly to the `anon` role by default, so revoking
-- from PUBLIC alone is not enough — revoke from `anon` too so these require login.
revoke execute on function public.apply_purchase(uuid, integer, uuid, boolean) from public, anon;
revoke execute on function public.apply_voucher_redemption(uuid, uuid, boolean) from public, anon;
revoke execute on function public.pick_start_slot(uuid, uuid, boolean)  from public, anon;
revoke execute on function public.apply_replay(uuid, uuid)              from public, anon;
revoke execute on function public.abort_replay(uuid)                    from public, anon;
revoke execute on function public.complete_onboarding()                 from public, anon;
revoke execute on function public.admin_reset_onboarding(uuid)          from public, anon;
revoke execute on function public.apply_finish(uuid, integer, integer)  from public, anon;
revoke execute on function public.apply_shelve(uuid)            from public, anon;
revoke execute on function public.move_game_to_slot(uuid, uuid) from public, anon;
revoke execute on function public.link_games(uuid, uuid)        from public, anon;
revoke execute on function public.unlink_game(uuid)             from public, anon;
revoke execute on function public.log_playtime(uuid, real, text, text) from public, anon;
revoke execute on function public.set_platform_playtime(uuid, text, text, real) from public, anon;
revoke execute on function public.leaderboard()                 from public, anon;
revoke execute on function public.player_library(uuid)          from public, anon;
revoke execute on function public.view_profile(uuid)            from public, anon;
revoke execute on function public.admin_set_coins(integer)      from public, anon;
revoke execute on function public.admin_list_users()            from public, anon;
revoke execute on function public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean, integer) from public, anon;
revoke execute on function public.admin_delete_user(uuid)       from public, anon;
revoke execute on function public.admin_user_stats(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.list_feature_requests()       from public, anon;
revoke execute on function public.edit_feature_request(uuid, text, text, text, text[], text, text) from public, anon;
revoke execute on function public.respond_feature_request(uuid, boolean) from public, anon;
revoke execute on function public.list_request_comments(uuid)   from public, anon;
revoke execute on function public.admin_grant_badge(uuid, uuid)  from public, anon;
revoke execute on function public.admin_revoke_badge(uuid, uuid) from public, anon;
revoke execute on function public.set_selected_title(uuid)       from public, anon;
revoke execute on function public.approve_game_submission(uuid, text, text[]) from public, anon;
revoke execute on function public.reject_game_submission(uuid, text)  from public, anon;
revoke execute on function public.list_game_submissions()       from public, anon;
revoke execute on function public.pending_submission_count()    from public, anon;
revoke execute on function public.list_community_catalog()      from public, anon;
revoke execute on function public.admin_edit_catalog_game(uuid, text, text, jsonb, jsonb, jsonb, date, real, jsonb) from public, anon;
revoke execute on function public.admin_delete_catalog_game(uuid) from public, anon;
revoke execute on function public.ledger_totals()               from public, anon;
revoke execute on function public.buy_charter()                 from public, anon;
revoke execute on function public.sell_charter()                from public, anon;
revoke execute on function public.import_with_charter(uuid)     from public, anon;

grant execute on function public.apply_purchase(uuid, integer, uuid, boolean) to authenticated;
grant execute on function public.apply_voucher_redemption(uuid, uuid, boolean) to authenticated;
grant execute on function public.apply_replay(uuid, uuid)              to authenticated;
grant execute on function public.abort_replay(uuid)                    to authenticated;
grant execute on function public.complete_onboarding()                 to authenticated;
grant execute on function public.admin_reset_onboarding(uuid)          to authenticated;
grant execute on function public.apply_finish(uuid, integer, integer)  to authenticated;
grant execute on function public.apply_shelve(uuid)            to authenticated;
grant execute on function public.move_game_to_slot(uuid, uuid) to authenticated;
grant execute on function public.link_games(uuid, uuid)        to authenticated;
grant execute on function public.unlink_game(uuid)             to authenticated;
grant execute on function public.log_playtime(uuid, real, text, text) to authenticated;
grant execute on function public.set_platform_playtime(uuid, text, text, real) to authenticated;
grant execute on function public.leaderboard()                 to authenticated;
grant execute on function public.player_library(uuid)          to authenticated;
grant execute on function public.view_profile(uuid)            to authenticated;
grant execute on function public.admin_set_coins(integer)      to authenticated;
grant execute on function public.admin_list_users()            to authenticated;
grant execute on function public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean, integer) to authenticated;
grant execute on function public.admin_delete_user(uuid)       to authenticated;
grant execute on function public.admin_user_stats(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.list_feature_requests()       to authenticated;
grant execute on function public.edit_feature_request(uuid, text, text, text, text[], text, text) to authenticated;
grant execute on function public.respond_feature_request(uuid, boolean) to authenticated;
grant execute on function public.list_request_comments(uuid)   to authenticated;
grant execute on function public.admin_grant_badge(uuid, uuid)  to authenticated;
grant execute on function public.admin_revoke_badge(uuid, uuid) to authenticated;
grant execute on function public.set_selected_title(uuid)       to authenticated;
grant execute on function public.approve_game_submission(uuid, text, text[]) to authenticated;
grant execute on function public.reject_game_submission(uuid, text)  to authenticated;
grant execute on function public.revert_game_submission(uuid)  to authenticated;
grant execute on function public.list_game_submissions()       to authenticated;
grant execute on function public.pending_submission_count()    to authenticated;
grant execute on function public.list_community_catalog()      to authenticated;
grant execute on function public.admin_edit_catalog_game(uuid, text, text, jsonb, jsonb, jsonb, date, real, jsonb) to authenticated;
grant execute on function public.admin_delete_catalog_game(uuid) to authenticated;
grant execute on function public.ledger_totals()               to authenticated;
grant execute on function public.buy_charter()                 to authenticated;
grant execute on function public.sell_charter()                to authenticated;
grant execute on function public.import_with_charter(uuid)     to authenticated;
