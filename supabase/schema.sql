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
-- Personal preference: when true, time-entry surfaces list each owned copy
-- (platform + format) individually; when false (the default) they aggregate by
-- platform. Purely a display/attribution choice — never affects coins or totals.
alter table public.profiles add column if not exists track_editions boolean not null default false;
-- Personal "Money Well Spent" target: the desired USD cost-per-hour a purchase
-- should reach before it counts as value-for-money (issue 6c60c213). Null (the
-- default) = feature off. Purely a display preference over the informational
-- copy costs — never touches the coin economy. Everything derived client-side.
alter table public.profiles add column if not exists target_cost_per_hour numeric;
alter table public.profiles drop constraint if exists profiles_target_cph_nonneg;
alter table public.profiles add constraint profiles_target_cph_nonneg
  check (target_cost_per_hour is null or target_cost_per_hour >= 0);
alter table public.profiles add column if not exists privacy jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists activity text;
-- Profile Hub customization (public identity page). All purely cosmetic/personal:
--  • about_me: free-text "About Me" bio, length-capped (see check below).
--  • banner_url: public URL of the uploaded wide banner image. Reuses the 'avatars'
--    storage bucket (path <uid>/banner.jpg), so no extra bucket/policies are needed.
--  • accent: the profile's accent color — a curated swatch id or a #rrggbb hex (see
--    src/lib/accent.ts). Colors the profile page's accent chrome and buttons.
--  • bg: the profile page's background color as a #rrggbb hex (null = the viewer's
--    theme applies untouched). Scoped like accent: the client derives the page's
--    full panel/ink palette from it (src/lib/profileColors.ts) so any pick stays
--    readable; it never restyles the app shell.
alter table public.profiles add column if not exists about_me text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists accent text;
alter table public.profiles add column if not exists bg text;
-- Bound the bio length at the DB too (idempotent add; safe — new column has no rows
-- that could violate it). Keep in sync with BIO_MAX in src/lib/accent.ts.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_about_me_len'
  ) then
    alter table public.profiles
      add constraint profiles_about_me_len check (char_length(about_me) <= 500);
  end if;
end $$;
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
-- When the starter vouchers were actually credited (null = not yet). Set by
-- claim_onboarding_vouchers() when the player enters the interactive Getting
-- Started checklist, or by complete_onboarding()'s compat grant (old clients /
-- skipping straight from the welcome card). The two grant paths are mutually
-- exclusive on this stamp, so no sequence of claim/complete can double-grant.
-- While the checklist is live, onboarding_vouchers_pending stays true until
-- complete_onboarding — pending = "tutorial phase unfinished", granted_at =
-- "past the welcome cards", and together they resume the checklist across
-- sessions with no other progress storage.
alter table public.profiles add column if not exists onboarding_vouchers_granted_at timestamptz;
alter table public.profiles drop constraint if exists profiles_general_slots_range;
alter table public.profiles add constraint profiles_general_slots_range
  check (general_slots between 0 and 99);
-- Rotation lane capacity: how many live-service / ongoing games this user can keep
-- in the Rotation lane at once (separate from general_slots; see games.in_rotation).
-- Default 2 for a symmetric 4×2 board (Focus/Replay/Completionist/Rotation each 2).
alter table public.profiles add column if not exists rotation_slots integer not null default 2;
alter table public.profiles drop constraint if exists profiles_rotation_slots_range;
alter table public.profiles add constraint profiles_rotation_slots_range
  check (rotation_slots between 0 and 99);
-- 4×2 symmetry: cap every existing player's Rotation lane at 2 (reduce-only — never
-- raises a smaller custom value; no game rows touched, an over-capacity game just
-- shows "over limit" until removed). Safe to re-run.
update public.profiles set rotation_slots = least(rotation_slots, 2) where rotation_slots > 2;

-- Now Playing lane capacities. Every playing game sits in exactly one lane, derived
-- by precedence from its flags (in_rotation → Rotation; else completionist →
-- Completionist; else resumed → Replay; else Focus). Each lane has its own per-user
-- capacity, all independent:
--   • general_slots      — Focus lane (games you're working to finish).
--   • replay_slots       — Replay lane (finished games you're replaying; games.resumed).
--   • completionist_slots— Completionist lane (games you're 100%-completing; games.completionist).
--   • rotation_slots     — Rotation lane (live-service / ongoing; games.in_rotation).
-- Defaults are seeded from app_config by handle_new_user. Additive + safe to re-run.
alter table public.profiles add column if not exists replay_slots integer not null default 2;
alter table public.profiles drop constraint if exists profiles_replay_slots_range;
alter table public.profiles add constraint profiles_replay_slots_range
  check (replay_slots between 0 and 99);
alter table public.profiles add column if not exists completionist_slots integer not null default 2;
alter table public.profiles drop constraint if exists profiles_completionist_slots_range;
alter table public.profiles add constraint profiles_completionist_slots_range
  check (completionist_slots between 0 and 99);

-- Users may edit only their display name, platforms + hidden-market list via the
-- API — never their coins or is_admin (those change through security-definer
-- functions or an admin).
revoke update on public.profiles from authenticated;
grant update (display_name, platforms, hidden_market, custom_platforms, avatar_url, theme, track_editions, target_cost_per_hour, privacy, last_seen_at, activity, about_me, banner_url, accent, bg) on public.profiles to authenticated;

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
-- Economy mode: a per-user switch that turns the coin economy off, making the
-- app a plain backlog tracker. While off: activation is free, finishing pays
-- no bounty, refunds/rewards don't move, and pure currency ops (charters,
-- vouchers, sponsoring) are refused — but every STATE change still works and
-- the balance/charters/vouchers freeze in place untouched. Escrow returns
-- (sponsorship refunds, charter-funded pre-order cancels, undo of an
-- on-period finish) still land: principal is never destroyed. Toggled only by
-- set_economy_enabled (defined near the file tail) — the column is deliberately
-- NOT in the client update grant above. Defined here, high in the file, because
-- the economy RPCs further down all consult the helper.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists economy_enabled boolean not null default true;

-- Internal guard helper (not client-callable): a missing profile reads as ON so
-- nothing in the default path changes behaviour.
create or replace function public.economy_enabled(p_user uuid)
returns boolean
language sql stable set search_path = public
as $$
  select coalesce((select economy_enabled from public.profiles where id = p_user), true);
$$;
revoke execute on function public.economy_enabled(uuid) from public, anon, authenticated;

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
    'taxonomy.manage',
    'users.view',
    'users.economy',
    'users.block',
    'users.delete',
    'users.notify',
    'users.onboarding',
    'badges.grant',
    'economy.edit',
    'shop.manage',
    'slots.manage',
    'site.maintenance',
    'issues.moderate',
    'reports.moderate',
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

-- has_permission for an ARBITRARY user (not the caller) — for soft-launch
-- filters that must only offer a feature to users who can also see it (first
-- used by the Co-op Pacts soft launch, now GA'd; kept for the next rollout).
-- Internal: only definer RPCs call it (execute revoked from clients below).
create or replace function public.user_has_permission(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select
    exists (select 1 from public.profiles u where u.id = p_user and u.is_admin)
    or exists (
      select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
       where ur.user_id = p_user
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
revoke all on function public.user_has_permission(uuid, text) from public, anon, authenticated;
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
   array['submissions.games.moderate', 'submissions.compilations.moderate', 'catalog.manage', 'taxonomy.manage', 'issues.moderate', 'reports.moderate'],
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
-- Player review ("Leave a Review"): one long-form write-up per game, distinct
-- from the progress note, plus a star score in HALF-STAR UNITS (1–10 = 0.5–5
-- stars; see src/lib/reviews.ts). Text and score are independent — either may
-- be null. Rides the games row, so visitors see it via player_library and a
-- private game keeps its review private. History is captured append-only in
-- review_events (trigger below, near the other event tables).
alter table public.games add column if not exists review text;
alter table public.games add column if not exists review_score smallint;
alter table public.games add column if not exists reviewed_at timestamptz;
alter table public.games drop constraint if exists games_review_score_range;
alter table public.games add constraint games_review_score_range
  check (review_score is null or review_score between 1 and 10);
-- Length-capped like about_me (keep in sync with REVIEW_MAX in src/lib/reviews.ts).
alter table public.games drop constraint if exists games_review_len;
alter table public.games add constraint games_review_len
  check (review is null or char_length(review) <= 8000);
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

-- started_economy_off: this run was activated for FREE while the owner had the
-- coin economy disabled (see economy_enabled above). apply_finish pays ZERO for
-- a run carrying the marker — even after the owner toggles the economy back on —
-- closing the off→free-activate→on→finish farming loop. Server-derived: the
-- BEFORE trigger below stamps it on fee-bearing activations (backlog → playing
-- outside the free-for-everyone Rotation entry) and SHEDS any client-written
-- value, mirroring the preorder_charter provenance pattern — no GUC needed
-- because the value is fully derivable from the transition + the owner's flag.
alter table public.games add column if not exists started_economy_off boolean not null default false;

create or replace function public.games_stamp_econ_start()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.started_economy_off := false;
  elsif new.status = 'playing' and old.status = 'backlog' then
    -- The fee-bearing activation path. Rotation entry is exempt (free for
    -- everyone, so ON/OFF parity holds without a marker). A re-buy while ON
    -- pays a real fee, so a stale marker from an earlier off-run clears here.
    new.started_economy_off :=
      not coalesce(new.in_rotation, false)
      and not public.economy_enabled(new.user_id);
  else
    -- Every other write — including finished → playing pull-backs (replay /
    -- completionist) and undo_action restoring a finish — carries the old
    -- marker forward, so an undo can never launder a free-started run into a
    -- paying one, and any client-written value is shed.
    new.started_economy_off := coalesce(old.started_economy_off, false);
  end if;
  return new;
end;
$$;
revoke execute on function public.games_stamp_econ_start() from public, anon, authenticated;

drop trigger if exists games_stamp_econ_start on public.games;
create trigger games_stamp_econ_start
  before insert or update of status, started_economy_off on public.games
  for each row execute function public.games_stamp_econ_start();

-- private: hide this game from visitors to your Bazaar. Owner-only state — it
-- never affects the economy, your own boards, or your stats; it only filters the
-- game out of another player's view (see player_library) and the cross-profile
-- search. Additive + safe to re-run (existing games default to visible).
alter table public.games add column if not exists private boolean not null default false;

-- resumed: true while a FINISHED game has been pulled back into play for free —
-- via a Replay slot or by resuming it into an Endless slot. It marks the game as
-- a replay so re-finishing pays the smaller Replay Bonus (never the full bounty
-- again), independent of which slot kind holds it. Cleared on finish/abort.
-- Additive + safe to re-run.
alter table public.games add column if not exists resumed boolean not null default false;

-- Rotation lane membership: true while this game sits in the Rotation lane (a
-- single multi-occupant lane for live-service / ongoing games, capacity on
-- profiles.rotation_slots). A rotation game is status='playing' with slot_id null
-- (it occupies no focus slot) and never counts against general/targeted capacity.
-- Cleared when it leaves the lane (back to its parked backlog state).
alter table public.games add column if not exists in_rotation boolean not null default false;

-- ongoing: this game is a live-service / ongoing title — exempt from the coin
-- economy entirely (no buy price, no finish bounty, never "finished"). Its only
-- lifecycle is parked (status='backlog') ⇄ in the Rotation lane (status='playing',
-- in_rotation). Seeded from catalog_games.is_live_service at add time; the player
-- can override per game. Additive: existing rows default false.
alter table public.games add column if not exists ongoing boolean not null default false;

-- Rotation provenance, stamped by enter_rotation / convert_to_endless so leaving
-- the lane can return the game where it came from ("Remove from Rotation" is
-- origin-aware) and restore its pre-lane archetype:
--   rotation_origin       — the status held on entry ('backlog'/'playing'/'finished').
--   pre_rotation_ongoing  — whether it was ongoing BEFORE entering; retire_rotation
--                           restores it, so a standard finished game converted into
--                           the lane sheds the inherited live-service traits (weekly
--                           check-in) on exit, while a native live-service game
--                           stays ongoing. Both are per-user game rows — the global
--                           catalog classification is never touched.
-- Only meaningful while in_rotation; left in place after exit (overwritten on the
-- next entry). Additive: legacy in-lane rows have null origin, which the client
-- treats as bazaar-origin (today's behavior).
alter table public.games add column if not exists rotation_origin text;
alter table public.games drop constraint if exists games_rotation_origin_check;
alter table public.games add constraint games_rotation_origin_check
  check (rotation_origin is null or rotation_origin in ('backlog', 'playing', 'finished'));
alter table public.games add column if not exists pre_rotation_ongoing boolean;

-- completionist: true while this game sits in the Completionist lane — a playing
-- game you're working to 100%-complete (capacity on profiles.completionist_slots).
-- Mutually exclusive with in_rotation (see the lane precedence on profiles). A
-- completionist game can be entered from any status (bought into the lane, flipped
-- from another lane, or pulled back from finished with resumed=true). Completing it
-- pays the Completion Bonus (see apply_finish). Cleared on finish or when it leaves
-- the lane. Additive + safe to re-run.
alter table public.games add column if not exists completionist boolean not null default false;

-- co_op: true while this game sits in the Co-op Pacts lane — a playing game
-- bound (or once bound) to a Co-op Pact. The lane is UNCAPPED like Rotation:
-- a pact partner going quiet must never block the player's other slots (the
-- lane's whole reason to exist). Set server-side by respond_co_op_pact — a
-- pact accept activates into this lane, and a pact forming on a plain Focus
-- game moves it here, freeing the Focus slot. Deliberately NOT cleared when
-- the pact ends (dissolve/complete): the game keeps its lane seat, reading as
-- solo, until it exits play — no surprise reshuffle into a possibly-full
-- Focus lane (user-approved). Cleared by the trigger below whenever the game
-- leaves 'playing' or enters a higher-precedence lane. Additive + re-runnable.
alter table public.games add column if not exists co_op boolean not null default false;

-- Keep the Co-op lane flag truthful, both directions, in one BEFORE trigger
-- (instead of edits to every status-writing RPC, so no path can leak a stale
-- flag or dodge the lane):
--   SET: a card entering play (a normal Bazaar buy) that a LIVE pact already
--     binds lands in the Co-op lane automatically — its picked slot is
--     released (a pact game never holds a Focus/targeted seat). Deliberate
--     Completionist/Rotation/Replay entries keep their lane (their economics
--     win; the pact just decorates them). A pacted card LEAVING one of those
--     lanes while still playing (stopping a 100% run, leaving Rotation)
--     returns to the Co-op lane, not Focus — the lane is the live pact's
--     home, and Focus may be full. Taking a targeted slot still wins (see
--     CLEAR), so the deliberate way out of the lane stays open.
--   CLEAR: leaving play (finish/shelve/retire), entering Rotation or
--     Completionist (higher-precedence lanes), or taking a targeted slot (a
--     Co-op game holds no slot; moving into one is the player's way OUT of
--     the lane) sheds the seat.
create or replace function public.games_sync_co_op()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'playing'
     and (tg_op = 'INSERT' or old.status <> 'playing' or new.slot_id is null)
     and not new.in_rotation and not new.completionist
     and not coalesce(new.resumed, false)
     and exists (
       select 1 from public.co_op_pacts cp
        where cp.status in ('pending', 'active')
          and new.id in (cp.inviter_game, cp.invitee_game)
     ) then
    new.co_op := true;
    new.slot_id := null;
    return new;
  end if;
  if new.status <> 'playing' or new.in_rotation or new.completionist
     or new.slot_id is not null then
    new.co_op := false;
  end if;
  return new;
end;
$$;
drop trigger if exists games_clear_co_op on public.games;
drop trigger if exists games_sync_co_op on public.games;
create trigger games_sync_co_op
  before insert or update of status, in_rotation, completionist, slot_id on public.games
  for each row execute function public.games_sync_co_op();

-- finish_tag: how a FINISHED game concluded, for the Finished board's status chip —
--   'beaten'    main campaign cleared (a Focus finish, or an abandoned 100% run)
--   'completed' 100% mastery (finished through the Completionist lane)
--   'endless'   an ongoing/live-service game retired from the Rotation lane
-- Auto-assigned by the concluding action; the owner can override it freely (RLS
-- games_modify_own). Null until a game first reaches Finished. A hybrid game (a
-- finished 'beaten'/'completed' game converted to Endless) KEEPS its narrative tag
-- when later retired — see retire_rotation's coalesce. Additive + safe to re-run.
alter table public.games add column if not exists finish_tag text;
alter table public.games drop constraint if exists games_finish_tag_check;
alter table public.games add constraint games_finish_tag_check
  check (finish_tag is null or finish_tag in ('beaten', 'completed', 'endless', 'retired'));

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
-- title share a family_id (a plain grouping uuid — not a foreign key). The
-- family renders as ONE unified, indivisible board card — the PRIMARY member's
-- record (see family_primary_game_id below): its board, box art and actions,
-- with the other members hidden from boards/ledger until the link is severed.
-- A family shares a single Now Playing slot and only pays a full completion
-- bonus on its FIRST clear. See src/lib/families.ts. null = unlinked.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists family_id uuid;
create index if not exists games_family_idx on public.games (user_id, family_id);
-- family_name: the editable display name for a family's Master Card. Denormalized
-- onto every member (like family_id), set on all members at once. null = use the
-- representative edition's own title.
alter table public.games add column if not exists family_name text;

-- Focused family card state (denormalized onto every member like family_name,
-- written atomically by the set_family_cover / set_family_split RPCs below):
-- family_image: custom uploaded cover for the family's focused board card (a
-- covers-bucket public URL, like compilations.parent_image). null = derive.
alter table public.games add column if not exists family_image text;
-- family_cover_game_id: the member edition whose LIVE cover the focused card
-- shows when no custom upload is set. on delete set null — deleting that
-- edition falls back to the representative member's cover automatically.
alter table public.games add column if not exists family_cover_game_id uuid
  references public.games (id) on delete set null;
-- family_split: true = render this family as separate per-edition cards (the
-- pre-focused-card behavior); false (default) = one focused family card on the
-- representative member's board. See src/lib/familyGrouping.ts.
-- RETIRED 2026-07-05 (unified family card): the UI no longer reads or writes
-- this flag — the unified card is indivisible and Sever Family Link is the
-- escape hatch. Column and RPC kept so existing data survives.
alter table public.games add column if not exists family_split boolean not null default false;

-- family_primary_game_id: the user-designated PRIMARY member — the edition the
-- unified family card renders (its board, box art, actions) and the record all
-- card-driven playtime/milestones/notes route to. Denormalized onto every
-- member like family_name, written atomically by link_games/set_family_primary.
-- null = no explicit choice yet (legacy families): the client falls back to the
-- representative member (most-active, see src/lib/families.ts) until one is
-- designated. on delete set null: deleting the primary edition falls back the
-- same way. Additive — no backfill; existing families keep the implicit primary
-- until their owner picks one.
alter table public.games add column if not exists family_primary_game_id uuid
  references public.games (id) on delete set null;

-- Family history (audit/event logging). One append-only, timestamped row per
-- family-level customization (cover chosen/uploaded/cleared, split/focused
-- toggles), written ONLY by the set_family_* RPCs — one row per action, not
-- per denormalized member row. family_id is a bare uuid (families are not a
-- table); family_name snapshots the display name at event time.
create table if not exists public.family_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  family_id   uuid not null,
  family_name text,
  event_type  text not null check (event_type in
                ('cover_uploaded', 'cover_member', 'cover_cleared', 'split', 'focused')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists family_events_user_idx
  on public.family_events (user_id, created_at desc, id desc);
create index if not exists family_events_family_idx
  on public.family_events (family_id);

-- Unified-family-card events (2026-07-05): membership changes and primary
-- designation join the audit — 'member_linked'/'member_unlinked' (one row per
-- link/unlink action), 'primary_changed' (detail carries from/to games, hours
-- moved and whether a live run transferred), 'severed' (one row for the whole
-- dissolution, member roster in detail). Widen the check additively.
alter table public.family_events drop constraint if exists family_events_event_type_check;
alter table public.family_events add constraint family_events_event_type_check
  check (event_type in
    ('cover_uploaded', 'cover_member', 'cover_cleared', 'split', 'focused',
     'member_linked', 'member_unlinked', 'primary_changed', 'severed'));

alter table public.family_events enable row level security;
revoke insert, update, delete on public.family_events from authenticated, anon;

drop policy if exists "family_events_select" on public.family_events;
create policy "family_events_select" on public.family_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---------------------------------------------------------------------------
-- Game prerequisites (story locking): a game may name ONE other game in the
-- same library that must be Finished before this one can be started (moved
-- into Now Playing). The lock is purely derived — nothing is stored on the
-- locked game beyond this pointer, and the cold-start RPCs re-check it via
-- assert_prerequisite_cleared below. on delete set null: deleting the
-- prerequisite auto-unlocks. Chains are allowed (C→B→A); cycles are rejected
-- by the validation trigger. See src/lib/prerequisites.ts.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists prerequisite_game_id uuid
  references public.games (id) on delete set null;
create index if not exists games_prereq_idx
  on public.games (user_id, prerequisite_game_id);

-- Validate a prerequisite write: the target must be the caller's own game, not
-- the game itself, and must not close a cycle (bounded walk — a chain longer
-- than 50 hops is treated as a cycle rather than looping forever).
create or replace function public.games_validate_prerequisite()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_cursor uuid;
  v_hops   integer := 0;
begin
  if new.prerequisite_game_id is null then return new; end if;
  if tg_op = 'UPDATE'
     and new.prerequisite_game_id is not distinct from old.prerequisite_game_id then
    return new;
  end if;
  if new.prerequisite_game_id = new.id then
    raise exception 'PREREQUISITE_CYCLE';
  end if;
  if not exists (select 1 from public.games g
                  where g.id = new.prerequisite_game_id
                    and g.user_id = new.user_id) then
    raise exception 'Prerequisite game not found';
  end if;
  v_cursor := new.prerequisite_game_id;
  while v_cursor is not null loop
    v_hops := v_hops + 1;
    if v_hops > 50 then raise exception 'PREREQUISITE_CYCLE'; end if;
    select prerequisite_game_id into v_cursor
      from public.games where id = v_cursor;
    if v_cursor = new.id then raise exception 'PREREQUISITE_CYCLE'; end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists games_validate_prerequisite on public.games;
create trigger games_validate_prerequisite
  before insert or update of prerequisite_game_id on public.games
  for each row execute function public.games_validate_prerequisite();

-- The cold-start gate, called by the cold-start RPCs (apply_purchase,
-- apply_voucher_redemption, enter_rotation from the backlog); finished-game
-- re-entries (replay/completionist/convert) are exempt by design. Raises:
--   'PREREQUISITE_LOCKED' — the game's prerequisite still exists in the
--     caller's library and is not yet Finished (a null / deleted → set-null
--     prerequisite never locks);
--   'PREORDER_LOCKED' — the game is a pre-order that hasn't released yet
--     (preordered_at set; see the Pre-orders section at the end of this
--     file): it can't be started until the release unlock clears the marker.
create or replace function public.assert_prerequisite_cleared(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status    text;
  v_preordered timestamptz;
begin
  select pre.status into v_status
    from public.games g
    join public.games pre on pre.id = g.prerequisite_game_id
   where g.id = p_game and g.user_id = auth.uid();
  if v_status is not null and v_status <> 'finished' then
    raise exception 'PREREQUISITE_LOCKED';
  end if;
  select g.preordered_at into v_preordered
    from public.games g
   where g.id = p_game and g.user_id = auth.uid();
  if v_preordered is not null then
    raise exception 'PREORDER_LOCKED';
  end if;
end;
$$;

-- Prerequisite history (audit/event logging). One append-only, timestamped row
-- per prerequisite change — set, cleared, or auto-cleared by the FK when the
-- prerequisite game is deleted. Title snapshots survive later deletions.
create table if not exists public.game_prerequisite_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  game_id            uuid references public.games (id) on delete set null,
  game_title         text,
  prerequisite_id    uuid,
  prerequisite_title text,
  created_at         timestamptz not null default now()
);
create index if not exists game_prerequisite_events_user_idx
  on public.game_prerequisite_events (user_id, created_at desc, id desc);
create index if not exists game_prerequisite_events_game_idx
  on public.game_prerequisite_events (game_id);

alter table public.game_prerequisite_events enable row level security;
revoke insert, update, delete on public.game_prerequisite_events from authenticated, anon;

drop policy if exists "game_prerequisite_events_select" on public.game_prerequisite_events;
create policy "game_prerequisite_events_select" on public.game_prerequisite_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function public.log_game_prerequisite_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.prerequisite_game_id is distinct from old.prerequisite_game_id
     -- Guard: the FK's set-null fires this trigger mid-cascade when an account
     -- is deleted — by then the auth.users row is gone and the insert would
     -- violate the user_id FK. Skip logging for a user being erased.
     and exists (select 1 from auth.users u where u.id = new.user_id) then
    insert into public.game_prerequisite_events
      (user_id, game_id, game_title, prerequisite_id, prerequisite_title)
    values (new.user_id, new.id, new.title, new.prerequisite_game_id,
            (select title from public.games where id = new.prerequisite_game_id));
  end if;
  return new;
end;
$$;

drop trigger if exists games_log_prerequisite on public.games;
create trigger games_log_prerequisite
  after update of prerequisite_game_id on public.games
  for each row execute function public.log_game_prerequisite_event();

-- ---------------------------------------------------------------------------
-- Game Milestones: a per-game, user-curated journey timeline — when a game was
-- added, started, beat, completed, retired, and unretired — with USER-EDITABLE,
-- date-only entries so history imported from memory can be backdated. Auto-
-- captured by the trigger below (added/started/beat/completed the FIRST time
-- each happens; retired/unretired on every cycle, count-paired); duplicates
-- (a second Beat for a replay) are added manually. "Retired" doubles as a
-- purely manual marker for e.g. a Bazaar game the owner never intends to play.
-- NOT an audit table: game_status_events remains the tamper-proof history;
-- these rows are display data the owner may freely edit, backdate, and delete.
-- Rows die with the game (cascade) — the immutable record of what happened
-- lives in game_status_events, including 'deleted'.
-- ---------------------------------------------------------------------------
create table if not exists public.game_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete cascade,
  kind        text not null check (kind in
                ('added', 'started', 'beat', 'completed', 'retired', 'unretired')),
  occurred_on date not null,
  source      text not null default 'manual' check (source in ('auto', 'backfill', 'manual')),
  created_at  timestamptz not null default now()
);
create index if not exists game_milestones_user_idx on public.game_milestones (user_id);
create index if not exists game_milestones_game_idx on public.game_milestones (game_id, occurred_on);

-- Owner CRUD under RLS (like games itself — no RPC needed; deliberately NO
-- (game_id, kind) uniqueness: manual duplicates are a feature). The with-check's
-- games subquery runs under the caller's own games_select_own policy, so rows
-- can only ever point at the caller's own games.
alter table public.game_milestones enable row level security;

drop policy if exists "game_milestones_select_own" on public.game_milestones;
create policy "game_milestones_select_own" on public.game_milestones
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "game_milestones_modify_own" on public.game_milestones;
create policy "game_milestones_modify_own" on public.game_milestones
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.games g where g.id = game_id and g.user_id = auth.uid())
  );

grant select, insert, update, delete on public.game_milestones to authenticated;

-- Auto-capture: writes milestones keyed on REAL status transitions only
-- (status is distinct from), so date-column noise (a replay clearing
-- finished_at) never logs. First-time-only for added/started/beat/completed.
-- Added is NOT written for a wishlist insert (a wishlisted game isn't in the
-- collection yet); it's captured instead when the game leaves the wishlist for
-- the Bazaar/Finished — that import is its real acquisition date.
-- retired/unretired log every cycle, guarded by count-pairing (a game is
-- "currently retired" while it has more retired rows than unretired ones).
-- Silent during undo restores (the app.undo_in_progress GUC undo_action sets —
-- undo_action also retracts the undone action's own auto rows) and while an
-- account-deletion cascade touches games rows (auth.users row already gone —
-- an insert would violate the user_id FK; same guard as log_game_status_event).
create or replace function public.capture_game_milestone()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_finish_kind text := case
    when new.finish_tag = 'completed' then 'completed'
    -- Both retirement flavours — an endless conclude and a salvaged drop — are
    -- the same 'retired' journey step.
    when new.finish_tag in ('endless', 'retired') then 'retired'
    else 'beat'
  end;
  v_retired   integer;
  v_unretired integer;
begin
  if coalesce(current_setting('app.undo_in_progress', true), '') = '1' then
    return new;
  end if;
  if not exists (select 1 from auth.users u where u.id = new.user_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A wishlist row is not "added" to the collection yet — it earns its Added
    -- milestone only when imported into the Bazaar/Finished (the status-change
    -- branch below). Only real acquisitions get the acquisition date that
    -- Fresh-pickup pricing reads.
    if new.status <> 'wishlist' then
      insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
      values (new.user_id, new.id, 'added', new.added_at::date, 'auto');
    end if;
    -- A game imported with history: record the state it arrived in too.
    if new.status = 'playing' then
      insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
      values (new.user_id, new.id, 'started', coalesce(new.started_at, now())::date, 'auto');
    elsif new.status = 'finished' then
      insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
      values (new.user_id, new.id, v_finish_kind, coalesce(new.finished_at, now())::date, 'auto');
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Imported from the wishlist into the collection: NOW it counts as "added"
    -- (a wishlist row got no Added milestone on insert). First time only; dated
    -- today, the real acquisition date the Fresh-pickup economy should read.
    if old.status = 'wishlist'
       and not exists (select 1 from public.game_milestones m
                        where m.game_id = new.id and m.kind = 'added') then
      insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
      values (new.user_id, new.id, 'added', current_date, 'auto');
    end if;
    if new.status = 'playing' then
      if not exists (select 1 from public.game_milestones m
                      where m.game_id = new.id and m.kind = 'started') then
        insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
        values (new.user_id, new.id, 'started', coalesce(new.started_at, now())::date, 'auto');
      end if;
      -- A currently-retired game coming back: an endless game re-entering the
      -- Rotation lane, or a manually-retired Bazaar game being started after all.
      select count(*) filter (where m.kind = 'retired'),
             count(*) filter (where m.kind = 'unretired')
        into v_retired, v_unretired
        from public.game_milestones m where m.game_id = new.id;
      if v_retired > v_unretired then
        insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
        values (new.user_id, new.id, 'unretired', current_date, 'auto');
      end if;
    elsif new.status = 'finished' then
      if v_finish_kind = 'retired' then
        -- Retirement (an endless conclude or a salvaged drop): log every retire
        -- cycle, but never double-log while already retired.
        select count(*) filter (where m.kind = 'retired'),
               count(*) filter (where m.kind = 'unretired')
          into v_retired, v_unretired
          from public.game_milestones m where m.game_id = new.id;
        if v_retired <= v_unretired then
          insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
          values (new.user_id, new.id, 'retired', coalesce(new.finished_at, now())::date, 'auto');
        end if;
      elsif not exists (select 1 from public.game_milestones m
                         where m.game_id = new.id and m.kind = v_finish_kind) then
        insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
        values (new.user_id, new.id, v_finish_kind, coalesce(new.finished_at, now())::date, 'auto');
      end if;
    elsif new.status = 'backlog' and old.status = 'finished' then
      -- A retired game returning to the Bazaar (un-retire): the retirement ends
      -- when it rejoins the active collection, not only when it's next started.
      -- Balance-guarded, so a normal finished game moving back logs nothing.
      select count(*) filter (where m.kind = 'retired'),
             count(*) filter (where m.kind = 'unretired')
        into v_retired, v_unretired
        from public.game_milestones m where m.game_id = new.id;
      if v_retired > v_unretired then
        insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
        values (new.user_id, new.id, 'unretired', current_date, 'auto');
      end if;
    end if;
  elsif new.status = 'finished'
    and new.finish_tag is distinct from old.finish_tag then
    -- Tag flips on the Finished shelf (setFinishTag) — status unchanged.
    if new.finish_tag = 'completed'
       and not exists (select 1 from public.game_milestones m
                        where m.game_id = new.id and m.kind = 'completed') then
      -- Upgraded Beaten → Completed.
      insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
      values (new.user_id, new.id, 'completed', current_date, 'auto');
    end if;
    -- Flips into/out of 'retired' are retire cycles too — balance-guarded like
    -- the status-move branches (a flip to Completed above may ALSO close an
    -- open retirement, so these are independent checks, not an elsif).
    select count(*) filter (where m.kind = 'retired'),
           count(*) filter (where m.kind = 'unretired')
      into v_retired, v_unretired
      from public.game_milestones m where m.game_id = new.id;
    if new.finish_tag = 'retired' and v_retired <= v_unretired then
      insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
      values (new.user_id, new.id, 'retired', current_date, 'auto');
    elsif old.finish_tag = 'retired' and new.finish_tag is distinct from 'retired'
      and v_retired > v_unretired then
      insert into public.game_milestones (user_id, game_id, kind, occurred_on, source)
      values (new.user_id, new.id, 'unretired', current_date, 'auto');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists games_capture_milestone on public.games;
create trigger games_capture_milestone
  after insert or update of status, finish_tag on public.games
  for each row execute function public.capture_game_milestone();

-- Fresh-pickup sync: the earliest Added milestone IS the game's acquisition
-- date. Whenever an Added row is inserted, redated, or deleted, mirror the
-- earliest remaining Added date into games.added_at — the column the economy's
-- Fresh-pickup factor and every "recently added" ordering read — so backdating
-- the milestone reprices the game everywhere. Two deliberate softenings:
--   * only write when the calendar DAY differs, so the auto row captured at
--     game insert (same day by definition) never truncates the precise
--     insertion timestamp that keeps same-day "Added (newest)" ordering stable;
--   * deleting the LAST Added milestone leaves added_at untouched (nothing
--     left to follow).
-- Silent during undo restores (GUC guard, matching capture_game_milestone) and
-- while an account-deletion cascade clears milestone rows (their games are
-- vanishing in the same transaction — no point updating dying rows).
create or replace function public.sync_added_at_from_milestones()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_game_id uuid;
  v_user_id uuid;
  v_min     date;
begin
  if coalesce(current_setting('app.undo_in_progress', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    if old.kind <> 'added' then return null; end if;
    v_game_id := old.game_id;
    v_user_id := old.user_id;
  else
    -- Fire when the row is an Added milestone now, or was one before an
    -- UPDATE reclassified it (the UI never changes kind, but stay correct).
    if new.kind <> 'added' and (tg_op = 'INSERT' or old.kind <> 'added') then
      return null;
    end if;
    v_game_id := new.game_id;
    v_user_id := new.user_id;
  end if;
  if not exists (select 1 from auth.users u where u.id = v_user_id) then
    return null;
  end if;
  select min(occurred_on) into v_min
    from public.game_milestones
   where game_id = v_game_id and kind = 'added';
  if v_min is not null then
    update public.games g
       set added_at = v_min::timestamptz
     where g.id = v_game_id
       and g.added_at::date is distinct from v_min;
  end if;
  return null;
end;
$$;

drop trigger if exists game_milestones_sync_added_at on public.game_milestones;
create trigger game_milestones_sync_added_at
  after insert or update or delete on public.game_milestones
  for each row execute function public.sync_added_at_from_milestones();

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

-- The owner's chosen display order for the bundle's child games, as an ordered
-- list of games.id (issue 140ac868). Null = no custom order (fall back to title
-- order). Additive; children not present in the array sort after those that are.
alter table public.compilations add column if not exists child_order uuid[];

-- A child game's link to its compilation (null = a normal standalone game).
-- on delete cascade so deleting the compilation removes its games in one step.
alter table public.games add column if not exists compilation_id uuid
  references public.compilations (id) on delete cascade;
-- Denormalized compilation title for the board badge (like family_name), set on
-- every child so the "Part of …" tag renders without a join.
alter table public.games add column if not exists compilation_name text;
create index if not exists games_compilation_idx on public.games (user_id, compilation_id);

-- Expandable/collapsible grouping (all additive; existing rows keep today's
-- always-expanded rendering):
-- expanded: false = the bundle renders as ONE collapsed rollup card on the board
-- (in the lane of its least-completed child) instead of individual child cards.
alter table public.compilations add column if not exists expanded boolean not null default true;
-- carryover_hours: play time that was logged on the single parent card BEFORE it
-- was expanded into a compilation. Kept at the bundle level (never re-attributed
-- to a child) and included in the collapsed card's time rollup.
alter table public.compilations add column if not exists carryover_hours real not null default 0;
-- parent_image: cover snapshot of the parent game card this compilation was
-- expanded from (preserves a custom cover for the collapsed card's art).
alter table public.compilations add column if not exists parent_image text;
-- (compilations.template_id is added next to compilation_templates below — that
-- table is created later in this file, so the FK can't exist yet on a fresh DB.)

-- Multi-copy compilations: the container records EVERY copy of the bundle you
-- own ({id, platform, format, cost} elements, like games.copies). Each copy's
-- cost is split across the children (one cost-bearing child copy per container
-- copy — the matrix is computed client-side and written by the RPCs below).
-- total_cost stays MAINTAINED (= sum of copy costs; events/rollups read it);
-- platform/format keep receiving copy[0]'s values for one release (rollback
-- safety). copies null = a legacy row not yet backfilled.
alter table public.compilations add column if not exists copies jsonb;
-- released: the bundle's release date, shown on its hub/rollup card and used to
-- FILL (never overwrite) the release date of children that have none of their
-- own — catalog-known children keep their original dates, so no game's coin
-- price shifts via the Newness factor.
alter table public.compilations add column if not exists released date;

-- Idempotent, data-preserving backfill: legacy single-copy rows become a one-
-- element copies array built from their scalars. Only rows with something to
-- preserve; re-runs no-op (copies is no longer null). Never touches games rows
-- (child copies are already correct).
update public.compilations
   set copies = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
     'id', gen_random_uuid()::text,
     'platform', nullif(btrim(coalesce(platform, '')), ''),
     'format',   nullif(btrim(coalesce(format, '')), ''),
     'cost',     case when coalesce(total_cost, 0) <> 0 then total_cost else null end
   )))
 where copies is null
   and (platform is not null or format is not null or coalesce(total_cost, 0) <> 0);

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
-- two-value constraint), plus the expand/collapse lifecycle: 'expanded_from_game'
-- (a single owned card converted into a compilation), 'collapsed' and 'expanded'
-- (the board-view toggle). Idempotent: drop + re-add the named constraint.
alter table public.compilation_events drop constraint if exists compilation_events_event_type_check;
alter table public.compilation_events add constraint compilation_events_event_type_check
  check (event_type in ('created', 'deleted', 'updated',
                        'expanded_from_game', 'collapsed', 'expanded', 'reordered'));
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
                  check (status in ('submitted', 'planned', 'in_progress', 'changes_requested', 'awaiting_feedback', 'on_hold', 'done', 'declined')),
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
-- sign off; 'changes_requested' = sent back to the requester for changes). The
-- 'on_hold' state (added later) parks an item for "maybe one day / awaiting more
-- detail" — not queued, but not rejected. Safe to re-run. Without a status in the
-- list, moving an item there — including the server's own respond_feature_request
-- non-approval path — violated the check constraint.
alter table public.feature_requests drop constraint if exists feature_requests_status_check;
alter table public.feature_requests add constraint feature_requests_status_check
  check (status in ('submitted', 'planned', 'in_progress', 'changes_requested', 'awaiting_feedback', 'on_hold', 'done', 'declined'));

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
-- Board content survives its author. The issues board is shared history:
-- deleting an account used to cascade-delete the user's reports, comments and
-- attachments — taking other players' replies, votes and thread context with
-- them. The authorship FKs become `on delete set null` so the rows persist
-- authorless (rendered as a former player in the UI); delete_my_account (below)
-- additionally blanks the departing user's comment bodies. Votes and reactions
-- still cascade — they're per-user toggles, not shared content. Idempotent:
-- drop-if-exists + re-add of the same constraint names; `drop not null` is a
-- no-op when already nullable. No existing rows are touched.
-- ---------------------------------------------------------------------------
alter table public.feature_requests alter column user_id drop not null;
alter table public.feature_requests drop constraint if exists feature_requests_user_id_fkey;
alter table public.feature_requests add constraint feature_requests_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

alter table public.feature_comments alter column user_id drop not null;
alter table public.feature_comments drop constraint if exists feature_comments_user_id_fkey;
alter table public.feature_comments add constraint feature_comments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

alter table public.feature_attachments alter column user_id drop not null;
alter table public.feature_attachments drop constraint if exists feature_attachments_user_id_fkey;
alter table public.feature_attachments add constraint feature_attachments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

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
-- Reporting — user/content abuse reports routed to the moderation queue. A
-- report is server-authoritative (written only by submit_report/resolve_report)
-- and the reporter is never exposed to the reported user (RLS gives the reported
-- user no read access; the front end never surfaces the reporter either). Defined
-- here (above player_library) per the schema-ordering rule; references games +
-- auth.users only. Additive + idempotent. See src/lib/reports.ts + the store.
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  -- reporter on delete set null: keep the report (for the audit trail) if the
  -- reporter later deletes their account.
  reporter      uuid references auth.users (id) on delete set null,
  reported_user uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('user', 'cover')),
  reason        text not null
                  check (reason in ('explicit', 'harassment', 'spam', 'inappropriate_name', 'other')),
  details       text,
  -- For a cover report: the flagged game + snapshots that survive a later strip
  -- or deletion (so the moderator can still see what was reported).
  game_id       uuid references public.games (id) on delete set null,
  game_title    text,
  image_url     text,
  status        text not null default 'open'
                  check (status in ('open', 'dismissed', 'actioned')),
  resolution    text check (resolution in ('dismissed', 'stripped', 'suspended')),
  reviewer      uuid references auth.users (id) on delete set null,
  reviewer_note text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_reported_idx on public.reports (reported_user);

-- Append-only audit of every report lifecycle event (per CLAUDE.md "capture
-- history"): the submission and each moderator action. Never updated or deleted.
create table if not exists public.report_events (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid references public.reports (id) on delete cascade,
  actor      uuid references auth.users (id) on delete set null,
  action     text not null
               check (action in ('submitted', 'dismissed', 'stripped', 'suspended')),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists report_events_report_idx on public.report_events (report_id, created_at);

alter table public.reports       enable row level security;
alter table public.report_events enable row level security;

-- No client write grants — every mutation is a definer RPC.
revoke insert, update, delete on public.reports       from authenticated, anon;
revoke insert, update, delete on public.report_events from authenticated, anon;

-- Reports: the reporter may read their own (status follow-up) and moderators may
-- read all. The REPORTED user is intentionally given no read access → anonymity.
drop policy if exists "reports_select" on public.reports;
create policy "reports_select" on public.reports
  for select to authenticated using (
    reporter = auth.uid()
    or public.has_permission('reports.moderate')
  );

-- Report events: moderators/admin only (the lifecycle trail isn't shown to users).
drop policy if exists "report_events_select" on public.report_events;
create policy "report_events_select" on public.report_events
  for select to authenticated using (public.has_permission('reports.moderate'));

-- ---------------------------------------------------------------------------
-- Social — friendships, the activity feed, and cheers. Defined here (above
-- link_games and the games activity trigger that reference activity_events) per
-- the schema-ordering rule. Every mutation is server-authoritative: clients hold
-- no insert/update/delete grants — all writes go through the security-definer
-- RPCs below, each gated on the `social.use` permission (soft-launch). Additive +
-- idempotent. See src/lib/social.ts + the store's social actions.
-- ---------------------------------------------------------------------------

-- The connection edge / request state. One row per directed request; an accepted
-- row is a symmetric friendship (queries union both directions). A reverse-pending
-- request is auto-accepted in send_friend_request rather than creating a 2nd row.
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester    uuid not null references auth.users (id) on delete cascade,
  addressee    uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester <> addressee)
);
-- One edge per ordered pair; the RPC additionally blocks the reverse duplicate.
create unique index if not exists friendships_pair_idx
  on public.friendships (requester, addressee);
create index if not exists friendships_addressee_idx on public.friendships (addressee, status);
create index if not exists friendships_requester_idx on public.friendships (requester, status);

-- Are two users confirmed (accepted) friends? Symmetric — the pair is unordered.
-- Security definer so callers (e.g. the cover gate in player_library, the reports
-- RPCs) can ask about any pair regardless of the friendships RLS. Reuses the
-- accepted-edge pattern inlined in send_message/cheer_activity.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester = a and f.addressee = b)
         or (f.requester = b and f.addressee = a))
  );
$$;

-- Append-only audit of every friendship lifecycle event (per CLAUDE.md "capture
-- history"). Never updated or deleted; a re-friend after a removal is a new row.
-- Both FKs `on delete set null` so the history survives either account's removal.
create table if not exists public.friend_events (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references auth.users (id) on delete set null,
  target     uuid references auth.users (id) on delete set null,
  action     text not null
               check (action in ('requested', 'accepted', 'declined', 'cancelled', 'removed')),
  created_at timestamptz not null default now()
);
create index if not exists friend_events_actor_idx on public.friend_events (actor, created_at desc);

-- The activity feed's source of truth: an append-only, timestamped record of a
-- player's broadcast-worthy milestones. Inserted only by the games activity
-- trigger + link_games (server-authoritative). game_id `on delete set null` with a
-- game_title snapshot so a post survives the game being deleted; actor cascades so
-- a deleted account's posts go with it. Privacy is applied at READ time (in
-- list_activity_feed), so toggling a flag later hides past events too.
create table if not exists public.activity_events (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid not null references auth.users (id) on delete cascade,
  kind       text not null
               check (kind in ('game_imported', 'family_created', 'bounty_claimed')),
  game_id    uuid references public.games (id) on delete set null,
  game_title text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_events_actor_idx
  on public.activity_events (actor, created_at desc, id desc);

-- Cheers (commendations) on a feed event — a reaction-style toggle. Written only
-- by the cheer/uncheer RPCs; the feed reader counts them via definer (bypassing
-- RLS), so no broad read policy is needed.
create table if not exists public.activity_cheers (
  event_id   uuid not null references public.activity_events (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists activity_cheers_event_idx on public.activity_cheers (event_id);

alter table public.friendships     enable row level security;
alter table public.friend_events   enable row level security;
alter table public.activity_events enable row level security;
alter table public.activity_cheers enable row level security;

-- No client write grants on any of these — every mutation is a definer RPC.
revoke insert, update, delete on public.friendships     from authenticated, anon;
revoke insert, update, delete on public.friend_events   from authenticated, anon;
revoke insert, update, delete on public.activity_events from authenticated, anon;
revoke insert, update, delete on public.activity_cheers from authenticated, anon;

-- Read policies: own rows only (the definer RPCs do the cross-user reads). Admins
-- may read all, mirroring the Phase A event tables.
drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select" on public.friendships
  for select to authenticated using (
    auth.uid() in (requester, addressee)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "friend_events_select" on public.friend_events;
create policy "friend_events_select" on public.friend_events
  for select to authenticated using (
    auth.uid() in (actor, target)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "activity_events_select" on public.activity_events;
create policy "activity_events_select" on public.activity_events
  for select to authenticated using (
    auth.uid() = actor
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "activity_cheers_select" on public.activity_cheers;
create policy "activity_cheers_select" on public.activity_cheers
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Direct messages between friends (social Phase 2). Append-only inserts; each side
-- independently marks read / archives / soft-deletes THEIR OWN view (never a hard
-- delete, so the other party keeps their copy and the record survives). game_id +
-- game_title are reserved for an optional embedded game card — the picker UI is
-- deferred, but the columns ship now so no later migration is needed. Written only
-- through the security-definer message RPCs (no client write grants).
create table if not exists public.messages (
  id                    uuid primary key default gen_random_uuid(),
  sender                uuid not null references auth.users (id) on delete cascade,
  recipient             uuid not null references auth.users (id) on delete cascade,
  body                  text not null,
  game_id               uuid references public.games (id) on delete set null,
  game_title            text,
  read_at               timestamptz,
  sender_archived_at    timestamptz,
  recipient_archived_at timestamptz,
  sender_deleted_at     timestamptz,
  recipient_deleted_at  timestamptz,
  created_at            timestamptz not null default now(),
  check (sender <> recipient)
);
create index if not exists messages_recipient_idx on public.messages (recipient, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender, created_at desc);

-- game_image: cover-art snapshot for an embedded game card (alongside game_title),
-- so the card renders richly and survives the source game being deleted.
alter table public.messages add column if not exists game_image text;
-- edited_at: set when the sender edits a message (shows an "(edited)" marker).
alter table public.messages add column if not exists edited_at timestamptz;
-- deleted_at: a BOTH-SIDED per-message tombstone. When the sender deletes a message
-- its body is cleared and both parties see "This message was deleted".
alter table public.messages add column if not exists deleted_at timestamptz;
-- sender_/recipient_hidden_at: per-side "removed this chat from my list" markers
-- (Discord-style). Hiding never destroys history — the conversation simply drops off
-- your list until there's newer (non-hidden) activity, and the full thread is intact
-- when you reopen it. Supersedes the older sender_/recipient_deleted_at columns
-- (kept for safety, now unused).
alter table public.messages add column if not exists sender_hidden_at timestamptz;
alter table public.messages add column if not exists recipient_hidden_at timestamptz;
-- reply_to: this message quotes an earlier one in the same conversation. on delete
-- set null so a quote outlives the original being hard-removed (account deletion);
-- soft-deletes (deleted_at) keep the row so list_thread can show the tombstone.
alter table public.messages add column if not exists reply_to uuid references public.messages (id) on delete set null;
-- images: pasted/uploaded image attachments on a message, as a jsonb array of
-- { path, url } objects. `path` is the object key in the (currently public)
-- 'attachments' bucket; storing it alongside the public `url` leaves the door open to
-- move DM images to a private bucket + signed URLs later without a data migration.
alter table public.messages add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.messages enable row level security;
revoke insert, update, delete on public.messages from authenticated, anon;
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated using (
    auth.uid() in (sender, recipient)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Emoji reactions on direct messages. Mirrors comment_reactions: one row per user
-- per message per emoji, palette pinned by a check constraint. Like everything in
-- the messaging module, writes are server-authoritative (the toggle RPC below);
-- clients only read, and only for messages they're part of.
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions add constraint message_reactions_emoji_check
  check (emoji in ('👍', '❤️', '🎉', '😄'));

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;
revoke insert, update, delete on public.message_reactions from authenticated, anon;
drop policy if exists "message_reactions_select" on public.message_reactions;
create policy "message_reactions_select" on public.message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.messages m
       where m.id = message_id and auth.uid() in (m.sender, m.recipient)
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Append-only audit of message reactions (added/removed), per the capture-history
-- rule — the reactions table only holds current state. Read-own + admin; written
-- solely by the toggle RPC (security definer).
create table if not exists public.message_reaction_events (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages (id) on delete set null,
  user_id    uuid references auth.users (id) on delete set null,
  emoji      text not null,
  action     text not null check (action in ('added', 'removed')),
  created_at timestamptz not null default now()
);
create index if not exists message_reaction_events_user_idx
  on public.message_reaction_events (user_id, created_at desc);

alter table public.message_reaction_events enable row level security;
revoke insert, update, delete on public.message_reaction_events from authenticated, anon;
drop policy if exists "message_reaction_events_select" on public.message_reaction_events;
create policy "message_reaction_events_select" on public.message_reaction_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
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

-- Animated chip effect: a key into the client TITLE_EFFECTS registry
-- (src/lib/badges.ts) — a shimmering/glowing treatment for premium titles.
-- Null = plain chip; unknown keys degrade to plain (the style-key posture).
alter table public.badges
  add column if not exists effect text;

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
        'description', b.description, 'icon', b.icon, 'prestige', b.prestige,
        'kind', b.kind, 'effect', b.effect
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
      'description', b.description, 'icon', b.icon, 'prestige', b.prestige,
      'kind', b.kind, 'effect', b.effect
    )
  end
  from public.profiles p
  left join public.user_badges ub
    on ub.user_id = p.id and ub.badge_id = p.selected_badge_id and ub.revoked_at is null
  left join public.badges b on b.id = ub.badge_id
  where p.id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Curio Shop: a catalog of purchasable cosmetics (the coin sink). Three kinds:
--   • title — grants a kind-'shop' badge on purchase, equipped through the
--     existing selected_badge_id / set_selected_title title system.
--   • frame — a decorative ring around the avatar (equipped_frame_id below).
--   • stall — a decoration on the Market Square stall card / profile header
--     (equipped_stall_id below).
-- Items are permanent once bought; seasonal stock uses an availability window
-- (purchases outside it are refused, ownership never expires). Stock lives in
-- the DB like the achievements catalog: adding an item is a seed/admin row, not
-- a deploy — but frame/stall visuals resolve client-side from the style-key
-- registry in src/lib/shopCosmetics.ts, so brand-new LOOKS still need code.
-- Items are never deleted: retiring one is active=false (soft pull-from-shelf),
-- so purchase history and equipped states always resolve.
-- Defined here (right after badges) so user_cosmetics_json exists before the
-- leaderboard/view_profile/square_spotlight functions further down that call it.
-- ---------------------------------------------------------------------------

-- Shop titles are badges of a new kind 'shop' (bought, not earned — rendered
-- distinctly client-side), granted with a new user_badges source 'shop'.
alter table public.badges drop constraint if exists badges_kind_check;
alter table public.badges add constraint badges_kind_check
  check (kind in ('granted', 'competitive', 'shop'));
alter table public.user_badges drop constraint if exists user_badges_source_check;
alter table public.user_badges add constraint user_badges_source_check
  check (source in ('admin', 'cohort', 'auto', 'shop'));

create table if not exists public.shop_items (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,                 -- stable key ('frame-gilded')
  kind            text not null check (kind in ('title', 'frame', 'stall', 'coin')),
  name            text not null,
  description     text,
  price           integer not null check (price >= 0),
  -- Visual preset key into src/lib/shopCosmetics.ts (frames/stalls only; titles
  -- render through their linked badge). Unknown keys degrade to undecorated.
  style           text,
  -- The kind-'shop' badge a title item grants on purchase; null for frames/stalls.
  badge_id        uuid references public.badges (id) on delete set null,
  -- Seasonal window (null = always on sale). Checked at purchase time only.
  available_from  timestamptz,
  available_until timestamptz,
  active          boolean not null default true,
  sort            integer not null default 0,
  created_at      timestamptz not null default now(),
  constraint shop_items_style_check check (kind = 'title' or style is not null)
);

-- Cosmetic classes: 'standard' is the launch stock; 'premium' marks the
-- costlier animated/ornamented flair, presented distinctly in the storefront.
alter table public.shop_items
  add column if not exists tier text not null default 'standard';
alter table public.shop_items drop constraint if exists shop_items_tier_check;
alter table public.shop_items add constraint shop_items_tier_check
  check (tier in ('standard', 'premium'));
-- Surprise drops: a secret item is invisible in the storefront (enforced in the
-- select policy below) until available_from arrives — no "Arrives …" teaser.
-- Secret with no available_from is inert (the item shows normally).
alter table public.shop_items
  add column if not exists secret boolean not null default false;

-- Coin skins joined the kinds 2026-07 (a fourth cosmetic: a custom mint for
-- your coins, style = a CoinVariant id in src/lib/coins.ts / public/coins).
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check
  check (kind in ('title', 'frame', 'stall', 'coin'));

-- Collections ("set bonuses"): items sharing a set_key form a set; owning every
-- active member auto-grants the set's exclusive reward title (buy_shop_item).
-- Sets are seeded in code; the admin editor only assigns items to them.
create table if not exists public.shop_sets (
  key        text primary key,               -- stable slug ('haunt-2026')
  name       text not null,
  description text,
  badge_id   uuid references public.badges (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.shop_sets enable row level security;
drop policy if exists "shop_sets_select" on public.shop_sets;
create policy "shop_sets_select" on public.shop_sets
  for select to authenticated using (true);
revoke insert, update, delete on public.shop_sets from authenticated;
revoke insert, update, delete on public.shop_sets from anon;

alter table public.shop_items
  add column if not exists set_key text references public.shop_sets (key);

-- One immutable receipt per purchase; the unique pair makes items one-per-user
-- and serializes concurrent double-buys. Item fields are snapshotted so the
-- receipt reads correctly forever (the coin_events.game_title pattern).
create table if not exists public.shop_purchases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    uuid not null references public.shop_items (id),
  item_slug  text not null,
  item_name  text not null,
  item_kind  text not null,
  price_paid integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);
create index if not exists shop_purchases_user_idx
  on public.shop_purchases (user_id, created_at desc);

alter table public.shop_items     enable row level security;
alter table public.shop_purchases enable row level security;

-- Catalog: everyone signed in browses the active shelf; shop managers also see
-- retired stock, and an owner can always resolve an item they bought even after
-- it's pulled. Secret upcoming items are hidden at the row level (not just the
-- client) so a modified client can't peek at unreleased surprise drops. Writes
-- go exclusively through the definer RPCs at the file tail.
-- NOTE: this policy is RE-CREATED below the app_config section with an extra
-- "shop is open" gate — app_config doesn't exist yet at this point of a fresh
-- run. This earlier version only exists so the table is never policy-less.
drop policy if exists "shop_items_select" on public.shop_items;
create policy "shop_items_select" on public.shop_items
  for select to authenticated using (
    (active and not (secret and available_from is not null and available_from > now()))
    or public.has_permission('shop.manage')
    or exists (select 1 from public.shop_purchases sp
                where sp.item_id = shop_items.id and sp.user_id = auth.uid())
  );
revoke insert, update, delete on public.shop_items from authenticated;
revoke insert, update, delete on public.shop_items from anon;

-- Receipts: read-own (shop managers/admins read all for support); never
-- client-written — only buy_shop_item inserts.
drop policy if exists "shop_purchases_select" on public.shop_purchases;
create policy "shop_purchases_select" on public.shop_purchases
  for select to authenticated using (
    auth.uid() = user_id or public.has_permission('shop.manage')
  );
revoke insert, update, delete on public.shop_purchases from authenticated;
revoke insert, update, delete on public.shop_purchases from anon;

-- Equipped cosmetics. Like selected_badge_id these are deliberately NOT in the
-- client's profiles update grant — equipping goes through equip_cosmetic, which
-- verifies ownership.
alter table public.profiles
  add column if not exists equipped_frame_id uuid references public.shop_items (id) on delete set null;
alter table public.profiles
  add column if not exists equipped_stall_id uuid references public.shop_items (id) on delete set null;
alter table public.profiles
  add column if not exists equipped_coin_id uuid references public.shop_items (id) on delete set null;

-- A user's equipped frame/stall style keys as one JSON object (nulls when
-- nothing equipped). The shop_purchases join means an equip is only ever shown
-- while backed by a real purchase (mirrors user_title_json's revoked-join).
-- Plain (not definer) like the badge helpers above, for the same reason.
create or replace function public.user_cosmetics_json(p_user uuid)
returns jsonb
language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'frame', (select si.style
                from public.profiles p
                join public.shop_items si on si.id = p.equipped_frame_id and si.kind = 'frame'
                join public.shop_purchases sp on sp.item_id = si.id and sp.user_id = p.id
               where p.id = p_user),
    'stall', (select si.style
                from public.profiles p
                join public.shop_items si on si.id = p.equipped_stall_id and si.kind = 'stall'
                join public.shop_purchases sp on sp.item_id = si.id and sp.user_id = p.id
               where p.id = p_user),
    'coin', (select si.style
               from public.profiles p
               join public.shop_items si on si.id = p.equipped_coin_id and si.kind = 'coin'
               join public.shop_purchases sp on sp.item_id = si.id and sp.user_id = p.id
              where p.id = p_user)
  );
$$;

-- Launch stock (idempotent; prices are placeholders the admin tunes in the Shop
-- tab). Title badges first so the item rows can resolve them by slug. Badge
-- slugs follow 'shop-' || item slug — admin_save_shop_item uses the same rule.
insert into public.badges (slug, name, description, icon, kind, prestige) values
  ('shop-title-bazaar-regular', 'Bazaar Regular',
   'A familiar face around the stalls.', 'sparkles', 'shop', 3),
  ('shop-title-curio-collector', 'Curio Collector',
   'Keeps an eye out for oddities and treasures.', 'gem', 'shop', 3),
  ('shop-title-night-owl', 'Night Owl',
   'The Bazaar never really closes.', 'moon', 'shop', 4),
  ('shop-title-coin-baron', 'Coin Baron',
   'Made a fortune finishing what they started.', 'coins', 'shop', 5),
  ('shop-title-the-connoisseur', 'The Connoisseur',
   'Impeccable taste, impeccably displayed.', 'crown', 'shop', 6)
on conflict (slug) do nothing;

insert into public.shop_items
  (slug, kind, name, description, price, style, badge_id, available_from, available_until, sort)
values
  ('title-bazaar-regular', 'title', 'Bazaar Regular',
   'A familiar face around the stalls.', 100, null,
   (select id from public.badges where slug = 'shop-title-bazaar-regular'), null, null, 10),
  ('title-curio-collector', 'title', 'Curio Collector',
   'Keeps an eye out for oddities and treasures.', 150, null,
   (select id from public.badges where slug = 'shop-title-curio-collector'), null, null, 20),
  ('title-night-owl', 'title', 'Night Owl',
   'The Bazaar never really closes.', 200, null,
   (select id from public.badges where slug = 'shop-title-night-owl'), null, null, 30),
  ('title-coin-baron', 'title', 'Coin Baron',
   'Made a fortune finishing what they started.', 500, null,
   (select id from public.badges where slug = 'shop-title-coin-baron'), null, null, 40),
  ('title-the-connoisseur', 'title', 'The Connoisseur',
   'Impeccable taste, impeccably displayed.', 800, null,
   (select id from public.badges where slug = 'shop-title-the-connoisseur'), null, null, 50),
  ('frame-bronze-ring', 'frame', 'Bronze Ring',
   'A modest ring of hammered bronze around your avatar.', 200, 'bronze-ring',
   null, null, null, 110),
  ('frame-aurora', 'frame', 'Aurora',
   'A shifting ribbon of northern light.', 450, 'aurora',
   null, null, null, 120),
  ('frame-gilded', 'frame', 'Gilded',
   'Gold leaf, generously applied.', 700, 'gilded',
   null, null, null, 130),
  ('frame-holly-wreath', 'frame', 'Holly Wreath',
   'Christmas 2026 — on the shelf for the season only.', 350, 'holly-wreath',
   null, timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-08 00:00:00+00', 140),
  ('stall-festive-bunting', 'stall', 'Festive Bunting',
   'String lights and pennants across your stall.', 200, 'festive-bunting',
   null, null, null, 210),
  ('stall-lantern-glow', 'stall', 'Lantern Glow',
   'A warm lantern light spills over your wares.', 350, 'lantern-glow',
   null, null, null, 220),
  ('stall-velvet-drapes', 'stall', 'Velvet Drapes',
   'Deep velvet curtains for a stall of distinction.', 550, 'velvet-drapes',
   null, null, null, 230),
  ('stall-snowfall', 'stall', 'Snowfall',
   'Christmas 2026 — a gentle dusting of snow, for the season only.', 350, 'snowfall',
   null, timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-08 00:00:00+00', 240)
on conflict (slug) do nothing;

-- Premium wave (2026-07): animated/ornamented flair, plus the first seasonal
-- surprise drops (secret — invisible until their window opens). Style keys must
-- exist in shopCosmetics.ts; prices are placeholders the admin tunes.
insert into public.shop_items
  (slug, kind, name, description, price, style, tier, secret,
   available_from, available_until, sort)
values
  ('frame-starlight-shimmer', 'frame', 'Starlight Shimmer',
   'Gold leaf with a shine that sweeps past every so often.', 900, 'starlight-shimmer',
   'premium', false, null, null, 150),
  ('frame-prismatic', 'frame', 'Prismatic',
   'A slowly turning ring of every colour at once.', 1200, 'prismatic',
   'premium', false, null, null, 160),
  ('frame-jack-o-lantern', 'frame', 'Jack-o''-Lantern',
   'Halloween 2026 — carved-pumpkin orange with a candlelight flicker.', 500, 'jack-o-lantern',
   'premium', true, timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-11-04 00:00:00+00', 170),
  ('frame-bat-familiar', 'frame', 'Bat Familiar',
   'Halloween 2026 — a small companion roosts on your frame and stretches its wings.', 650, 'bat-familiar',
   'premium', true, timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-11-04 00:00:00+00', 180),
  ('frame-candy-cane', 'frame', 'Candy Cane',
   'Christmas 2026 — peppermint stripes around your avatar.', 300, 'candy-cane',
   'standard', true, timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-08 00:00:00+00', 190),
  ('stall-marquee-lights', 'stall', 'Marquee Lights',
   'A string of twinkling bulbs across the top of your stall.', 900, 'marquee-lights',
   'premium', false, null, null, 250),
  ('stall-pumpkin-patch', 'stall', 'Pumpkin Patch',
   'Halloween 2026 — a harvest of pumpkins along your stall''s edge.', 350, 'pumpkin-patch',
   'standard', true, timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-11-04 00:00:00+00', 260),
  ('stall-haunted-bazaar', 'stall', 'Haunted Bazaar',
   'Halloween 2026 — cobwebs, dusk, and bats that never quite settle.', 650, 'haunted-bazaar',
   'premium', true, timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-11-04 00:00:00+00', 270),
  ('stall-trimmed-tree', 'stall', 'Trimmed Tree',
   'Christmas 2026 — evergreen boughs strung with twinkling lights.', 650, 'trimmed-tree',
   'premium', true, timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-08 00:00:00+00', 280),
  ('stall-candy-cane-trim', 'stall', 'Candy Cane Trim',
   'Christmas 2026 — a peppermint-striped border for the sweetest stall.', 350, 'candy-cane-trim',
   'standard', true, timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-08 00:00:00+00', 290)
on conflict (slug) do nothing;

-- Wave 3 (2026-07): companions, weather, coin skins, animated titles, sets.
-- Badges first: the purchasable Starforged title plus the two set-reward titles
-- (never sold — granted by buy_shop_item when a collection completes; kind
-- 'shop' keeps them out of the admin grant picker like other shop titles).
insert into public.badges (slug, name, description, icon, kind, prestige, effect) values
  ('shop-title-starforged', 'Starforged',
   'Hammered from a fallen star; it never quite stops gleaming.', 'sparkles', 'shop', 7,
   'gold-shimmer'),
  ('set-keeper-of-the-haunt', 'Keeper of the Haunt',
   'Collected every treasure of the Haunt. The bats answer to you now.', 'moon', 'shop', 8,
   'haunt-glow'),
  ('set-spirit-of-the-season', 'Spirit of the Season',
   'Collected every treasure of Yuletide. Frost sparkles wherever you go.', 'star', 'shop', 8,
   'frost-shimmer')
on conflict (slug) do nothing;

insert into public.shop_sets (key, name, description, badge_id) values
  ('haunt-2026', 'The Haunt',
   'The Halloween 2026 collection. Own every piece to earn an exclusive animated title.',
   (select id from public.badges where slug = 'set-keeper-of-the-haunt')),
  ('yuletide-2026', 'Yuletide',
   'The Christmas 2026 collection. Own every piece to earn an exclusive animated title.',
   (select id from public.badges where slug = 'set-spirit-of-the-season'))
on conflict (key) do nothing;

-- Enroll the already-seeded seasonal items into their collections. Idempotent
-- catalog metadata only (no user data): fills set_key where it isn't set yet.
update public.shop_items set set_key = 'haunt-2026'
 where slug in ('frame-jack-o-lantern', 'frame-bat-familiar',
                'stall-pumpkin-patch', 'stall-haunted-bazaar')
   and set_key is distinct from 'haunt-2026';
update public.shop_items set set_key = 'yuletide-2026'
 where slug in ('frame-holly-wreath', 'frame-candy-cane', 'stall-snowfall',
                'stall-trimmed-tree', 'stall-candy-cane-trim')
   and set_key is distinct from 'yuletide-2026';

insert into public.shop_items
  (slug, kind, name, description, price, style, badge_id, tier, secret, set_key,
   available_from, available_until, sort)
values
  ('title-starforged', 'title', 'Starforged',
   'Hammered from a fallen star; it never quite stops gleaming.', 1000, null,
   (select id from public.badges where slug = 'shop-title-starforged'),
   'premium', false, null, null, null, 60),
  ('frame-cat-familiar', 'frame', 'Cat Familiar',
   'A small companion naps on your frame. Blinks. Judges, occasionally.', 650, 'cat-familiar',
   null, 'premium', false, null, null, null, 200),
  ('frame-ember', 'frame', 'Ember',
   'A ring of banked coals; sparks drift up when it thinks no one is watching.', 550, 'ember',
   null, 'premium', false, null, null, null, 210),
  ('frame-stormcaller', 'frame', 'Stormcaller',
   'Dark skies around your avatar — and every so often, lightning.', 700, 'stormcaller',
   null, 'premium', false, null, null, null, 220),
  ('stall-shooting-star', 'stall', 'Shooting Star',
   'A night-sky stall. Watch a while and one streaks past.', 700, 'shooting-star',
   null, 'premium', false, null, null, null, 300),
  ('stall-creeping-fog', 'stall', 'Creeping Fog',
   'Halloween 2026 — a low mist that never quite lifts.', 600, 'creeping-fog',
   null, 'premium', true, 'haunt-2026',
   timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-11-04 00:00:00+00', 310),
  ('stall-let-it-snow', 'stall', 'Let It Snow',
   'Christmas 2026 — real falling snow for your stall.', 700, 'let-it-snow',
   null, 'premium', true, 'yuletide-2026',
   timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-08 00:00:00+00', 320),
  ('coin-rose-gold', 'coin', 'Rose Gold Mint',
   'Your coins, struck in blushing rose gold.', 300, 'rose-gold',
   null, 'standard', false, null, null, null, 400),
  ('coin-obsidian', 'coin', 'Obsidian Mint',
   'Coins of black glass, rimmed in gold.', 800, 'obsidian',
   null, 'premium', false, null, null, null, 410),
  ('coin-radiant', 'coin', 'Radiant Mint',
   'A mint so polished it catches the light on its own.', 900, 'radiant',
   null, 'premium', false, null, null, null, 420),
  ('coin-jack-o-lantern', 'coin', 'Jack-o''-Coin',
   'Halloween 2026 — every coin you see wears the grin.', 500, 'jack-o-lantern',
   null, 'premium', true, 'haunt-2026',
   timestamptz '2026-10-01 00:00:00+00', timestamptz '2026-11-04 00:00:00+00', 430),
  ('coin-peppermint', 'coin', 'Peppermint Mint',
   'Christmas 2026 — a candy-striped mint for the season.', 400, 'peppermint',
   null, 'standard', true, 'yuletide-2026',
   timestamptz '2026-12-01 00:00:00+00', timestamptz '2027-01-08 00:00:00+00', 440)
on conflict (slug) do nothing;

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
-- is_live_service: marks a game as live-service / ongoing (Hearthstone, MTGA, …),
-- community-editable through the moderation queue like the other catalog fields.
-- Catalog-level only (never cascaded to personal games — it just seeds a new game's
-- own `ongoing` flag at add time, which the player can override). Additive: false.
alter table public.catalog_games add column if not exists is_live_service boolean not null default false;

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
-- is_live_service: the proposed live-service/ongoing flag. Committed to catalog_games
-- on approval like the other fields, but NOT cascaded to personal games (catalog-only;
-- it seeds a new game's `ongoing` flag at add time). Additive: existing rows default false.
alter table public.game_submissions add column if not exists is_live_service boolean not null default false;
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
-- Re-resolve every shared compilation template's embedded game snapshots from the
-- live catalog after a catalog game changes. A compilation_templates.games entry is
-- a denormalized snapshot ({name, hours, image, genres, ...}) captured at submit
-- time; the cascade to public.games (below) can't reach inside that JSONB, so an
-- approved catalog edit would otherwise leave templates — and everyone who picks
-- one — showing stale metadata until the template was deleted and re-created. This
-- heals templates at the source: for every element linked to p_catalog (by its
-- catalog_id, or by rawg_id when it carries one), it overwrites exactly the
-- catalog-owned fields (the same set the games cascade writes: title→name, hours,
-- image, genres, released, platforms, developers) and stamps catalog_id so future
-- edits match by link. Personal/catalog-absent fields (metacritic, esrb) are left
-- as the original snapshot. Internal helper: called only by the catalog-mutating
-- RPCs (which already authorize), so execute is revoked from clients. Idempotent.
create or replace function public.refresh_compilation_templates_for_catalog(p_catalog uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c public.catalog_games%rowtype;
begin
  select * into c from public.catalog_games where id = p_catalog;
  if not found then return; end if;

  update public.compilation_templates t
     set games = coalesce((
           select jsonb_agg(
             case
               when (e->>'catalog_id') = c.id::text
                 or (c.rawg_id is not null and (e->>'rawg_id') is not null
                     and (e->>'rawg_id')::int = c.rawg_id)
               then e || jsonb_build_object(
                      'catalog_id', c.id,
                      'name',       c.title,
                      'image',      c.image,
                      'platforms',  c.platforms,
                      'genres',     c.genres,
                      'developers', c.developers,
                      'released',   c.released,
                      'hours',      c.hours
                    )
               else e
             end
             order by ord
           )
           from jsonb_array_elements(t.games) with ordinality as arr(e, ord)
         ), '[]'::jsonb),
         updated_at = now()
   where exists (
     select 1 from jsonb_array_elements(t.games) e2
      where (e2->>'catalog_id') = c.id::text
         or (c.rawg_id is not null and (e2->>'rawg_id') is not null
             and (e2->>'rawg_id')::int = c.rawg_id)
   );
end;
$$;

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
  v_t boolean; v_i boolean; v_p boolean; v_g boolean; v_r boolean; v_h boolean; v_d boolean; v_s boolean; v_ls boolean;
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
  v_ls := not v_partial or 'is_live_service' = any(p_fields);
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
    is_live_service = case when v_ls then s.is_live_service else is_live_service end,
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
    stock_image = case when v_i then c.image else g.stock_image end,
    -- Live-service flag cascades onto every copy that ISN'T mid-lane (backlog,
    -- wishlist, finished). None of those sit in an active Now Playing lane, so
    -- flipping `ongoing` just changes how they're treated next (free Rotation play
    -- vs the buy economy) with no coin or lane state at risk — a finished
    -- live-service game can simply re-enter Rotation. Only a 'playing' copy is
    -- skipped: it's actively in a lane/slot, so its `ongoing` flag is lane-driven
    -- (rotation / convert / routing actions), not a catalog edit.
    ongoing     = case when v_ls and g.status in ('backlog', 'wishlist', 'finished')
                       then c.is_live_service else g.ongoing end
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
  -- A submitter who has the economy off earns nothing (frozen balance).
  if not public.economy_enabled(s.submitter) then
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
      ) || case when v_reward > 0 then ' (+' || v_reward || ' coins)' else '' end,
      'mysubmissions:' || p_id
    );
  end if;

  update public.game_submissions set
    status = 'approved', reviewer = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(p_note), ''), reward = v_reward,
    approved_fields = coalesce(
      p_fields,
      array['title', 'image', 'platforms', 'genres', 'developers', 'released', 'hours', 'screenshots', 'is_live_service']
    )
  where id = p_id;

  -- Keep shared compilation templates' embedded game snapshots in sync with the
  -- edit (the games cascade above can't reach inside their JSONB).
  perform public.refresh_compilation_templates_for_catalog(v_catalog);
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

-- Let a submitter WITHDRAW their own still-pending contribution (a mistake they
-- want to retract before a moderator decides it), rather than waiting for a
-- reject/approve cycle. Same soft-delete as the admin removal, but scoped to the
-- caller's own rows and only while pending — an already-decided submission stays
-- as the historical record. Returns true when something was withdrawn.
create or replace function public.withdraw_game_submission(p_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.game_submissions
     set deleted_at = now()
   where id = p_id and submitter = auth.uid() and status = 'pending' and deleted_at is null
   returning id into v_id;
  return v_id is not null;
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
  v_t boolean; v_i boolean; v_p boolean; v_g boolean; v_d boolean; v_r boolean; v_h boolean; v_s boolean; v_ls boolean;
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
  -- is_live_service: same catalog-match signal (a plain boolean), so an approval
  -- that flipped the flag can be undone while a later edit that changed it is skipped.
  v_ls := s.is_live_service is distinct from coalesce((s.before->>'is_live_service')::boolean, false)
          and c.is_live_service = s.is_live_service;

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
  if v_ls then v_reverted := array_append(v_reverted, 'is_live_service'); elsif 'is_live_service' = any(s.approved_fields) then v_skipped := array_append(v_skipped, 'is_live_service'); end if;

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
    is_live_service = case when v_ls then coalesce((s.before->>'is_live_service')::boolean, false) else is_live_service end,
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
    stock_image = case when v_i then cg.image else g.stock_image end,
    -- Mirror approve_game_submission: restore the live-service flag onto every
    -- non-playing copy (backlog/wishlist/finished); cg.is_live_service was just
    -- rolled back to the pre-approval value. Only 'playing' copies are skipped.
    ongoing     = case when v_ls and g.status in ('backlog', 'wishlist', 'finished')
                       then cg.is_live_service else g.ongoing end
  from public.catalog_games cg
  where cg.id = v_catalog
    and ((cg.rawg_id is not null and g.rawg_id = cg.rawg_id) or g.catalog_id = cg.id);

  -- Mark the submission reverted (kept in the log; approved_fields/status stay as
  -- the historical record of the approval itself).
  update public.game_submissions set
    reverted_at = now(), reverted_by = auth.uid(), reverted_fields = v_reverted
  where id = p_id;

  -- Roll the restored values into shared compilation templates too, so they don't
  -- keep showing the (now reverted) edit.
  perform public.refresh_compilation_templates_for_catalog(v_catalog);

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
  is_live_service boolean,
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
    s.title, s.image, s.platforms, s.genres, s.developers, s.released, s.hours, s.screenshots,
    s.is_live_service, s.before,
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
  is_live_service boolean,
  owner_count bigint,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    c.id, c.title, c.image, c.platforms, c.genres, c.developers,
    c.released, c.hours, c.screenshots, c.is_live_service,
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
-- Dropped first because adding p_is_live_service changes the signature.
drop function if exists public.admin_edit_catalog_game(uuid, text, text, jsonb, jsonb, jsonb, date, real, jsonb);
create or replace function public.admin_edit_catalog_game(
  p_id          uuid,
  p_title       text,
  p_image       text,
  p_platforms   jsonb,
  p_genres      jsonb,
  p_developers  jsonb,
  p_released    date,
  p_hours       real,
  p_screenshots jsonb,
  p_is_live_service boolean default false
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
    'screenshots', c.screenshots, 'is_live_service', c.is_live_service
  );

  update public.catalog_games set
    title = btrim(p_title), image = nullif(btrim(coalesce(p_image, '')), ''),
    platforms = coalesce(p_platforms, '[]'::jsonb),
    genres = coalesce(p_genres, '[]'::jsonb),
    developers = coalesce(p_developers, '[]'::jsonb),
    released = p_released, hours = p_hours,
    screenshots = coalesce(p_screenshots, '[]'::jsonb),
    is_live_service = coalesce(p_is_live_service, false),
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
    stock_image = c2.image,
    -- Live-service flag cascades onto every non-playing copy (see approve_game_submission).
    ongoing     = case when g.status in ('backlog', 'wishlist', 'finished')
                       then c2.is_live_service else g.ongoing end
  from public.catalog_games c2
  where c2.id = p_id and g.catalog_id = p_id;

  -- Keep shared compilation templates' embedded snapshots current with this edit.
  perform public.refresh_compilation_templates_for_catalog(p_id);

  -- Append-only audit trail: an approved edit attributed to the admin (no reward,
  -- no self-notify since the actor is the submitter). Lets it show in My
  -- contributions and be reverted with the existing tooling.
  insert into public.game_submissions (
    submitter, kind, catalog_id, title, image, platforms, genres, developers,
    released, hours, screenshots, is_live_service, before, status, reviewer, reviewed_at,
    review_note, reward, approved_fields
  ) values (
    auth.uid(), 'edit', p_id, btrim(p_title), nullif(btrim(coalesce(p_image, '')), ''),
    coalesce(p_platforms, '[]'::jsonb), coalesce(p_genres, '[]'::jsonb),
    coalesce(p_developers, '[]'::jsonb), p_released, p_hours,
    coalesce(p_screenshots, '[]'::jsonb), coalesce(p_is_live_service, false), v_before, 'approved', auth.uid(), now(),
    'Admin direct edit', 0,
    array['title', 'image', 'platforms', 'genres', 'developers', 'released', 'hours', 'screenshots', 'is_live_service']
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

-- Moderator-set cover art for the compilation's collapsed parent card. Fills
-- the card for every owner whose personal compilations.parent_image is empty
-- (the owner's own cover always wins); child game covers are never touched.
-- Set only via admin_set_compilation_template_image (catalog.manage).
alter table public.compilation_templates add column if not exists image text;

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

-- parent_catalog_id: the moderator-established link from a shared compilation
-- template to the catalog entry for the compilation-as-one-game (e.g. the
-- "Mass Effect Legendary Edition" catalog game). Owners of that single game card
-- can then EXPAND it into the template's children (expand_game_to_compilation
-- below). Set only via admin_edit_compilation_template (catalog.manage); on
-- delete set null so removing a catalog game never breaks a template. At most
-- one template per parent game, so an owned card maps to exactly one expansion.
alter table public.compilation_templates add column if not exists parent_catalog_id uuid
  references public.catalog_games (id) on delete set null;
create unique index if not exists compilation_templates_parent_idx
  on public.compilation_templates (parent_catalog_id) where parent_catalog_id is not null;
-- Audit parity: admin template edits are logged as approved submissions, so the
-- log carries the parent link too (no FK — it's a snapshot, not a live pointer).
alter table public.compilation_submissions add column if not exists parent_catalog_id uuid;

-- The shared template a personal compilation came from (null = hand-built).
-- Lives here rather than with the compilations table above because
-- compilation_templates is created later in this file — the FK needs both.
-- Lets the collapsed rollup card use the template's parent-game art and lets a
-- template-created bundle stay linked for future features.
alter table public.compilations add column if not exists template_id uuid
  references public.compilation_templates (id) on delete set null;

-- One-time backfill: heal any compilation templates whose embedded game snapshots
-- predate the catalog-cascade above. Refreshes each catalog game referenced by a
-- template (by catalog_id, or by rawg_id for elements that only carry one) from its
-- current catalog row, so existing templates immediately reflect every past edit.
-- Re-running is harmless (the refresh is idempotent and only writes catalog-owned
-- fields). No template, submission, or personal data is deleted or overwritten.
do $$
declare
  v_catalog uuid;
begin
  for v_catalog in
    select distinct c.id
    from public.compilation_templates t
    cross join lateral jsonb_array_elements(t.games) e
    join public.catalog_games c
      on c.id = (e->>'catalog_id')::uuid
      or (c.rawg_id is not null and (e->>'rawg_id') is not null
          and c.rawg_id = (e->>'rawg_id')::int)
  loop
    perform public.refresh_compilation_templates_for_catalog(v_catalog);
  end loop;
end $$;

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
  -- Canonicalize the submitted snapshots' platforms/genres against the master
  -- lists before they become shared data — raw client metadata can carry
  -- off-list spellings that would later break expand_game_to_compilation
  -- against the games validation trigger (issue 955090f2).
  if s.kind = 'edit' and s.template_id is not null then
    update public.compilation_templates
       set title = btrim(s.title), games = public.canonical_template_games(s.games),
           platform = s.platform, updated_at = now()
     where id = s.template_id
     returning id into v_template;
  end if;
  -- New submission, or an edit whose target template has since vanished.
  if v_template is null then
    insert into public.compilation_templates (title, games, platform, created_by)
    values (btrim(s.title), public.canonical_template_games(s.games), s.platform, s.submitter)
    returning id into v_template;
  end if;

  -- Reward the submitter (server-authoritative), like a catalog contribution.
  select submission_reward into v_reward from public.app_config where id = 1;
  v_reward := coalesce(v_reward, 15);
  -- A submitter who has the economy off earns nothing (frozen balance).
  if not public.economy_enabled(s.submitter) then
    v_reward := 0;
  end if;
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
        || case when v_reward > 0 then ' (+' || v_reward || ' coins)' else '' end,
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

-- Admin management of the shared compilation templates (the catalog manager
-- surface, mirroring list_community_catalog / admin_edit_catalog_game). Gated on
-- catalog.manage. Lets admins browse, directly edit, and delete shared
-- compilation templates so existing duplicates/mistakes can be cleaned up without
-- the suggestion queue.
-- Dropped first: the RETURNS TABLE shape gained parent_catalog_id (+ its title
-- for display) when moderator parent links were added.
drop function if exists public.list_compilation_templates();
create or replace function public.list_compilation_templates()
returns table (
  id                uuid,
  title             text,
  games             jsonb,
  created_at        timestamptz,
  updated_at        timestamptz,
  parent_catalog_id uuid,
  parent_title      text,
  image             text
)
language sql
security definer set search_path = public
as $$
  select t.id, t.title, t.games, t.created_at, t.updated_at,
         t.parent_catalog_id, c.title, t.image
  from public.compilation_templates t
  left join public.catalog_games c on c.id = t.parent_catalog_id
  where public.has_permission('catalog.manage')
  order by lower(t.title) asc;
$$;

-- Admin direct edit of a shared compilation template (bypasses the suggestion
-- queue): overwrite its title + games (and the moderator-set parent-game link)
-- and log an append-only approved compilation_submissions row for the audit
-- trail (no reward, no self-notify). Platform/format are personal, so they're
-- never written here. Dropped first: p_parent_catalog was added (a defaulted
-- extra arg would otherwise leave an ambiguous overload).
drop function if exists public.admin_edit_compilation_template(uuid, text, jsonb);
create or replace function public.admin_edit_compilation_template(
  p_id             uuid,
  p_title          text,
  p_games          jsonb,
  p_parent_catalog uuid default null
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  t public.compilation_templates%rowtype;
begin
  if not public.has_permission('catalog.manage') then
    raise exception 'Not authorized';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'Title is required';
  end if;
  select * into t from public.compilation_templates where id = p_id for update;
  if not found then raise exception 'Compilation template not found'; end if;
  if p_parent_catalog is not null
     and not exists (select 1 from public.catalog_games c where c.id = p_parent_catalog) then
    raise exception 'Parent game not found in the catalog';
  end if;

  begin
    -- Canonicalized like approve_compilation_submission: template snapshots
    -- must never carry off-list platform/genre spellings (issue 955090f2).
    update public.compilation_templates
       set title = btrim(p_title), games = public.canonical_template_games(p_games),
           parent_catalog_id = p_parent_catalog, updated_at = now()
     where id = p_id;
  exception when unique_violation then
    raise exception 'Another compilation already links this game';
  end;

  -- Append-only audit: an approved edit attributed to the admin (before snapshot
  -- for diff/revert), mirroring admin_edit_catalog_game.
  insert into public.compilation_submissions (
    submitter, kind, template_id, title, games, before, status, reviewer,
    reviewed_at, review_note, reward, parent_catalog_id
  ) values (
    auth.uid(), 'edit', p_id, btrim(p_title), coalesce(p_games, '[]'::jsonb),
    jsonb_build_object('title', t.title, 'games', t.games,
                       'parent_catalog_id', t.parent_catalog_id),
    'approved', auth.uid(), now(), 'Admin direct edit', 0, p_parent_catalog
  );
end;
$$;

-- Moderator cover art for a shared compilation template (catalog.manage): the
-- image every collapsed parent card falls back to when its owner hasn't set a
-- personal cover (compilations.parent_image always wins; child game covers are
-- never touched). Null/blank clears it. Audited as an approved edit row with a
-- before-snapshot, mirroring admin_edit_compilation_template.
create or replace function public.admin_set_compilation_template_image(
  p_id    uuid,
  p_image text default null
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  t public.compilation_templates%rowtype;
begin
  if not public.has_permission('catalog.manage') then
    raise exception 'Not authorized';
  end if;
  select * into t from public.compilation_templates where id = p_id for update;
  if not found then raise exception 'Compilation template not found'; end if;

  update public.compilation_templates
     set image = nullif(btrim(coalesce(p_image, '')), ''), updated_at = now()
   where id = p_id;

  insert into public.compilation_submissions (
    submitter, kind, template_id, title, games, before, status, reviewer,
    reviewed_at, review_note, reward, parent_catalog_id
  ) values (
    auth.uid(), 'edit', p_id, t.title, t.games,
    jsonb_build_object('image', t.image),
    'approved', auth.uid(), now(), 'Admin cover update', 0, t.parent_catalog_id
  );
end;
$$;

-- Admin delete of a shared compilation template. Safe: a template isn't owned by
-- any player (it only seeds personal compilations at add-time), and the
-- submission FK is on delete set null, so the audit history survives.
create or replace function public.admin_delete_compilation_template(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('catalog.manage') then
    raise exception 'Not authorized';
  end if;
  if not exists (select 1 from public.compilation_templates where id = p_id) then
    raise exception 'Compilation template not found';
  end if;
  delete from public.compilation_templates where id = p_id;
end;
$$;

-- Ensure a RAWG game has a catalog_games row, so the template editor's parent
-- picker can offer the FULL game database (RAWG + community) even though
-- parent_catalog_id is an FK into catalog_games. Fill-blanks-only upsert: an
-- existing row never has approved data overwritten — only null fields gain the
-- provided values (community rows are untouched: they have no rawg_id, so they
-- can't conflict here). Gated on catalog.manage like the rest of the template
-- editor; the row itself records who created it (created_by/created_at), and
-- the parent-link change that follows is audited by
-- admin_edit_compilation_template's approved-submission row.
create or replace function public.admin_ensure_catalog_game(
  p_rawg_id  integer,
  p_title    text default null,
  p_image    text default null,
  p_released date default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('catalog.manage') then
    raise exception 'Not authorized';
  end if;
  if p_rawg_id is null then
    raise exception 'A RAWG id is required';
  end if;

  insert into public.catalog_games as cg (rawg_id, title, image, released, created_by)
  values (
    p_rawg_id,
    nullif(btrim(coalesce(p_title, '')), ''),
    nullif(btrim(coalesce(p_image, '')), ''),
    p_released,
    auth.uid()
  )
  on conflict (rawg_id) do update
    set title    = coalesce(cg.title, excluded.title),
        image    = coalesce(cg.image, excluded.image),
        released = coalesce(cg.released, excluded.released),
        -- Only count it as an update when a blank actually got filled.
        updated_at = case
          when (cg.title is null and excluded.title is not null)
            or (cg.image is null and excluded.image is not null)
            or (cg.released is null and excluded.released is not null)
          then now() else cg.updated_at end
  returning id into v_id;
  return v_id;
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

-- Let a submitter WITHDRAW their own still-pending compilation contribution. Mirrors
-- withdraw_game_submission: scoped to the caller's own rows, only while pending. A
-- pending submission hasn't published a template yet (templates are created on
-- approval), so nothing in the shared catalog is touched. Returns true on withdrawal.
create or replace function public.withdraw_compilation_submission(p_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.compilation_submissions
     set deleted_at = now()
   where id = p_id and submitter = auth.uid() and status = 'pending' and deleted_at is null
   returning id into v_id;
  return v_id is not null;
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

-- Migration for the app-wide coin skin (safe to re-run). The allowed list must
-- match COIN_VARIANTS in src/lib/coins.ts ('mint' added with the Minted B face).
alter table public.app_config add column if not exists default_coin text not null default 'bb';
alter table public.app_config drop constraint if exists app_config_default_coin_check;
alter table public.app_config add constraint app_config_default_coin_check
  check (default_coin in ('mint', 'b', 'bb', 'chest', 'stall'));

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

-- Rotation lane (live-service / ongoing games). The Rotation lane is a single
-- multi-occupant lane: a per-user capacity (profiles.rotation_slots) holding any
-- number of games marked games.in_rotation, separate from the focus slots. A game
-- in the lane can be "checked in" once per weekly reset for a small coin reward,
-- mirroring how live-service games reset their quests on a fixed schedule (e.g.
-- every Tuesday). All admin-tunable on the Economy page:
--   default_rotation_slots  — lane capacity a brand-new account starts with.
--   rotation_checkin_reward — coins paid per weekly check-in (0 disables it).
--   rotation_reset_dow      — the reset's day of week, Postgres dow (0=Sun..6=Sat).
--   rotation_reset_hour     — the reset's hour of day (0–23) in rotation_reset_tz.
--   rotation_reset_tz       — IANA timezone the reset day/hour are expressed in.
-- Defaults: 2 slots (symmetric 4×2 board), 3 coins, Tuesday 00:00 UTC.
alter table public.app_config add column if not exists default_rotation_slots integer not null default 2;
-- 4×2 symmetry: cap the live default at 2 as well (reduce-only, safe to re-run).
update public.app_config set default_rotation_slots = 2 where id = 1 and default_rotation_slots > 2;
alter table public.app_config drop constraint if exists app_config_default_rotation_slots_range;
alter table public.app_config add constraint app_config_default_rotation_slots_range
  check (default_rotation_slots between 0 and 99);
alter table public.app_config add column if not exists rotation_checkin_reward integer not null default 3;
alter table public.app_config drop constraint if exists app_config_rotation_checkin_reward_range;
alter table public.app_config add constraint app_config_rotation_checkin_reward_range
  check (rotation_checkin_reward between 0 and 100000);
alter table public.app_config add column if not exists rotation_reset_dow integer not null default 2;
alter table public.app_config drop constraint if exists app_config_rotation_reset_dow_range;
alter table public.app_config add constraint app_config_rotation_reset_dow_range
  check (rotation_reset_dow between 0 and 6);
alter table public.app_config add column if not exists rotation_reset_hour integer not null default 0;
alter table public.app_config drop constraint if exists app_config_rotation_reset_hour_range;
alter table public.app_config add constraint app_config_rotation_reset_hour_range
  check (rotation_reset_hour between 0 and 23);
alter table public.app_config add column if not exists rotation_reset_tz text not null default 'UTC';

-- Now Playing lane defaults + the Completion Bonus, admin-tunable on the Economy
-- page. default_replay_slots / default_completionist_slots are the Replay and
-- Completionist lane capacities a brand-new account starts with (seeded by
-- handle_new_user, alongside default_general_slots / default_rotation_slots).
-- completion_bonus_pct is the Completion Bonus paid for completing a game in the
-- Completionist lane: that % of the game's full bounty, on top of the base reward
-- (mirrors replay_bonus_pct). Defaults: 2 Replay slots, 2 Completionist slots, 50%.
alter table public.app_config add column if not exists default_replay_slots integer not null default 2;
alter table public.app_config drop constraint if exists app_config_default_replay_slots_range;
alter table public.app_config add constraint app_config_default_replay_slots_range
  check (default_replay_slots between 0 and 99);
alter table public.app_config add column if not exists default_completionist_slots integer not null default 2;
alter table public.app_config drop constraint if exists app_config_default_completionist_slots_range;
alter table public.app_config add constraint app_config_default_completionist_slots_range
  check (default_completionist_slots between 0 and 99);
alter table public.app_config add column if not exists completion_bonus_pct integer not null default 50;
alter table public.app_config drop constraint if exists app_config_completion_bonus_range;
alter table public.app_config add constraint app_config_completion_bonus_range
  check (completion_bonus_pct between 0 and 100);

alter table public.app_config enable row level security;
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config
  for select to anon, authenticated using (true);

-- App config holds both the economy levers and the site maintenance toggle, all
-- in one row. RLS can't gate per-column dynamically, so either an economy editor,
-- a maintenance manager, or a shop manager (the shop_open sign) may update the
-- row; the client routes each control to its specific capability. Super-admins
-- satisfy has_permission for all.
drop policy if exists "app_config_admin_update" on public.app_config;
create policy "app_config_admin_update" on public.app_config
  for update to authenticated
  using (public.has_permission('economy.edit') or public.has_permission('site.maintenance')
         or public.has_permission('shop.manage'))
  with check (public.has_permission('economy.edit') or public.has_permission('site.maintenance')
              or public.has_permission('shop.manage'));

-- The Curio Shop's closed-sign (admin: adjust stock/prices unseen, then
-- re-open). While app_config.shop_open is false, unowned stock disappears from
-- regular users' reads entirely — a modified client can't watch mid-adjustment
-- prices. Managers still see everything, and owned rows keep resolving so
-- equipped cosmetics never break. This re-creates the shop_items policy from
-- the badges section, now that app_config exists for the subquery.
alter table public.app_config
  add column if not exists shop_open boolean not null default true;

drop policy if exists "shop_items_select" on public.shop_items;
create policy "shop_items_select" on public.shop_items
  for select to authenticated using (
    (coalesce((select ac.shop_open from public.app_config ac where ac.id = 1), true)
      and active
      and not (secret and available_from is not null and available_from > now()))
    or public.has_permission('shop.manage')
    or exists (select 1 from public.shop_purchases sp
                where sp.item_id = shop_items.id and sp.user_id = auth.uid())
  );

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

-- A report moderator may delete any cover blob (the "Strip Custom Content" action).
-- The authoritative removal is resolve_report resetting games.image to stock_image;
-- this lets the client best-effort delete the now-orphaned file too. has_permission
-- already returns true for super-admins.
drop policy if exists "covers_delete_moderated" on storage.objects;
create policy "covers_delete_moderated" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and public.has_permission('reports.moderate'));

-- ---------------------------------------------------------------------------
-- Attachments storage bucket. Public read (screenshots/logs render in the
-- Requests board); a user may only write files under their own uid folder:
-- attachments/<uid>/<requestId>/<filename> for reports, and
-- attachments/<uid>/dm/<filename> for direct-message images. (DM images are public
-- like the rest for now; the message stores each image's path so a future move to a
-- private bucket + signed URLs needs no data migration.)
-- ---------------------------------------------------------------------------
-- 64 MiB per-file cap: comfortably above the client caps (10 MB images/logs,
-- 50 MB screen-recording videos) so an .mp4 repro isn't rejected by the project's
-- global default. Raising the limit is additive — nothing here shrank.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', true, 67108864)
on conflict (id) do update set public = true, file_size_limit = 67108864;

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
-- Rotation check-ins: an append-only log of each weekly "still playing" tap on a
-- Rotation-lane game. One row = one rewarded check-in (game_title denormalized so
-- the record survives the game being deleted; game_id then nulls). Written only by
-- the rotation_checkin RPC (security definer); never the client. The current
-- period's row is what gates a second check-in before the next weekly reset.
-- ---------------------------------------------------------------------------
create table if not exists public.rotation_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  game_id       uuid references public.games (id) on delete set null,
  game_title    text,
  coins_awarded integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists rotation_checkins_user_game_idx
  on public.rotation_checkins (user_id, game_id, created_at desc);

-- Read-own only; immutable + server-written, exactly like coin_events.
alter table public.rotation_checkins enable row level security;
revoke insert, update, delete on public.rotation_checkins from authenticated, anon;
drop policy if exists "rotation_checkins_select_own" on public.rotation_checkins;
create policy "rotation_checkins_select_own" on public.rotation_checkins
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Action undo: a short-lived, server-authoritative reversal record for the
-- one-way concluding moves (Finish/Complete, Retire, Convert to Endless). The
-- acting RPC snapshots the game's pre-action reversible state + the coins it
-- awarded into a row here; undo_action(p_undo) reads it back to revert the game,
-- roll back coins, and retract the activity-feed post — all within a short window.
-- Append-only + timestamped (per CLAUDE.md "capture history"): rows are never
-- updated except to stamp `undone_at` when consumed, and never deleted. Written
-- only by the security-definer RPCs; clients hold no write grants and read-own.
-- game_id `on delete set null` with a game_title snapshot so the record outlives
-- the game.
-- ---------------------------------------------------------------------------
create table if not exists public.action_undos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game_title  text,
  action      text not null check (action in ('finish', 'retire', 'convert_endless')),
  coins_delta integer not null default 0,
  prev        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  undone_at   timestamptz
);
create index if not exists action_undos_user_idx
  on public.action_undos (user_id, created_at desc);

-- Read-own only; immutable + server-written, exactly like coin_events.
alter table public.action_undos enable row level security;
revoke insert, update, delete on public.action_undos from authenticated, anon;
drop policy if exists "action_undos_select_own" on public.action_undos;
create policy "action_undos_select_own" on public.action_undos
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
  v_coins         integer;
  v_general       integer;
  v_rotation      integer;
  v_replay        integer;
  v_completionist integer;
begin
  -- The admin "default loadout": new accounts start with the configured capacity for
  -- each Now Playing lane (each falls back to its column default).
  select default_general_slots, default_rotation_slots,
         default_replay_slots, default_completionist_slots
    into v_general, v_rotation, v_replay, v_completionist
    from public.app_config where id = 1;

  insert into public.profiles
    (id, display_name, general_slots, rotation_slots, replay_slots, completionist_slots)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(v_general, 2),
    coalesce(v_rotation, 3),
    coalesce(v_replay, 2),
    coalesce(v_completionist, 2)
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
-- Rotation lane migration. The Rotation lane is now a single multi-occupant lane:
-- a per-user capacity (profiles.rotation_slots) holding any number of games marked
-- games.in_rotation — no longer a set of single-occupant Endless slots. This block
-- migrates an earlier Endless-slot-based rollout onto the new model, additively and
-- idempotently (safe to re-run), without dropping any user game/coin data.
-- ---------------------------------------------------------------------------
do $$
begin
  -- 1) Preserve capacity: no user ends up with fewer Rotation slots than the
  --    number of Endless slots they currently hold (so prior live-service games fit).
  update public.profiles p
     set rotation_slots = greatest(
       p.rotation_slots,
       (select count(*)
          from public.user_slots us
          join public.slot_definitions d on d.id = us.definition_id
         where us.user_id = p.id and d.kind = 'endless')
     );

  -- 2) Move every game currently parked in an Endless slot into the lane: flag it
  --    in_rotation and free its slot_id. The game never leaves Now Playing.
  update public.games g
     set in_rotation = true, slot_id = null
   where g.status = 'playing'
     and g.slot_id in (
       select us.id
         from public.user_slots us
         join public.slot_definitions d on d.id = us.definition_id
        where d.kind = 'endless'
     );

  -- 3) Retire the seeded "Rotation" Endless definition + the slots it auto-granted
  --    in the first rollout (this is reversing our own additive seed — those grants
  --    now hold no games). User-created Endless slots are left intact but unused.
  delete from public.user_slots us
   using public.slot_definitions d
   where us.definition_id = d.id and d.kind = 'endless' and d.name = 'Rotation';
  update public.slot_definitions
     set active = false, default_grant_count = 0
   where kind = 'endless' and name = 'Rotation';

  -- 4) Designate games already in the Rotation lane as live-service / ongoing, so
  --    they pick up the new ongoing behaviour (no price/bounty/finish). These were
  --    deliberately placed in Rotation, so they're ongoing by intent.
  update public.games set ongoing = true where in_rotation and not ongoing;
end $$;

-- ---------------------------------------------------------------------------
-- Lane fold-in migration. The rule-based targeted-slot system (slot_definitions +
-- user_slots, kinds standard/endless/replay, matched by length/genre/year) is
-- retired in favour of four fixed Now Playing lanes, each a per-user capacity count
-- + a per-game flag (see profiles.*_slots and the games flags). This block folds the
-- old model in additively + idempotently (safe to re-run) WITHOUT dropping any user
-- game/coin data: it only adds flags/links, preserves each lane's capacity via
-- greatest(...), and deactivates definitions (rows + grants are kept for history;
-- games.slot_id is freed but the column/tables remain as an audit trail).
-- ---------------------------------------------------------------------------
do $$
begin
  -- 1) Preserve Replay capacity: no user ends up with fewer Replay slots than the
  --    number of active Replay grants they currently hold (so prior replays fit).
  update public.profiles p
     set replay_slots = greatest(
       p.replay_slots,
       (select count(*)
          from public.user_slots us
          join public.slot_definitions d on d.id = us.definition_id
         where us.user_id = p.id and d.kind = 'replay' and d.active)
     );

  -- 2) Preserve Focus capacity: absorb every playing game sitting in a STANDARD
  --    targeted slot into the Focus lane without forcing any "over limit", by
  --    bumping general_slots to at least each user's current standard-slot load.
  update public.profiles p
     set general_slots = greatest(
       p.general_slots,
       (select count(*)
          from public.games g
          join public.user_slots us on us.id = g.slot_id
          join public.slot_definitions d on d.id = us.definition_id
         where g.user_id = p.id and g.status = 'playing' and d.kind = 'standard')
     );

  -- 3) Move every game in a REPLAY slot into the Replay lane: free its slot_id
  --    (resumed is already true, so it stays in Replay by precedence and re-finishing
  --    still pays the Replay Bonus). The game never leaves Now Playing.
  update public.games g
     set slot_id = null, resumed = true
   where g.status = 'playing'
     and g.slot_id in (
       select us.id
         from public.user_slots us
         join public.slot_definitions d on d.id = us.definition_id
        where d.kind = 'replay'
     );

  -- 4) Move every game in a STANDARD (or any remaining non-replay) targeted slot
  --    into the Focus lane: free its slot_id. Not resumed/completionist/in_rotation,
  --    so it lands in Focus by precedence.
  update public.games g
     set slot_id = null
   where g.status = 'playing' and g.slot_id is not null;

  -- 5) Retire the rule-based slot definitions: deactivate them and drop them from the
  --    default loadout. Rows + user_slots grants are kept for history; they hold no
  --    games now (every slot_id above was freed). The Now Playing lanes replace them.
  update public.slot_definitions set active = false, default_grant_count = 0;
end $$;

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

  -- Focus slot (the auto fallback, or the explicit p_general choice). A family
  -- counts once however many of its editions occupy a Focus slot. Only true Focus
  -- games count: the other lanes (Replay=resumed, Completionist, Rotation, Co-op)
  -- also hold slot_id null but occupy no Focus slot.
  select general_slots into v_general from public.profiles where id = v_uid;
  select count(distinct coalesce(family_id, id)) into v_gen_used
    from public.games
   where user_id = v_uid and status = 'playing' and slot_id is null
     and not in_rotation and not completionist and not resumed and not co_op;
  if v_gen_used >= coalesce(v_general, 2) then
    raise exception 'No open Now Playing slot';
  end if;
  return null;
end;
$$;

-- Returns the new coin balance plus the slot the game was placed in (null = a
-- general/Focus slot). Dropped first because the return type changed from integer.
drop function if exists public.apply_purchase(uuid, integer);
drop function if exists public.apply_purchase(uuid, integer, uuid);
drop function if exists public.apply_purchase(uuid, integer, uuid, boolean);
-- p_slot/p_general (optional): direct the purchase into a chosen slot, or force a
-- general slot. Null/false = auto-place (Focus). p_completionist (optional): buy the
-- game straight into the Completionist lane (capacity-checked against
-- completionist_slots) instead of Focus — a game you're committing to 100%-complete.
-- Dropped first: p_family_discount was added (a defaulted extra arg would
-- otherwise leave an ambiguous overload). Old deployed clients calling with
-- five args still resolve against the new signature.
drop function if exists public.apply_purchase(uuid, integer, uuid, boolean, boolean);
-- p_family_discount: the client priced this activation with the Family
-- Discount (another edition of the game's family is active/finished, so the
-- fee is the Replay-Bonus percentage of the full price — cost mirrors payout).
-- Ledger-only distinction: the coin event's kind becomes
-- 'family_discount_purchase' ("Family Discount Activation") instead of
-- 'purchase'. Price stays client-computed, like every activation.
-- p_coop: activate straight into the Co-op Pacts lane (uncapped, no Focus slot
-- consumed — like Rotation). Only respond_co_op_pact passes it; a pact accept
-- must never be blocked by a full Focus lane.
-- Dropped first: p_coop was added (a defaulted extra arg would otherwise
-- leave an ambiguous overload). Old deployed clients calling with six args
-- still resolve against the new signature.
drop function if exists public.apply_purchase(uuid, integer, uuid, boolean, boolean, boolean);
create or replace function public.apply_purchase(
  p_game uuid, p_price integer, p_slot uuid default null,
  p_general boolean default false, p_completionist boolean default false,
  p_family_discount boolean default false, p_coop boolean default false
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
  v_family    uuid;
  v_unit      uuid;
  v_cap       integer;
  v_used      integer;
  v_econ      boolean := public.economy_enabled(auth.uid());
begin
  -- Economy off: activation is FREE — the fee is forced to zero server-side
  -- (whatever a client passed), the balance stays frozen, and no ledger row is
  -- written. Everything else (gates, slots, lanes, the state change) is
  -- untouched. The stamp trigger marks the run started_economy_off so it can
  -- never pay a bounty later, even after toggling back on.
  if not v_econ then
    p_price := 0;
  end if;

  select title, family_id into v_title, v_family
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'backlog';
  if not found then
    raise exception 'Game not available to buy';
  end if;

  -- Story locking: a game with an unfinished prerequisite can't be started.
  perform public.assert_prerequisite_cleared(p_game);

  if coalesce(p_coop, false) then
    -- The Co-op Pacts lane: uncapped, no slot to pick or check.
    v_slot := null;
  elsif coalesce(p_completionist, false) then
    -- Buy straight into the Completionist lane: capacity-checked, no focus slot used.
    v_unit := coalesce(v_family, p_game);
    select completionist_slots into v_cap from public.profiles where id = auth.uid();
    select count(distinct coalesce(family_id, id)) into v_used
      from public.games
     where user_id = auth.uid() and status = 'playing' and completionist
       and coalesce(family_id, id) <> v_unit;
    if v_used >= coalesce(v_cap, 0) then
      raise exception 'Your Completionist lane is full';
    end if;
    v_slot := null;
  else
    v_slot := public.pick_start_slot(p_game, p_slot, p_general);
  end if;

  if v_econ then
    update public.profiles
       set coins = coins - p_price
     where id = auth.uid() and coins >= p_price
     returning coins into v_new_coins;

    if v_new_coins is null then
      raise exception 'Not enough coins';
    end if;
  else
    select coins into v_new_coins from public.profiles where id = auth.uid();
  end if;

  update public.games
     set status = 'playing', started_at = now(), price_paid = p_price,
         slot_id = v_slot,
         completionist = coalesce(p_completionist, false) and not coalesce(p_coop, false),
         co_op = coalesce(p_coop, false)
   where id = p_game and user_id = auth.uid() and status = 'backlog';

  if v_econ then
    perform public.log_coin_event(
      auth.uid(),
      case when coalesce(p_family_discount, false) then 'family_discount_purchase' else 'purchase' end,
      -p_price, 0, v_new_coins, null, p_game, v_title, null
    );
  end if;

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
  -- Economy off: activation is already free via apply_purchase — spending a
  -- hidden voucher would burn it for nothing, so the redemption is refused
  -- (the client hides this path entirely; this stops modified clients).
  if not public.economy_enabled(auth.uid()) then
    raise exception 'ECONOMY_OFF';
  end if;

  -- The game must be in the backlog (the only valid voucher pathway).
  select title into v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'backlog';
  if not found then
    raise exception 'Game not available to activate';
  end if;

  -- Story locking: a game with an unfinished prerequisite can't be started.
  perform public.assert_prerequisite_cleared(p_game);

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

-- Jumpstart Activation, up front: credit the starter vouchers when the caller
-- ENTERS the interactive Getting Started checklist — the tutorial teaches with
-- a real voucher on a real game (see OnboardingCoach). Guarded to exactly once
-- per tutorial phase: only while onboarding_vouchers_pending (fresh signup /
-- admin reset / Fresh Start) and only if never granted before
-- (onboarding_vouchers_granted_at null — complete_onboarding's compat grant
-- sets the same stamp). pending is deliberately NOT cleared here: it keeps
-- marking "tutorial unfinished" so the checklist survives reloads until
-- complete_onboarding. Idempotent: a re-call is a no-op that returns the
-- current voucher balance.
create or replace function public.claim_onboarding_vouchers()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_grant    integer;
  v_coins    integer;
  v_vouchers integer;
begin
  -- Economy off: nothing is granted (off-mode onboarding never promises
  -- vouchers); pending/granted_at stay untouched, so toggling back on during
  -- the tutorial phase lets the claim happen normally.
  if not public.economy_enabled(auth.uid()) then
    select vouchers into v_vouchers from public.profiles where id = auth.uid();
    return coalesce(v_vouchers, 0);
  end if;

  select onboarding_vouchers into v_grant from public.app_config where id = 1;
  v_grant := coalesce(v_grant, 2);

  update public.profiles
     set vouchers = vouchers + v_grant,
         onboarding_vouchers_granted_at = now()
   where id = auth.uid()
     and onboarding_vouchers_pending
     and onboarding_vouchers_granted_at is null
   returning coins, vouchers into v_coins, v_vouchers;

  if v_vouchers is null then
    -- Already claimed, or not in the tutorial phase: idempotent no-op.
    select vouchers into v_vouchers from public.profiles where id = auth.uid();
    return coalesce(v_vouchers, 0);
  end if;

  if v_grant > 0 then
    perform public.log_coin_event(
      auth.uid(), 'voucher_grant', 0, 0, v_coins, null, null, null,
      'Onboarding vouchers', '{}'::jsonb, v_grant, v_vouchers
    );
  end if;
  return v_vouchers;
end;
$$;

-- Mark the caller's onboarding walkthrough finished (or skipped). Completion is
-- stamped only the first time, and onboarding_vouchers_pending clears on EVERY
-- path (it marks the tutorial phase for the interactive checklist). The starter
-- vouchers normally arrive up front via claim_onboarding_vouchers() above; the
-- guarded grant kept here is the compat path — old clients that never call
-- claim, and skips straight from the welcome card — mutually exclusive with
-- the claim on onboarding_vouchers_granted_at, so re-completing (e.g. after an
-- admin reset) never double-grants and admin-granted accounts get nothing extra.
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_grant    integer;
  v_coins    integer;
  v_vouchers integer;
begin
  update public.profiles
     set onboarding_completed_at = coalesce(onboarding_completed_at, now())
   where id = auth.uid();

  -- Economy off: completion still stamps (below), but the compat voucher grant
  -- is skipped — off-mode onboarding never promises starter vouchers. The
  -- claim window (pending + granted_at) is left as-is.
  if public.economy_enabled(auth.uid()) then
    select onboarding_vouchers into v_grant from public.app_config where id = 1;
    v_grant := coalesce(v_grant, 2);

    -- Compat grant: exactly once, only if the up-front claim never happened.
    update public.profiles
       set vouchers = vouchers + v_grant,
           onboarding_vouchers_granted_at = now()
     where id = auth.uid()
       and onboarding_vouchers_pending
       and onboarding_vouchers_granted_at is null
     returning coins, vouchers into v_coins, v_vouchers;

    if v_vouchers is not null and v_grant > 0 then
      perform public.log_coin_event(
        auth.uid(), 'voucher_grant', 0, 0, v_coins, null, null, null,
        'Onboarding vouchers', '{}'::jsonb, v_grant, v_vouchers
      );
    end if;
  end if;

  -- The tutorial phase ends either way.
  update public.profiles
     set onboarding_vouchers_pending = false
   where id = auth.uid() and onboarding_vouchers_pending;
end;
$$;

-- Finish a game: flip status + award coins, atomically. The reward is decided
-- HERE so the client can't farm full payouts off linked editions: a finish pays
-- p_full_reward only if it's the FIRST clear in the game's family; once any
-- sibling edition is finished, subsequent clears pay the smaller p_replay_reward.
-- Returns the new balance, the coins actually awarded, and whether it was a
-- replay. Dropped first because the return type changed from integer to a table.
drop function if exists public.apply_finish(uuid, integer);
drop function if exists public.apply_finish(uuid, integer, integer);
-- p_completion_reward (optional): the Completion Bonus to pay when the game is in the
-- Completionist lane (games.completionist) — client-computed from the bounty + the
-- live completion_bonus_pct, mirroring how the Replay Bonus is passed. A completionist
-- finish pays its base (full bounty for a first clear, or 0 if it had already been
-- finished and was pulled back) PLUS the Completion Bonus, logged as a separate
-- 'completion_bonus' ledger row so it's independently auditable.
-- Dropped first because adding the undo_id output changes the RETURNS TABLE shape.
drop function if exists public.apply_finish(uuid, integer, integer, integer);
create or replace function public.apply_finish(
  p_game uuid, p_full_reward integer, p_replay_reward integer,
  p_completion_reward integer default 0
)
returns table (coins integer, reward integer, replay boolean, undo_id uuid)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_family       uuid;
  v_slot_id      uuid;
  v_resumed      boolean;
  v_completion   boolean;
  v_in_rotation  boolean;
  v_ongoing      boolean;
  v_finish_tag   text;
  v_started_at   timestamptz;
  v_price_paid   integer;
  v_replay       boolean;
  v_base         integer;
  v_bonus        integer;
  v_award        integer;
  v_coins        integer;
  v_title        text;
  v_undo         uuid;
  v_econ         boolean := public.economy_enabled(auth.uid());
  v_free_start   boolean;
begin
  -- Snapshot the pre-action reversible state (slot/lane flags + tag) so undo_action
  -- can restore the game exactly; the update below destroys these.
  select family_id, slot_id, title, resumed, completionist,
         in_rotation, ongoing, finish_tag, started_at, price_paid,
         coalesce(started_economy_off, false)
    into v_family, v_slot_id, v_title, v_resumed, v_completion,
         v_in_rotation, v_ongoing, v_finish_tag, v_started_at, v_price_paid,
         v_free_start
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'playing';
  if not found then
    raise exception 'Game not available to finish';
  end if;

  -- Replay (smaller/zero base) if another edition in the same family is already
  -- finished, OR the game is a resumed finished game (pulled back for free) — so a
  -- free replay can't farm a full bounty. The resumed flag carries the rule.
  v_replay := coalesce(v_resumed, false)
    or (v_family is not null and exists (
      select 1 from public.games g
       where g.user_id = auth.uid() and g.family_id = v_family
         and g.id <> p_game and g.status = 'finished'
    ));

  -- Base reward: a first-clear pays the full bounty; a replay/already-finished clear
  -- pays the Replay Bonus normally, but 0 when completing (the Completion Bonus is
  -- the reward for the extra 100% effort — no replay-bonus double-dip).
  if v_completion then
    v_base  := case when v_replay then 0 else greatest(0, coalesce(p_full_reward, 0)) end;
    v_bonus := greatest(0, coalesce(p_completion_reward, 0));
  else
    v_base  := case when v_replay then greatest(0, coalesce(p_replay_reward, 0))
                    else greatest(0, coalesce(p_full_reward, 0)) end;
    v_bonus := 0;
  end if;

  -- Economy off (or a run that was activated for free while it was off): the
  -- finish itself proceeds, but it pays nothing — now or ever. The stamp makes
  -- toggle farming (free-activate off, finish on) pay zero.
  if not v_econ or v_free_start then
    v_base  := 0;
    v_bonus := 0;
  end if;
  v_award := v_base + v_bonus;

  -- Finish tag for the Finished board: a completion run earns 'completed'; any other
  -- finish defaults to 'beaten' but preserves a tag the game already carried (so a
  -- replayed game keeps its prior narrative tag). A stale 'retired' tag never
  -- survives a REAL finish — beating a formerly-retired game is a fresh clear.
  update public.games
     set status = 'finished', finished_at = now(), reward = v_award, slot_id = null,
         resumed = false, in_rotation = false, completionist = false,
         finish_tag = case when v_completion then 'completed'
                           when finish_tag = 'retired' then 'beaten'
                           else coalesce(finish_tag, 'beaten') end
   where id = p_game and user_id = auth.uid() and status = 'playing';

  if v_econ and not v_free_start then
    update public.profiles
       set coins = coins + v_award
     where id = auth.uid()
     returning coins into v_coins;

    -- Base finish event (preserved for every normal finish; skipped only when a
    -- completing replay has a 0 base, to avoid a confusing 0-coin bounty row).
    if v_base > 0 or not v_completion then
      perform public.log_coin_event(
        auth.uid(),
        case when v_replay then 'replay_bonus' else 'bounty' end,
        v_base, 0, v_coins - v_bonus, null, p_game, v_title, null
      );
    end if;
    -- The Completion Bonus as its own auditable ledger row.
    if v_bonus > 0 then
      perform public.log_coin_event(
        auth.uid(), 'completion_bonus', v_bonus, 0, v_coins, null, p_game, v_title, null
      );
    end if;
  else
    -- Frozen balance, no ledger rows — the finish state still lands above.
    select coins into v_coins from public.profiles where id = auth.uid();
  end if;

  -- Record a short-lived undo snapshot: the pre-action state + coins awarded, so
  -- an accidental finish can be reverted in full (see undo_action).
  insert into public.action_undos (user_id, game_id, game_title, action, coins_delta, prev)
  values (
    auth.uid(), p_game, v_title, 'finish', v_award,
    jsonb_build_object(
      'status', 'playing', 'slot_id', v_slot_id, 'resumed', coalesce(v_resumed, false),
      'completionist', coalesce(v_completion, false), 'in_rotation', coalesce(v_in_rotation, false),
      'ongoing', coalesce(v_ongoing, false), 'finish_tag', v_finish_tag,
      'started_at', v_started_at, 'price_paid', v_price_paid,
      'finished_at', null, 'reward', null
    )
  )
  returning id into v_undo;

  return query select v_coins, v_award, v_replay, v_undo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rotation lane weekly check-in.
-- ---------------------------------------------------------------------------

-- The start of the current weekly Rotation period: the most recent moment that
-- matches the configured reset day-of-week + hour (in the configured timezone)
-- and is not in the future. A check-in "counts" for the period when it lands at
-- or after this boundary; the next reset is exactly 7 days later. STABLE (depends
-- on the timezone database), and mirrored client-side for the countdown display.
create or replace function public.rotation_period_start(
  p_now timestamptz, p_dow integer, p_hour integer, p_tz text
) returns timestamptz
language plpgsql
stable
as $$
declare
  v_tz        text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
  v_dow       integer := ((coalesce(p_dow, 0) % 7) + 7) % 7;  -- clamp to 0..6
  v_hour      integer := least(greatest(coalesce(p_hour, 0), 0), 23);
  v_local     timestamp;   -- wall-clock "now" in the configured timezone
  v_days_back integer;
  v_candidate timestamp;   -- wall-clock reset boundary in the configured timezone
begin
  v_local := p_now at time zone v_tz;
  -- This week's reset, at the configured hour, on the configured weekday.
  v_days_back := ((extract(dow from v_local)::int - v_dow) % 7 + 7) % 7;
  v_candidate := (date_trunc('day', v_local) + make_interval(hours => v_hour))
                 - make_interval(days => v_days_back);
  -- If that boundary hasn't happened yet (e.g. today is the reset day but before
  -- the reset hour), the current period actually began a week earlier.
  if v_candidate > v_local then
    v_candidate := v_candidate - interval '7 days';
  end if;
  return v_candidate at time zone v_tz;
end;
$$;

-- Reward the caller for a weekly "still playing" check-in on a Rotation-lane game.
-- The game must be one of the caller's, currently playing, and parked in an Endless
-- (Rotation) slot. Pays app_config.rotation_checkin_reward coins at most once per
-- weekly reset period (a prior check-in in the current period raises). Server-
-- authoritative: it appends the coin event + the rotation_checkins audit row, both
-- only reachable through this definer RPC. Returns the new balance + coins awarded.
create or replace function public.rotation_checkin(p_game uuid)
returns table (coins integer, awarded integer)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_title    text;
  v_reward   integer;
  v_dow      integer;
  v_hour     integer;
  v_tz       text;
  v_period   timestamptz;
  v_coins    integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Must be the caller's game, playing, and in the Rotation lane.
  select g.title into v_title
    from public.games g
   where g.id = p_game and g.user_id = auth.uid()
     and g.status = 'playing' and g.in_rotation;
  if not found then
    raise exception 'Game is not in your Rotation lane';
  end if;

  select rotation_checkin_reward, rotation_reset_dow, rotation_reset_hour, rotation_reset_tz
    into v_reward, v_dow, v_hour, v_tz
    from public.app_config where id = 1;
  v_reward := greatest(coalesce(v_reward, 0), 0);
  -- Economy off: the weekly "still playing" ritual (and its history row below)
  -- stays, but it pays nothing and the frozen balance is untouched.
  if not public.economy_enabled(auth.uid()) then
    v_reward := 0;
  end if;
  v_period := public.rotation_period_start(now(), coalesce(v_dow, 0), coalesce(v_hour, 0), v_tz);

  -- One reward per reset period: a check-in already logged since the boundary blocks.
  if exists (
    select 1 from public.rotation_checkins
     where user_id = auth.uid() and game_id = p_game and created_at >= v_period
  ) then
    raise exception 'Already checked in for this reset';
  end if;

  if v_reward > 0 then
    update public.profiles
       set coins = coins + v_reward
     where id = auth.uid()
     returning coins into v_coins;

    perform public.log_coin_event(
      auth.uid(), 'rotation_checkin', v_reward, 0, v_coins, null, p_game, v_title, 'Rotation check-in'
    );
  else
    select coins into v_coins from public.profiles where id = auth.uid();
  end if;

  insert into public.rotation_checkins (user_id, game_id, game_title, coins_awarded)
  values (auth.uid(), p_game, v_title, v_reward);

  return query select v_coins, v_reward;
end;
$$;

-- Move a game into the Rotation lane for FREE. Works from the backlog (start it
-- there), from Now Playing (move it in from a focus slot), or from Finished (resume
-- it — re-finishing then pays the smaller Replay Bonus). No coins move: Rotation
-- games are live-service/ongoing titles that earn via the weekly check-in, not a
-- buy price or finish bounty. The lane is UNCAPPED (2026-07-05): a scarcity cap
-- never gated anything meaningful for live-service play — the weekly check-in
-- reward is flat per game, so unlimited occupancy grants no exploit. The
-- profiles.rotation_slots column stays (data preserved, no longer enforced).
-- slot_id is cleared (a Rotation game holds no focus slot and never counts
-- against general/targeted capacity).
create or replace function public.enter_rotation(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status  text;
  v_family  uuid;
  v_ongoing boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status, family_id, ongoing into v_status, v_family, v_ongoing
    from public.games
   where id = p_game and user_id = auth.uid();
  if not found then
    raise exception 'Game not found';
  end if;
  -- The Rotation lane is for live-service / ongoing games only.
  if not coalesce(v_ongoing, false) then
    raise exception 'Only live-service games can enter the Rotation lane';
  end if;
  -- Parked (backlog), already playing, or finished — a retired endless game
  -- (concluded to Finished) can be pulled back into Rotation.
  if v_status not in ('backlog', 'playing', 'finished') then
    raise exception 'Game cannot enter the Rotation lane';
  end if;
  -- Story locking applies to the cold start only (backlog → Rotation); a game
  -- already playing or previously finished is exempt.
  if v_status = 'backlog' then
    perform public.assert_prerequisite_cleared(p_game);
  end if;

  -- An ongoing game enters the lane for free (price_paid 0). It's parked (backlog),
  -- already playing in a focus slot, or finished (a retired endless game); either way
  -- it lands as playing + in_rotation, with any finish state cleared. The provenance
  -- stamps (RHS reads the pre-update row) let "Remove from Rotation" send it back
  -- where it came from.
  update public.games
     set status               = 'playing',
         in_rotation          = true,
         slot_id              = null,
         started_at           = case when status <> 'playing' then now() else started_at end,
         price_paid           = 0,
         resumed              = false,
         finished_at          = null,
         reward               = null,
         rotation_origin      = status,
         pre_rotation_ongoing = coalesce(ongoing, false)
   where id = p_game and user_id = auth.uid()
     and status in ('backlog', 'playing', 'finished');
end;
$$;

-- Remove an ongoing game from the Rotation lane, back to its parked (backlog)
-- state. Free and reversible — ongoing games are never "finished" and have no buy
-- price, so no coins move. The inverse of enter_rotation.
create or replace function public.exit_rotation(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.games
     set status = 'backlog', in_rotation = false, slot_id = null,
         started_at = null, price_paid = null
   where id = p_game and user_id = auth.uid()
     and status = 'playing' and in_rotation;
  if not found then
    raise exception 'Game is not in your Rotation lane';
  end if;
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

  -- The game must be one of the caller's finished games. A RETIRED game is not
  -- replayable for free — it goes back to the Bazaar and is bought again
  -- (see apply_retire).
  if not exists (
    select 1 from public.games
     where id = p_game and user_id = auth.uid() and status = 'finished'
       and coalesce(finish_tag, '') <> 'retired'
  ) then
    raise exception 'Game not available to replay';
  end if;

  -- The slot must be the caller's, active, and either a Replay or an Endless slot.
  -- A finished game can be pulled back into a Replay slot, or *resumed* into an
  -- Endless slot (for ongoing/live-service games) — both free. Standard slots
  -- can't take a finished game this way (they're for newly-started games).
  select d.kind into v_kind
    from public.user_slots us
    join public.slot_definitions d on d.id = us.definition_id
   where us.id = p_slot and us.user_id = auth.uid() and d.active;
  if v_kind is null then
    raise exception 'Slot not found';
  end if;
  if v_kind not in ('replay', 'endless') then
    raise exception 'A finished game can only resume into a Replay or Endless slot';
  end if;

  -- The slot must be open (single-occupant).
  if exists (
    select 1 from public.games g where g.slot_id = p_slot and g.status = 'playing'
  ) then
    raise exception 'Slot already in use';
  end if;

  -- Mark it resumed so re-finishing pays the Replay Bonus regardless of slot kind
  -- (an Endless slot isn't a Replay slot, so the flag is what carries the rule).
  update public.games
     set status = 'playing', started_at = now(), price_paid = 0,
         finished_at = null, reward = null, slot_id = p_slot, resumed = true
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

  -- Any resumed game (a finished game pulled back for free, in a Replay or
  -- Endless slot) can be sent straight back to Finished. The slot-kind check
  -- stays for pre-flag replay-slot games.
  if not exists (
    select 1
      from public.games g
      left join public.user_slots us on us.id = g.slot_id
      left join public.slot_definitions d on d.id = us.definition_id
     where g.id = p_game and g.user_id = auth.uid() and g.status = 'playing'
       and (coalesce(g.resumed, false) or d.kind = 'replay')
  ) then
    raise exception 'Game is not a resumed game';
  end if;

  update public.games
     set status = 'finished', finished_at = now(), slot_id = null, resumed = false,
         in_rotation = false
   where id = p_game and user_id = auth.uid() and status = 'playing';
end;
$$;

-- ---------------------------------------------------------------------------
-- Replay & Completionist lanes (capacity + flag, mirroring the Rotation lane).
-- ---------------------------------------------------------------------------

-- Pull a FINISHED game back into the Replay lane for FREE (replaces the old grant-
-- based apply_replay). The lane is multi-occupant up to profiles.replay_slots (a
-- linked family counts as one occupant). The game flips finished → playing, marked
-- resumed so re-finishing pays the smaller Replay Bonus (see apply_finish); its
-- finished_at/reward are cleared (the games_log_status trigger already captured the
-- original finish, so the history survives). No coins move — the game is fully owned.
create or replace function public.enter_replay(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_family uuid;
  v_unit   uuid;
  v_cap    integer;
  v_used   integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status, family_id into v_status, v_family
    from public.games
   where id = p_game and user_id = auth.uid();
  if not found then raise exception 'Game not found'; end if;
  if v_status <> 'finished' then
    raise exception 'Only a finished game can enter the Replay lane';
  end if;
  v_unit := coalesce(v_family, p_game);

  -- Capacity: distinct occupant units already in the lane, excluding this one.
  select replay_slots into v_cap from public.profiles where id = auth.uid();
  select count(distinct coalesce(family_id, id)) into v_used
    from public.games
   where user_id = auth.uid() and status = 'playing' and resumed
     and not completionist and not in_rotation
     and coalesce(family_id, id) <> v_unit;
  if v_used >= coalesce(v_cap, 0) then
    raise exception 'Your Replay lane is full';
  end if;

  update public.games
     set status = 'playing', started_at = now(), price_paid = 0,
         finished_at = null, reward = null, slot_id = null,
         resumed = true, completionist = false, in_rotation = false
   where id = p_game and user_id = auth.uid() and status = 'finished';
end;
$$;

-- Move a game into the Completionist lane — a game you're working to 100%-complete.
-- Works from Now Playing (flip a game you're already playing in) or from Finished
-- (pull it back to complete it, marked resumed so the bounty isn't re-paid). Buying a
-- backlog game straight into the lane goes through apply_purchase(p_completionist) so
-- the price is charged. Free here (no buy). The lane is multi-occupant up to
-- profiles.completionist_slots (a linked family counts once). slot_id is cleared.
create or replace function public.enter_completionist(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status  text;
  v_family  uuid;
  v_ongoing boolean;
  v_tag     text;
  v_unit    uuid;
  v_cap     integer;
  v_used    integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status, family_id, ongoing, finish_tag into v_status, v_family, v_ongoing, v_tag
    from public.games
   where id = p_game and user_id = auth.uid();
  if not found then raise exception 'Game not found'; end if;
  if coalesce(v_ongoing, false) then
    raise exception 'Live-service games belong in the Rotation lane';
  end if;
  if v_status not in ('playing', 'finished') then
    raise exception 'Game cannot enter the Completionist lane';
  end if;
  -- A RETIRED game has no free way back into play: returning it to the Bazaar
  -- and re-buying at full price is the only path (see apply_retire).
  if v_status = 'finished' and v_tag = 'retired' then
    raise exception 'A retired game must be returned to the Bazaar and bought again';
  end if;
  v_unit := coalesce(v_family, p_game);

  -- Capacity: distinct occupant units already in the lane, excluding this one.
  select completionist_slots into v_cap from public.profiles where id = auth.uid();
  select count(distinct coalesce(family_id, id)) into v_used
    from public.games
   where user_id = auth.uid() and status = 'playing' and completionist
     and coalesce(family_id, id) <> v_unit;
  if v_used >= coalesce(v_cap, 0) then
    raise exception 'Your Completionist lane is full';
  end if;

  -- From finished: pull it back (resumed=true so completing pays the bonus only). From
  -- playing: keep started_at/price_paid/resumed; just flag it completionist.
  update public.games
     set status        = 'playing',
         completionist = true,
         in_rotation   = false,
         slot_id       = null,
         resumed       = case when status = 'finished' then true else resumed end,
         started_at    = case when status = 'finished' then now() else started_at end,
         price_paid    = case when status = 'finished' then 0 else price_paid end,
         finished_at   = null,
         reward        = null
   where id = p_game and user_id = auth.uid()
     and status in ('playing', 'finished');
end;
$$;

-- Leave the Completionist lane without finishing: clear the flag. The game stays
-- playing and falls back by precedence (Replay if it's a resumed game, else Focus).
-- Free and reversible — the inverse of enter_completionist for a playing game.
create or replace function public.exit_completionist(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.games
     set completionist = false
   where id = p_game and user_id = auth.uid()
     and status = 'playing' and completionist;
  if not found then
    raise exception 'Game is not in your Completionist lane';
  end if;
end;
$$;

-- Abandon a 100% run: conclude a Completionist-lane game straight back to Finished
-- without pursuing full mastery. Only valid for a game that was ALREADY finished
-- before the run (resumed = true) — it has a Finished state to return to; a
-- never-beaten game would be marked finished prematurely (the client shelves those to
-- the Bazaar instead). Earns NO coins and is tagged 'beaten' (campaign cleared,
-- mastery aborted). The games_log_status trigger records the playing → finished move.
create or replace function public.abandon_completion(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.games
     set status = 'finished', finished_at = now(), completionist = false,
         resumed = false, in_rotation = false, slot_id = null,
         finish_tag = 'beaten'
   where id = p_game and user_id = auth.uid()
     and status = 'playing' and completionist and resumed;
  if not found then
    raise exception 'Only a previously-finished game can be abandoned to Finished';
  end if;
end;
$$;

-- Retire an ongoing game from the Rotation lane: conclude it to Finished (it's done).
-- Earns NO coins (Rotation games earn via the weekly check-in, not a bounty). Tagged
-- 'endless' UNLESS it already carries a narrative tag — a hybrid game (a finished
-- 'beaten'/'completed' game later converted to Endless) keeps that tag (the Monster
-- Hunter rule). The pre-lane archetype is restored from pre_rotation_ongoing: a
-- standard finished game that was converted into the lane sheds the inherited
-- live-service traits (no more weekly check-in) and is a normal finished game
-- again, while a native live-service game stays ongoing (re-enterable). Distinct
-- from exit_rotation, which parks it back to the Bazaar.
-- Dropped first because the undo_id return changes the signature's return type.
drop function if exists public.retire_rotation(uuid);
create or replace function public.retire_rotation(p_game uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_title      text;
  v_finish_tag text;
  v_resumed    boolean;
  v_completion boolean;
  v_slot_id    uuid;
  v_ongoing    boolean;
  v_started_at timestamptz;
  v_price_paid integer;
  v_undo       uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  -- Snapshot the pre-action Rotation state so undo_action can restore it exactly.
  select title, finish_tag, resumed, completionist, slot_id, ongoing, started_at, price_paid
    into v_title, v_finish_tag, v_resumed, v_completion, v_slot_id, v_ongoing, v_started_at, v_price_paid
    from public.games
   where id = p_game and user_id = auth.uid()
     and status = 'playing' and in_rotation;
  if not found then
    raise exception 'Game is not in your Rotation lane';
  end if;

  update public.games
     set status = 'finished', finished_at = now(), in_rotation = false,
         resumed = false, completionist = false, slot_id = null,
         finish_tag = coalesce(finish_tag, 'endless'),
         ongoing = coalesce(pre_rotation_ongoing, ongoing)
   where id = p_game and user_id = auth.uid()
     and status = 'playing' and in_rotation;

  insert into public.action_undos (user_id, game_id, game_title, action, coins_delta, prev)
  values (
    auth.uid(), p_game, v_title, 'retire', 0,
    jsonb_build_object(
      'status', 'playing', 'slot_id', v_slot_id, 'resumed', coalesce(v_resumed, false),
      'completionist', coalesce(v_completion, false), 'in_rotation', true,
      'ongoing', coalesce(v_ongoing, false), 'finish_tag', v_finish_tag,
      'started_at', v_started_at, 'price_paid', v_price_paid,
      'finished_at', null, 'reward', null
    )
  )
  returning id into v_undo;
  return v_undo;
end;
$$;

-- Convert a FINISHED game into an ongoing Rotation game (the post-game "Convert to
-- Endless" route). Marks it ongoing and drops it into the Rotation lane for free,
-- capacity-checked against profiles.rotation_slots. Its earned finish_tag is preserved
-- (so retiring it later keeps 'beaten'/'completed' — the hybrid rule). No coins move.
-- Dropped first because the undo_id return changes the signature's return type.
drop function if exists public.convert_to_endless(uuid);
create or replace function public.convert_to_endless(p_game uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_status      text;
  v_family      uuid;
  v_title       text;
  v_finish_tag  text;
  v_ongoing     boolean;
  v_slot_id     uuid;
  v_started_at  timestamptz;
  v_price_paid  integer;
  v_finished_at timestamptz;
  v_reward      integer;
  v_undo        uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Snapshot the pre-action Finished state so undo_action can restore it exactly.
  select status, family_id, title, finish_tag, ongoing, slot_id,
         started_at, price_paid, finished_at, reward
    into v_status, v_family, v_title, v_finish_tag, v_ongoing, v_slot_id,
         v_started_at, v_price_paid, v_finished_at, v_reward
    from public.games
   where id = p_game and user_id = auth.uid();
  if not found then raise exception 'Game not found'; end if;
  if v_status <> 'finished' then
    raise exception 'Only a finished game can be converted to Endless';
  end if;
  -- A RETIRED game never converts to Endless — that would grant free Rotation
  -- check-in income to an admitted non-clear. Back to the Bazaar and re-buy
  -- (see apply_retire).
  if v_finish_tag = 'retired' then
    raise exception 'A retired game must be returned to the Bazaar and bought again';
  end if;
  -- The Rotation lane is uncapped (see enter_rotation) — no capacity gate here.

  -- Provenance: entered from Finished, and remember whether it was ongoing before
  -- so leaving the lane restores its pre-conversion archetype (a converted standard
  -- game sheds the live-service traits again — the conversion is fully reversible).
  update public.games
     set status = 'playing', in_rotation = true, ongoing = true, slot_id = null,
         completionist = false, resumed = false,
         started_at = now(), price_paid = 0, finished_at = null, reward = null,
         rotation_origin = 'finished', pre_rotation_ongoing = coalesce(ongoing, false)
   where id = p_game and user_id = auth.uid() and status = 'finished';

  insert into public.action_undos (user_id, game_id, game_title, action, coins_delta, prev)
  values (
    auth.uid(), p_game, v_title, 'convert_endless', 0,
    jsonb_build_object(
      'status', 'finished', 'slot_id', v_slot_id, 'resumed', false,
      'completionist', false, 'in_rotation', false, 'ongoing', coalesce(v_ongoing, false),
      'finish_tag', v_finish_tag, 'started_at', v_started_at, 'price_paid', v_price_paid,
      'finished_at', v_finished_at, 'reward', v_reward
    )
  )
  returning id into v_undo;
  return v_undo;
end;
$$;

-- Reverse a recent concluding action (Finish/Complete, Retire, Convert to Endless)
-- from its action_undos snapshot. Server-authoritative so the coin rollback can't be
-- forged: it restores the game's exact prior lane/flags, deducts the coins the action
-- awarded (logging an append-only reversal ledger row — the original bounty row is
-- preserved), and retracts the activity-feed post the action emitted. Guarded by a
-- short grace window (slightly longer than the client's 15s timer to tolerate latency)
-- and a conflict check that refuses if the game has since changed. Single-use: the row
-- is stamped `undone_at`. Returns the caller's new coin balance.
create or replace function public.undo_action(p_undo uuid)
returns table (coins integer)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_user      uuid;
  v_game      uuid;
  v_title     text;
  v_action    text;
  v_delta     integer;
  v_prev      jsonb;
  v_created   timestamptz;
  v_status    text;
  v_rotation  boolean;
  v_ok        boolean;
  v_coins     integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select user_id, game_id, game_title, action, coins_delta, prev, created_at
    into v_user, v_game, v_title, v_action, v_delta, v_prev, v_created
    from public.action_undos
   where id = p_undo and user_id = auth.uid() and undone_at is null;
  if not found then
    raise exception 'Nothing to undo';
  end if;

  -- A short grace window — wider than the client's 15s timer so latency/clock skew
  -- never wrongly rejects a click the user made in time.
  if now() - v_created > interval '30 seconds' then
    raise exception 'Undo window expired';
  end if;

  -- Conflict guard: the game must still be in the exact state the action left it in;
  -- if the user has touched it since, refuse rather than clobber the new state.
  select status, in_rotation into v_status, v_rotation
    from public.games where id = v_game and user_id = auth.uid();
  if not found then
    raise exception 'Can''t undo — the game has changed since';
  end if;
  if v_action in ('finish', 'retire') then
    v_ok := v_status = 'finished';
  else -- convert_endless
    v_ok := v_status = 'playing' and coalesce(v_rotation, false);
  end if;
  if not v_ok then
    raise exception 'Can''t undo — the game has changed since';
  end if;

  -- Suppress the activity-feed emit for the reversal's own writes (a convert undo
  -- restores status='finished', which would otherwise post a spurious bounty card).
  perform set_config('app.undo_in_progress', '1', true);

  -- Restore the game from the snapshot.
  update public.games
     set status        = v_prev->>'status',
         slot_id       = (v_prev->>'slot_id')::uuid,
         resumed       = (v_prev->>'resumed')::boolean,
         completionist = (v_prev->>'completionist')::boolean,
         in_rotation   = (v_prev->>'in_rotation')::boolean,
         ongoing       = (v_prev->>'ongoing')::boolean,
         finish_tag    = v_prev->>'finish_tag',
         started_at    = (v_prev->>'started_at')::timestamptz,
         price_paid    = (v_prev->>'price_paid')::integer,
         finished_at   = (v_prev->>'finished_at')::timestamptz,
         reward        = (v_prev->>'reward')::integer
   where id = v_game and user_id = auth.uid();

  -- Milestones are user-curated display data, so the auto rows the undone
  -- action itself just spawned go with it (the finish that never was). Tightly
  -- scoped: this game, auto-source, created since the action. The GUC above
  -- keeps the restore write itself from logging a fresh milestone.
  delete from public.game_milestones
   where game_id = v_game and user_id = auth.uid()
     and source = 'auto' and created_at >= v_created;

  -- Roll back the coins the action awarded (append-only reversal row; the original
  -- bounty/completion rows stay for the audit trail).
  if coalesce(v_delta, 0) <> 0 then
    update public.profiles
       set coins = coins - v_delta
     where id = auth.uid()
     returning coins into v_coins;
    perform public.log_coin_event(
      auth.uid(), 'undo_finish', -v_delta, 0, v_coins, null, v_game, v_title, 'Undo'
    );
  else
    select coins into v_coins from public.profiles where id = auth.uid();
  end if;

  -- Retract the activity-feed post the action emitted (a *→finished move posts a
  -- bounty_claimed card; within the window it can't have been cheered yet).
  delete from public.activity_events
   where actor = auth.uid() and game_id = v_game
     and kind = 'bounty_claimed' and created_at >= v_created;

  update public.action_undos set undone_at = now() where id = p_undo;

  return query select v_coins;
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
     set status = 'backlog', started_at = null, price_paid = null, slot_id = null,
         in_rotation = false
   where id = p_game;

  select shelve_refund_pct into v_pct from public.app_config where id = 1;
  v_pct := greatest(0, least(100, coalesce(v_pct, 50)));
  v_refund := greatest(0, round(coalesce(v_price, 0) * v_pct / 100.0))::integer;
  -- The forfeited remainder of what you paid (the Bazaar's cut) — recorded on the
  -- event so "Sunk Costs" is a direct sum.
  v_forfeit := greatest(0, coalesce(v_price, 0) - v_refund);

  -- Economy off: the shelve proceeds but nothing is refunded — the freeze wins
  -- (usually moot: an off-activation cost 0). Disclosed in the toggle explainer.
  if not public.economy_enabled(auth.uid()) then
    select coins into v_coins from public.profiles where id = auth.uid();
    return query select v_coins, 0;
    return;
  end if;

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

-- "Retire It": permanently drop a game the player is done with — out of the
-- active Bazaar/lanes and onto the Finished shelf under the 'retired' tag — so
-- abandoning a game that isn't clicking never requires faking a 'Beaten'.
-- Salvage: retiring a game straight from a Now Playing lane refunds the SAME
-- shelve_refund_pct of price_paid that Shelve It pays (one consistent
-- quit-without-finishing rate — no shelve-first arbitrage); a Bazaar game has
-- no coins at stake (price_paid only exists while playing), so its salvage is
-- 0 and the move is purely organizational. Never pays a bounty. The refund is
-- server-computed from price_paid (the actual sunk coins, so it can't be
-- inflated and free/voucher/rotation entries with price_paid = 0 salvage
-- nothing), logged as a 'salvage_refund' coin event ("Dropped Game Salvage").
-- Returning to play later means a full-price re-buy from the Bazaar — the
-- retired tag is excluded from every free re-entry path (apply_replay,
-- enter_completionist), so a salvage can only ever follow a fresh full-price
-- purchase (each retire cycle is a net coin sink, never a faucet). The
-- games_capture_milestone trigger records the 'retired' milestone and
-- games_log_status the transition.
create or replace function public.apply_retire(p_game uuid)
returns table (coins integer, refund integer)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_status  text;
  v_price   integer;
  v_pct     integer;
  v_refund  integer;
  v_forfeit integer;
  v_coins   integer;
  v_title   text;
begin
  select status, price_paid, title into v_status, v_price, v_title
    from public.games
   where id = p_game and user_id = auth.uid()
     and status in ('backlog', 'playing')
   for update;

  if not found then
    raise exception 'Game not available to retire';
  end if;

  update public.games
     set status = 'finished', finish_tag = 'retired', finished_at = now(),
         reward = null, started_at = null, price_paid = null, slot_id = null,
         in_rotation = false, completionist = false, resumed = false
   where id = p_game;

  -- Salvage only when coins were actually sunk (a playing game's price_paid).
  select shelve_refund_pct into v_pct from public.app_config where id = 1;
  v_pct := greatest(0, least(100, coalesce(v_pct, 50)));
  v_refund := case when v_status = 'playing'
                   then greatest(0, round(coalesce(v_price, 0) * v_pct / 100.0))::integer
                   else 0 end;
  v_forfeit := case when v_status = 'playing'
                    then greatest(0, coalesce(v_price, 0) - v_refund)
                    else 0 end;

  -- Economy off: the retire proceeds but salvage pays nothing (freeze wins).
  if not public.economy_enabled(auth.uid()) then
    select coins into v_coins from public.profiles where id = auth.uid();
    return query select v_coins, 0;
    return;
  end if;

  update public.profiles
     set coins = coins + v_refund
   where id = auth.uid()
   returning coins into v_coins;

  perform public.log_coin_event(
    auth.uid(), 'salvage_refund', v_refund, 0, v_coins, null, p_game, v_title, null,
    jsonb_build_object('forfeit', v_forfeit, 'price_paid', coalesce(v_price, 0),
                       'from_status', v_status)
  );

  return query select v_coins, v_refund;
end;
$$;

-- ---------------------------------------------------------------------------
-- Import Charters: buy / sell / consume. All security definer + atomic, all log
-- to the coin_events ledger, and all read their prices from app_config (server-
-- authoritative, so the client can't dictate cost/resale).
-- ---------------------------------------------------------------------------

-- Buy one Import Charter: spend charter_cost coins, gain one charter. p_floor is
-- the Overdraft Guard floor — the buy price of the cheapest game currently in the
-- buyer's Bazaar (computed client-side, where the price formula lives). A charter
-- is an OPTIONAL spend, so it's refused when the buyer has NO active income game
-- (playing and not live-service/ongoing) AND the purchase would drop their balance
-- below that floor — i.e. it would soft-lock them out of starting any game. The
-- active-game count is computed here (server-authoritative); p_floor defaults to 0
-- (guard off) so older clients still work. Raises 'SOFT_LOCK' when it would lock.
-- Signature changed (added p_floor), so the old no-arg version is dropped first.
drop function if exists public.buy_charter();
create or replace function public.buy_charter(p_floor integer default 0)
returns table (coins integer, charters integer)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_cost   integer;
  v_coins  integer;
  v_charts integer;
  v_active integer;
begin
  -- Economy off: charters are a pure currency op — refused outright.
  if not public.economy_enabled(auth.uid()) then
    raise exception 'ECONOMY_OFF';
  end if;

  select charter_cost into v_cost from public.app_config where id = 1;
  v_cost := greatest(0, coalesce(v_cost, 100));

  -- Overdraft Guard: only relevant with a real floor and no income game in play.
  if coalesce(p_floor, 0) > 0 then
    select count(*) into v_active
      from public.games
     where user_id = auth.uid() and status = 'playing' and not coalesce(ongoing, false);
    if coalesce(v_active, 0) = 0 then
      select coins into v_coins from public.profiles where id = auth.uid();
      if coalesce(v_coins, 0) - v_cost < p_floor then
        raise exception 'SOFT_LOCK';
      end if;
    end if;
  end if;

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
  -- Economy off: charters are a pure currency op — refused outright.
  if not public.economy_enabled(auth.uid()) then
    raise exception 'ECONOMY_OFF';
  end if;

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
-- Playing (the "double gate").
--
-- v2 (2026-07-02, merge-on-import): when the imported wishlist game is already
-- owned as a standalone copy (same shared catalog identity — rawg_id, else
-- catalog_id for community games), the wishlist entry's not-yet-owned versions
-- are appended to the owned card and the wishlist row is removed, instead of
-- creating a duplicate card. The charter spend, ledger row, and activity-feed
-- post are unchanged either way. The RETURNS shape changed (integer → table),
-- so the old function is dropped first; the v1 definition was removed from this
-- spot entirely (a stale `create or replace returns integer` here would 42P13
-- on every re-run once v2 exists — the file must stay safe to re-run).
-- v3 (2026-07-19, pre-order imports — issue fe5f7f54): importing a wishlist
-- game that isn't out yet can place it as a PRE-ORDER in one atomic step —
-- p_preorder marks the landed backlog row (preordered_at + the expected date)
-- and stamps preorder_charter, the server-only provenance flag that refunds
-- the charter if the order later falls through (see the Pre-orders section).
-- The flag write rides the txn-local app.charter_import GUC past the shaping
-- trigger's client-write gate. The merge path ignores the pre-order ask: an
-- already-owned card is not a locked pre-order. Old (uuid) signature dropped —
-- a live overload pair would make PostgREST calls ambiguous.
drop function if exists public.import_with_charter(uuid);
create or replace function public.import_with_charter(
  p_game uuid,
  p_preorder boolean default false,
  p_expected_on date default null
)
returns table (charters integer, merged_into uuid, merged_copies jsonb)
language plpgsql
security definer set search_path = public
as $$
declare
  v_title   text;
  v_rawg    bigint;
  v_catalog uuid;
  v_copies  jsonb;
  v_coins   integer;
  v_charts  integer;
  v_target  uuid;
  v_merged  jsonb;
  v_copy    jsonb;
  v_econ    boolean := public.economy_enabled(auth.uid());
begin
  select g.title, g.rawg_id, g.catalog_id, coalesce(g.copies, '[]'::jsonb)
    into v_title, v_rawg, v_catalog, v_copies
    from public.games g
   where g.id = p_game and g.user_id = auth.uid() and g.status = 'wishlist'
     for update;
  if not found then
    raise exception 'Game not available to import';
  end if;

  if v_econ then
    update public.profiles
       set charters = profiles.charters - 1
     where id = auth.uid() and profiles.charters >= 1
     returning coins, profiles.charters into v_coins, v_charts;

    if v_charts is null then
      raise exception 'No charters available';
    end if;
  else
    -- Economy off: the import is free — no charter spent, no ledger row, and a
    -- pre-order placed this way carries preorder_charter = false so a later
    -- cancel can never mint a charter that was never paid.
    select coins, profiles.charters into v_coins, v_charts
      from public.profiles where id = auth.uid();
  end if;

  -- The owned standalone card for the same catalog game, if any. Mirrors the
  -- client's catalogKey precedence: a rawg-backed game matches on rawg_id; a
  -- community game (no rawg_id) matches only rows that are also rawg-less.
  -- Compilation children are never targets (their economics belong to the
  -- bundle). Per-platform instances: the target must own EVERY platform the
  -- wishlist entry lists (post-split entries list exactly one, so this is
  -- "the same platform's card"; a platform-less want matches any owned card).
  -- With no covering card the entry flips to backlog as its own instance —
  -- a foreign platform is never smeared onto another platform's card.
  -- Mirrors mergeWishlistIntoOwned in src/lib/addRouting.ts.
  select g.id into v_target
    from public.games g
   where g.user_id = auth.uid() and g.id <> p_game
     and g.compilation_id is null
     and g.status in ('backlog', 'playing', 'finished')
     and ((v_rawg is not null and g.rawg_id = v_rawg)
       or (v_rawg is null and v_catalog is not null
           and g.rawg_id is null and g.catalog_id = v_catalog))
     and not exists (
       select 1 from jsonb_array_elements(v_copies) c
        where btrim(coalesce(c->>'platform', '')) <> ''
          and not exists (
            select 1 from jsonb_array_elements(coalesce(g.copies, '[]'::jsonb)) t
             where btrim(coalesce(t->>'platform', '')) = btrim(c->>'platform')
          )
     )
   order by case g.status when 'playing' then 3 when 'finished' then 2 else 1 end desc,
            g.added_at asc, g.id asc
   limit 1
   for update;

  if v_target is null then
    -- No owned copy: the classic import — the wishlist row itself moves into
    -- the Bazaar (status trigger logs the move; emit_game_activity posts the
    -- game_imported milestone). A pre-order import lands the same row marked
    -- and locked, with the charter-refund provenance flag stamped in the same
    -- write (the GUC opens the shaping trigger's gate for it).
    if p_preorder then
      if v_econ then
        perform set_config('app.charter_import', 'on', true);
      end if;
      update public.games
         set status = 'backlog',
             preordered_at = now(),
             preorder_expected_on = p_expected_on,
             preorder_charter = v_econ
       where id = p_game and user_id = auth.uid();
      if v_econ then
        perform set_config('app.charter_import', '', true);
      end if;
    else
      update public.games set status = 'backlog'
       where id = p_game and user_id = auth.uid();
    end if;

    if v_econ then
      perform public.log_coin_event(
        auth.uid(), 'charter_consume', 0, -1, v_coins, v_charts, p_game, v_title, null
      );
    end if;

    return query select v_charts, null::uuid, null::jsonb;
    return;
  end if;

  -- Merge: append the wishlist entry's versions the owned card doesn't already
  -- have. A copy CONFLICTS with an existing one on the same trimmed platform
  -- when the formats match or either side has none (a format-less copy is
  -- ambiguous and could be the one already owned) — mirrors versionsConflict in
  -- src/lib/copies.ts. Blank platforms are dropped.
  select coalesce(g.copies, '[]'::jsonb) into v_merged
    from public.games g where g.id = v_target;
  for v_copy in select * from jsonb_array_elements(v_copies)
  loop
    if btrim(coalesce(v_copy->>'platform', '')) = '' then
      continue;
    end if;
    if not exists (
      select 1 from jsonb_array_elements(v_merged) t
       where btrim(coalesce(t->>'platform', '')) = btrim(v_copy->>'platform')
         and (coalesce(t->>'format', '') = ''
           or coalesce(v_copy->>'format', '') = ''
           or t->>'format' = v_copy->>'format')
    ) then
      v_merged := v_merged || jsonb_build_array(v_copy);
    end if;
  end loop;

  -- The copies update is audited by games_log_copies as usual.
  update public.games set copies = v_merged where id = v_target;

  -- Ledger row references the surviving card (the wishlist row is about to go),
  -- with the wishlist title snapshot preserved either way.
  if v_econ then
    perform public.log_coin_event(
      auth.uid(), 'charter_consume', 0, -1, v_coins, v_charts, v_target, v_title, null
    );
  end if;

  -- Remove the redundant wishlist row (log_game_status_event audits the delete
  -- with a title snapshot; FKs elsewhere are on delete set null).
  delete from public.games where id = p_game and user_id = auth.uid();

  -- Feed parity: the merge path never fires the wishlist→backlog UPDATE that
  -- emit_game_activity listens for, so post the import milestone explicitly.
  insert into public.activity_events (actor, kind, game_id, game_title)
  values (auth.uid(), 'game_imported', v_target, v_title);

  return query select v_charts, v_target, v_merged;
end;
$$;

grant execute on function public.import_with_charter(uuid, boolean, date) to authenticated;

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
    -- Moving back to a Focus slot: one must be free (not counting this unit, and not
    -- counting the other lanes — Replay/Completionist/Rotation hold slot_id null but
    -- occupy no Focus slot).
    select general_slots into v_general from public.profiles where id = auth.uid();
    select count(distinct coalesce(family_id, id)) into v_gen_used
      from public.games
     where user_id = auth.uid() and status = 'playing' and slot_id is null
       and not in_rotation and not completionist and not resumed
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
  -- linked family keeps sharing exactly one slot. Moving to a focus slot also
  -- leaves the Rotation lane (the game now occupies a real slot).
  update public.games
     set slot_id = p_slot, in_rotation = false
   where user_id = auth.uid() and status = 'playing'
     and coalesce(family_id, id) = v_unit;
end;
$$;

-- Link two of your games into one "Game Family" (editions/remasters of the same
-- core title), merging their existing families if either already had one. Both
-- games must belong to the caller. Idempotent if they're already linked.
--
-- p_primary (unified family card, 2026-07-05): the member the family card
-- renders and routes data to. REQUIRED when this link mints a brand-new family
-- (the client prompts before saving); when adding to an existing family it may
-- be null (the family's current primary stands). When given it must be one of
-- the caller's games in the resulting family. A Now Playing edition may only
-- join as the primary — otherwise its live run would be hidden behind the card
-- while silently holding a slot.
-- Dropped first: p_primary was added (a defaulted extra arg would otherwise
-- leave an ambiguous overload).
drop function if exists public.link_games(uuid, uuid);
create or replace function public.link_games(
  p_game    uuid,
  p_other   uuid,
  p_primary uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_a_fam    uuid;
  v_b_fam    uuid;
  v_fam      uuid;
  v_primary  uuid;
  v_name     text;
  v_playing  uuid;
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

  -- Resolve the primary: an explicit choice wins; otherwise the family's stored
  -- primary stands. A brand-new family MUST choose (legacy families created
  -- before primaries exist keep null and the client's implicit fallback).
  if p_primary is not null then
    select id into v_primary
      from public.games
     where id = p_primary and user_id = auth.uid() and family_id = v_fam;
    if not found then raise exception 'Primary must be a member of the family'; end if;
  else
    select family_primary_game_id into v_primary
      from public.games
     where user_id = auth.uid() and family_id = v_fam
       and family_primary_game_id is not null
     limit 1;
    if v_primary is null and v_a_fam is null and v_b_fam is null then
      raise exception 'A new family needs a primary member';
    end if;
    -- The stored pointer must still be a live member (merges can import a
    -- family whose primary was since deleted).
    if v_primary is not null and not exists (
      select 1 from public.games
       where id = v_primary and user_id = auth.uid() and family_id = v_fam
    ) then
      v_primary := null;
    end if;
  end if;

  -- A hidden Now Playing sibling would hold a slot invisibly: at most one
  -- member may be playing, and if one is, it must be the primary (or, for a
  -- legacy family with no stored primary, the implicit representative — which
  -- IS the playing member, so that case passes by construction).
  select id into v_playing
    from public.games
   where user_id = auth.uid() and family_id = v_fam and status = 'playing'
   order by added_at limit 1;
  if v_playing is not null then
    if exists (
      select 1 from public.games
       where user_id = auth.uid() and family_id = v_fam
         and status = 'playing' and id <> v_playing
    ) then
      raise exception 'Only one Now Playing edition can be in a family';
    end if;
    if v_primary is not null and v_primary <> v_playing then
      raise exception 'A Now Playing edition must be the family''s primary member';
    end if;
  end if;

  if v_primary is not null then
    update public.games
       set family_primary_game_id = v_primary
     where user_id = auth.uid() and family_id = v_fam;
  end if;

  -- Audit: one row per link action (capture-everything).
  select coalesce(min(family_name), min(title)) into v_name
    from public.games where user_id = auth.uid() and family_id = v_fam;
  insert into public.family_events (user_id, family_id, family_name, event_type, detail)
  select auth.uid(), v_fam, v_name, 'member_linked',
         jsonb_build_object(
           'game_id', p_game, 'game_title', a.title,
           'other_id', p_other, 'other_title', b.title,
           'primary_game_id', v_primary)
    from public.games a, public.games b
   where a.id = p_game and b.id = p_other;

  -- Activity feed: broadcast only when this forms a genuinely NEW family (both
  -- editions were previously unlinked) — adding a 3rd edition to an existing
  -- family shouldn't re-fire. Snapshot the first game's title for the post.
  if v_a_fam is null and v_b_fam is null then
    insert into public.activity_events (actor, kind, game_id, game_title)
    select auth.uid(), 'family_created', p_game, title
      from public.games where id = p_game and user_id = auth.uid();
  end if;

  return v_fam;
end;
$$;

-- Remove one of your games from its family. If that leaves a single lonely
-- member, the remaining member is unlinked too (a family of one is meaningless)
-- and its denormalized family fields are cleared. Unlinking the PRIMARY clears
-- the pointer across the survivors — the client's implicit representative
-- fallback fronts the card until a new primary is designated.
create or replace function public.unlink_game(p_game uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_fam       uuid;
  v_title     text;
  v_name      text;
  v_remaining integer;
begin
  select family_id, title into v_fam, v_title
    from public.games where id = p_game and user_id = auth.uid();
  if not found then raise exception 'Game not found'; end if;
  if v_fam is null then return; end if;

  select coalesce(min(family_name), min(title)) into v_name
    from public.games where user_id = auth.uid() and family_id = v_fam;

  update public.games
     set family_id = null, family_name = null, family_image = null,
         family_cover_game_id = null, family_split = false,
         family_primary_game_id = null
   where id = p_game and user_id = auth.uid();

  -- If the departed game was the survivors' primary, fall back to implicit.
  update public.games
     set family_primary_game_id = null
   where user_id = auth.uid() and family_id = v_fam
     and family_primary_game_id = p_game;

  insert into public.family_events (user_id, family_id, family_name, event_type, detail)
  values (auth.uid(), v_fam, v_name, 'member_unlinked',
          jsonb_build_object('game_id', p_game, 'game_title', v_title));

  select count(*) into v_remaining
    from public.games where user_id = auth.uid() and family_id = v_fam;
  if v_remaining <= 1 then
    update public.games
       set family_id = null, family_name = null, family_image = null,
           family_cover_game_id = null, family_split = false,
           family_primary_game_id = null
     where user_id = auth.uid() and family_id = v_fam;
  end if;
end;
$$;

-- Set or clear the cover shown on a family's focused board card. Owner-only,
-- self-gated like unlink_game. Exactly one of p_image / p_cover_game is
-- expected (both null clears back to the automatic representative cover):
--   p_image      — a covers-bucket public URL the client uploaded first
--                  (like set_compilation_parent_image); wins over p_cover_game.
--   p_cover_game — a member edition whose LIVE cover the card should follow.
-- Writes every member row atomically (the columns are denormalized like
-- family_name) and logs ONE family_events row. Purely cosmetic.
create or replace function public.set_family_cover(
  p_family     uuid,
  p_image      text default null,
  p_cover_game uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_image text := nullif(btrim(coalesce(p_image, '')), '');
  v_name  text;
  v_title text;
begin
  select coalesce(min(family_name), min(title)) into v_name
    from public.games where user_id = auth.uid() and family_id = p_family;
  if v_name is null then raise exception 'Family not found'; end if;

  if p_cover_game is not null then
    select title into v_title
      from public.games
     where id = p_cover_game and user_id = auth.uid() and family_id = p_family;
    if not found then raise exception 'Game not found'; end if;
  end if;

  update public.games
     set family_image = v_image,
         family_cover_game_id = p_cover_game
   where user_id = auth.uid() and family_id = p_family;

  insert into public.family_events (user_id, family_id, family_name, event_type, detail)
  values (
    auth.uid(), p_family, v_name,
    case
      when v_image is not null then 'cover_uploaded'
      when p_cover_game is not null then 'cover_member'
      else 'cover_cleared'
    end,
    case
      when p_cover_game is not null
        then jsonb_build_object('cover_game_id', p_cover_game, 'cover_game_title', v_title)
      else '{}'::jsonb
    end
  );
end;
$$;

-- Toggle a family between the focused single-card rendering (split = false,
-- the default) and separate per-edition cards (split = true). Same shape as
-- set_family_cover: owner-only, all member rows at once, one audit row.
create or replace function public.set_family_split(
  p_family uuid,
  p_split  boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  select coalesce(min(family_name), min(title)) into v_name
    from public.games where user_id = auth.uid() and family_id = p_family;
  if v_name is null then raise exception 'Family not found'; end if;

  update public.games
     set family_split = coalesce(p_split, false)
   where user_id = auth.uid() and family_id = p_family;

  insert into public.family_events (user_id, family_id, family_name, event_type)
  values (auth.uid(), p_family, v_name,
          case when coalesce(p_split, false) then 'split' else 'focused' end);
end;
$$;

-- Re-designate a family's PRIMARY member ("Set as primary"). DESIGNATION ONLY
-- (2026-07-05 v2, zero-migration rework): absolutely no data moves — historical
-- playtime, notes and milestones stay permanently on the record that earned
-- them, the unified card sums playtime across members client-side, and only
-- NEW logging routes to the new primary from here on. The card's board/status
-- follow the new primary's own status.
-- One guard: the outgoing primary may not be mid-run (Now Playing). Under zero
-- migration the run can't transfer, so reassigning away from it would leave a
-- hidden row silently holding the family's slot and sunk activation fee —
-- shelve (refund), finish, or retire it first.
-- Owner-only, self-gated; one 'primary_changed' audit row carries from/to.
-- (The v1 full-handoff body lived here for a few hours on 2026-07-05; its
-- hours/milestone migration is deliberately gone — see issue 521a6a1d.)
create or replace function public.set_family_primary(
  p_family uuid,
  p_game   uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_new_title  text;
  v_old_id     uuid;
  v_old_title  text;
  v_old_status text;
  v_name       text;
begin
  select title into v_new_title
    from public.games
   where id = p_game and user_id = auth.uid() and family_id = p_family;
  if not found then raise exception 'Game not found'; end if;

  select coalesce(min(family_name), min(title)) into v_name
    from public.games where user_id = auth.uid() and family_id = p_family;

  -- The outgoing primary: the stored designation if it's still a member, else
  -- the implicit representative (most-active, tie-broken by earliest added —
  -- mirrors representativeMember in src/lib/families.ts).
  select g.family_primary_game_id into v_old_id
    from public.games g
   where g.user_id = auth.uid() and g.family_id = p_family
     and g.family_primary_game_id is not null
   limit 1;
  if v_old_id is not null and not exists (
    select 1 from public.games
     where id = v_old_id and user_id = auth.uid() and family_id = p_family
  ) then
    v_old_id := null;
  end if;
  if v_old_id is null then
    select id into v_old_id
      from public.games
     where user_id = auth.uid() and family_id = p_family
     order by case status
                when 'playing'  then 3
                when 'backlog'  then 2
                when 'wishlist' then 1
                else 0
              end desc, added_at asc
     limit 1;
  end if;

  select title, status into v_old_title, v_old_status
    from public.games where id = v_old_id;

  if v_old_id is distinct from p_game and v_old_status = 'playing' then
    raise exception '% is Now Playing — shelve, finish or retire it before changing the primary',
      v_old_title;
  end if;

  update public.games
     set family_primary_game_id = p_game
   where user_id = auth.uid() and family_id = p_family;

  insert into public.family_events (user_id, family_id, family_name, event_type, detail)
  values (auth.uid(), p_family, v_name, 'primary_changed',
          jsonb_build_object(
            'from_game_id', v_old_id, 'from_title', v_old_title,
            'to_game_id', p_game, 'to_title', v_new_title));
end;
$$;

-- Sever a family entirely ("Sever Family Link"): every member returns to the
-- library as an individual, standalone card — statuses, hours, milestones and
-- ledger history all stay exactly where they sit; only the relational bond and
-- the denormalized family fields are cleared. One 'severed' audit row carries
-- the roster snapshot (the family's uuid never reforms, so this is the
-- family's tombstone).
create or replace function public.sever_family(p_family uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
begin
  select coalesce(min(family_name), min(title)) into v_name
    from public.games where user_id = auth.uid() and family_id = p_family;
  if v_name is null then raise exception 'Family not found'; end if;

  insert into public.family_events (user_id, family_id, family_name, event_type, detail)
  select auth.uid(), p_family, v_name, 'severed',
         jsonb_build_object('members', jsonb_agg(
           jsonb_build_object('game_id', g.id, 'game_title', g.title)))
    from public.games g
   where g.user_id = auth.uid() and g.family_id = p_family;

  update public.games
     set family_id = null, family_name = null, family_image = null,
         family_cover_game_id = null, family_split = false,
         family_primary_game_id = null
   where user_id = auth.uid() and family_id = p_family;
end;
$$;

-- ---------------------------------------------------------------------------
-- Compilations: create a financial-container purchase plus one standalone child
-- game per bundled title, atomically. The container may own SEVERAL copies
-- (p_copies = [{platform, format, cost, note?}], like games.copies); each child
-- element may carry its own `copies` array (its cent-exact slice of every
-- container copy, computed client-side) — costs are informational only, never
-- the coin economy. Old clients that still send the single p_platform/p_format/
-- p_total and per-child scalar `cost` get the legacy single-copy behavior.
-- Returns the inserted game rows so the client can append them without a
-- refetch.
-- ---------------------------------------------------------------------------

-- Rebuild a client-sent copies array with fresh server-side ids and trimmed
-- fields (shared by the compilation RPCs). Not granted anywhere special —
-- pure jsonb massage, safe for any caller.
create or replace function public.normalize_copies(p jsonb)
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',       gen_random_uuid()::text,
    'platform', nullif(btrim(coalesce(e->>'platform', '')), ''),
    'format',   nullif(btrim(coalesce(e->>'format', '')), ''),
    -- How you have it (owned/subscription/borrowed/player2) + the service,
    -- lender or whose copy the Player 2 seat is on. A plain "owned" stays
    -- implicit (null), and a provider only rides along a modifier copy —
    -- mirrors rowsToCopies on the client.
    'acquisition', (case when e->>'acquisition' in ('subscription', 'borrowed', 'player2')
                        then e->>'acquisition' end),
    'provider', (case when e->>'acquisition' in ('subscription', 'borrowed', 'player2')
                      then nullif(btrim(coalesce(e->>'provider', '')), '') end),
    -- A Player 2 copy is someone else's: any cost is dropped server-side so it
    -- can never inflate the library's spend metrics (issue 3eb956ff).
    'cost',     case when e->>'acquisition' = 'player2' then null
                     else nullif(e->>'cost', '')::numeric end,
    'note',     nullif(btrim(coalesce(e->>'note', '')), '')
  ))), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e
$$;

-- Dropped first: p_copies/p_released were added (multi-copy compilations); a
-- defaulted extra arg would otherwise leave an ambiguous overload.
drop function if exists public.create_compilation(text, numeric, text, text, text, jsonb, uuid);
create or replace function public.create_compilation(
  p_title    text,
  p_total    numeric,
  p_platform text,
  p_format   text,
  p_status   text,
  p_children jsonb,
  p_template uuid default null,
  p_copies   jsonb default null,
  p_released date  default null
)
returns setof public.games
language plpgsql
security definer set search_path = public
as $$
declare
  v_comp_id   uuid;
  v_copies    jsonb;
  v_total     numeric;
  v_child     jsonb;
  v_child_id  uuid;
  v_child_ids uuid[] := '{}';
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

  -- Container copies: the multi-copy array when sent, else the legacy single
  -- copy synthesized from the scalar args (old clients keep working).
  if p_copies is not null and jsonb_typeof(p_copies) = 'array'
     and jsonb_array_length(p_copies) > 0 then
    v_copies := public.normalize_copies(p_copies);
    select coalesce(sum((e->>'cost')::numeric), 0) into v_total
      from jsonb_array_elements(v_copies) e where e ? 'cost';
  else
    v_copies := public.normalize_copies(jsonb_build_array(jsonb_build_object(
      'platform', p_platform, 'format', p_format,
      'cost', case when coalesce(p_total, 0) <> 0 then p_total::text else null end)));
    v_total := coalesce(p_total, 0);
  end if;

  insert into public.compilations
    (user_id, title, total_cost, platform, format, template_id, copies, released)
  values (auth.uid(), btrim(p_title), v_total,
          v_copies->0->>'platform',
          v_copies->0->>'format',
          (select t.id from public.compilation_templates t where t.id = p_template),
          v_copies, p_released)
  returning id into v_comp_id;

  -- Insert the children one by one IN THE REQUEST'S ORDER, collecting the new
  -- ids: that order is the bundle's natural order (as entered / as the linked
  -- template lists them), persisted below as child_order so the parent-card
  -- checklist, the split cards and the ledger all read the same sequence from
  -- the first render (issue 140ac868). Without it there is no order at all —
  -- same-batch children share one now() added_at, so the games load query
  -- (added_at desc) returns them arbitrarily.
  for v_child in
    select c from jsonb_array_elements(p_children) with ordinality as t(c, ord)
     where coalesce(btrim(c->>'name'), '') <> ''
     order by t.ord
  loop
    insert into public.games
      (user_id, title, hours, genres, image, stock_image, original_image, rawg_id,
       released, metacritic, platforms, developers, esrb, catalog_id, status, copies,
       compilation_id, compilation_name, finished_at, played_hours)
    values (
      auth.uid(),
      btrim(v_child->>'name'),
      nullif(v_child->>'hours', '')::real,
      public.canonical_genre_terms(v_child->'genres'),
      nullif(v_child->>'image', ''),
      nullif(v_child->>'image', ''),
      nullif(v_child->>'image', ''),
      nullif(v_child->>'rawg_id', '')::integer,
      -- Fill-blanks release date: the child's own (catalog) date always wins; the
      -- container's date only covers children that arrive without one.
      coalesce(nullif(v_child->>'released', '')::date, p_released),
      nullif(v_child->>'metacritic', '')::integer,
      public.canonical_platform_terms(v_child->'platforms'),
      coalesce(v_child->'developers', '[]'::jsonb),
      nullif(v_child->>'esrb', ''),
      nullif(v_child->>'catalog_id', '')::uuid,
      coalesce(nullif(v_child->>'status', ''), p_status),
      case when v_child ? 'copies' and jsonb_typeof(v_child->'copies') = 'array'
                and jsonb_array_length(v_child->'copies') > 0
           then public.normalize_copies(v_child->'copies')
           else jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
             'id', gen_random_uuid()::text,
             'platform', nullif(btrim(coalesce(p_platform, '')), ''),
             'format', nullif(btrim(coalesce(p_format, '')), ''),
             'cost', nullif(v_child->>'cost', '')::numeric
           ))) end,
      v_comp_id,
      btrim(p_title),
      case when coalesce(nullif(v_child->>'status', ''), p_status) = 'finished'
           then now() else null end,
      0
    )
    returning id into v_child_id;
    v_child_ids := v_child_ids || v_child_id;
  end loop;

  update public.compilations set child_order = v_child_ids
   where id = v_comp_id and user_id = auth.uid();

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  values (auth.uid(), v_comp_id, 'created', btrim(p_title), v_total,
          jsonb_array_length(p_children));

  -- Rows come back in the same natural order, so the client's optimistic state
  -- agrees with child_order before any reload.
  return query
    select g.* from public.games g
      join unnest(v_child_ids) with ordinality as ord(id, k) on g.id = ord.id
     order by ord.k;
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

-- Edit a compilation: update the container (title/copies/release date) and
-- reconcile its games against p_children. Each child carries an optional
-- 'game_id': present = an existing child to update (its title, length and cost
-- copies), absent = a newly added game to insert. Existing children NOT listed
-- are removed (a user-initiated deletion from the editor). Existing children
-- keep their own image/genres — only newly added ones take the picked metadata,
-- so editing never clobbers a child's customizations. A child may carry an
-- explicit 'status' (Bazaar/Finished) to move that game; absent it, status is
-- left as-is. The container release date FILLS children without one, never
-- overwrites. Returns the resulting rows. Dropped first: p_copies/p_released
-- were added (a defaulted extra arg would otherwise leave an ambiguous
-- overload).
drop function if exists public.update_compilation(uuid, text, numeric, text, text, jsonb);
create or replace function public.update_compilation(
  p_id       uuid,
  p_title    text,
  p_total    numeric,
  p_platform text,
  p_format   text,
  p_children jsonb,
  p_copies   jsonb default null,
  p_released date  default null
)
returns setof public.games
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid       uuid;
  v_copies    jsonb;
  v_total     numeric;
  v_child     jsonb;
  v_child_id  uuid;
  v_child_ids uuid[] := '{}';
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

  -- Container copies: multi-copy array when sent, else the legacy single copy
  -- from the scalar args (old clients keep working).
  if p_copies is not null and jsonb_typeof(p_copies) = 'array'
     and jsonb_array_length(p_copies) > 0 then
    v_copies := public.normalize_copies(p_copies);
    select coalesce(sum((e->>'cost')::numeric), 0) into v_total
      from jsonb_array_elements(v_copies) e where e ? 'cost';
  else
    v_copies := public.normalize_copies(jsonb_build_array(jsonb_build_object(
      'platform', p_platform, 'format', p_format,
      'cost', case when coalesce(p_total, 0) <> 0 then p_total::text else null end)));
    v_total := coalesce(p_total, 0);
  end if;

  update public.compilations
     set title = btrim(p_title),
         copies = v_copies,
         released = p_released,
         total_cost = v_total,
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
     -- Fill-blanks release date: never overwrite a date the child already has.
     released = coalesce(g.released, p_released),
     copies = case when c ? 'copies' and jsonb_typeof(c->'copies') = 'array'
                        and jsonb_array_length(c->'copies') > 0
                   then public.normalize_copies(c->'copies')
                   else jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                     'id', gen_random_uuid()::text,
                     'platform', nullif(btrim(coalesce(p_platform, '')), ''),
                     'format', nullif(btrim(coalesce(p_format, '')), ''),
                     'cost', nullif(c->>'cost', '')::numeric
                   ))) end
  from jsonb_array_elements(p_children) c
  where coalesce(c->>'game_id', '') <> ''
    and g.id = (c->>'game_id')::uuid
    and g.user_id = auth.uid()
    and g.compilation_id = p_id;

  -- Walk the editor's rows IN ORDER: existing children contribute their id,
  -- newly added games (no game_id) are inserted one by one so their new ids
  -- land exactly where the editor listed them. The collected sequence becomes
  -- the bundle's persisted child_order below (issue 140ac868). New children
  -- take their chosen landing status (Bazaar/Finished), defaulting to the
  -- Bazaar; existing children keep their own status untouched (updated above).
  for v_child in
    select c from jsonb_array_elements(p_children) with ordinality as t(c, ord)
     order by t.ord
  loop
    if coalesce(v_child->>'game_id', '') <> '' then
      v_child_ids := v_child_ids || (v_child->>'game_id')::uuid;
    elsif coalesce(btrim(v_child->>'name'), '') <> '' then
      insert into public.games
        (user_id, title, hours, genres, image, stock_image, original_image, rawg_id,
         released, metacritic, platforms, developers, esrb, catalog_id, status, copies,
         compilation_id, compilation_name, finished_at, played_hours)
      values (
        auth.uid(),
        btrim(v_child->>'name'),
        nullif(v_child->>'hours', '')::real,
        public.canonical_genre_terms(v_child->'genres'),
        nullif(v_child->>'image', ''),
        nullif(v_child->>'image', ''),
        nullif(v_child->>'image', ''),
        nullif(v_child->>'rawg_id', '')::integer,
        coalesce(nullif(v_child->>'released', '')::date, p_released),
        nullif(v_child->>'metacritic', '')::integer,
        public.canonical_platform_terms(v_child->'platforms'),
        coalesce(v_child->'developers', '[]'::jsonb),
        nullif(v_child->>'esrb', ''),
        nullif(v_child->>'catalog_id', '')::uuid,
        coalesce(nullif(v_child->>'status', ''), 'backlog'),
        case when v_child ? 'copies' and jsonb_typeof(v_child->'copies') = 'array'
                  and jsonb_array_length(v_child->'copies') > 0
             then public.normalize_copies(v_child->'copies')
             else jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'id', gen_random_uuid()::text,
               'platform', nullif(btrim(coalesce(p_platform, '')), ''),
               'format', nullif(btrim(coalesce(p_format, '')), ''),
               'cost', nullif(v_child->>'cost', '')::numeric
             ))) end,
        p_id,
        btrim(p_title),
        case when coalesce(nullif(v_child->>'status', ''), 'backlog') = 'finished'
             then now() else null end,
        0
      )
      returning id into v_child_id;
      v_child_ids := v_child_ids || v_child_id;
    end if;
  end loop;

  -- Persist the editor's row order as the bundle's display order. Defensive
  -- like set_compilation_child_order: only ids that are genuinely this
  -- bundle's children are stored — a stale/foreign game_id is dropped.
  update public.compilations
     set child_order = (
       select array_agg(x order by ord)
         from unnest(v_child_ids) with ordinality as t(x, ord)
        where x in (select id from public.games
                     where compilation_id = p_id and user_id = auth.uid())
     )
   where id = p_id and user_id = auth.uid();

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  values (auth.uid(), p_id, 'updated', btrim(p_title), v_total,
          jsonb_array_length(p_children));

  -- Rows come back in the saved order (any child somehow missing from it sinks
  -- to the end) so the client's optimistic state matches the next reload.
  return query
    select g.* from public.games g
      left join unnest(v_child_ids) with ordinality as ord(id, k) on g.id = ord.id
     where g.compilation_id = p_id and g.user_id = auth.uid()
     order by coalesce(ord.k, 2147483647), g.title;
end;
$$;

-- Toggle a compilation between its expanded board view (individual child cards)
-- and the collapsed rollup card. Pure presentation state — it NEVER touches
-- games.status, so no status/activity triggers fire and nothing moves lanes
-- server-side (the collapsed card's lane is derived client-side from the
-- children). Collapsing is refused while a child is in Now Playing: a card
-- holding a slot must never silently vanish from its lane.
create or replace function public.set_compilation_expanded(
  p_id       uuid,
  p_expanded boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid      uuid;
  v_title    text;
  v_expanded boolean;
begin
  select user_id, title, expanded into v_uid, v_title, v_expanded
    from public.compilations where id = p_id for update;
  if not found or v_uid <> auth.uid() then
    raise exception 'Compilation not found';
  end if;
  if v_expanded = coalesce(p_expanded, true) then
    return; -- already in that state
  end if;
  if not coalesce(p_expanded, true) and exists (
    select 1 from public.games
     where compilation_id = p_id and user_id = auth.uid() and status = 'playing'
  ) then
    raise exception 'Finish or shelve the Now Playing game in this bundle first';
  end if;

  update public.compilations
     set expanded = coalesce(p_expanded, true)
   where id = p_id and user_id = auth.uid();

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  select auth.uid(), p_id,
         case when coalesce(p_expanded, true) then 'expanded' else 'collapsed' end,
         v_title, c.total_cost,
         (select count(*) from public.games g
           where g.compilation_id = p_id and g.user_id = auth.uid())
    from public.compilations c where c.id = p_id;
end;
$$;

-- Set the owner's chosen display order for a bundle's child games
-- (compilations.child_order), an ordered array of games.id (issue 140ac868).
-- Owner-only, self-gated like set_compilation_expanded (compilations carry no
-- client write grants). Defensive: only ids that are genuinely this owner's
-- children are stored, keeping the request's order — foreign/stale ids are
-- dropped. Purely a display order: never touches the economy or any child card.
create or replace function public.set_compilation_child_order(
  p_id    uuid,
  p_order uuid[]
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid   uuid;
  v_title text;
begin
  select user_id, title into v_uid, v_title
    from public.compilations where id = p_id for update;
  if not found or v_uid <> auth.uid() then
    raise exception 'Compilation not found';
  end if;

  update public.compilations
     set child_order = (
       -- Keep the request's order, but only real children of this bundle.
       select array_agg(x order by ord)
         from unnest(coalesce(p_order, '{}'::uuid[])) with ordinality as t(x, ord)
        where x in (
          select id from public.games
           where compilation_id = p_id and user_id = auth.uid()
        )
     )
   where id = p_id and user_id = auth.uid();

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  select auth.uid(), p_id, 'reordered', v_title, c.total_cost,
         (select count(*) from public.games g
           where g.compilation_id = p_id and g.user_id = auth.uid())
    from public.compilations c where c.id = p_id;
end;
$$;

-- Set or clear the cover shown on a compilation's collapsed parent card
-- (compilations.parent_image). Owner-only (self-gated like
-- set_compilation_expanded — compilations carry no client write grants). The
-- client uploads the blob to the 'covers' bucket first and passes the public
-- URL; null/blank clears it, falling back to the first child's cover in the
-- rollup. Purely cosmetic: never touches the shared catalog or any child card.
create or replace function public.set_compilation_parent_image(
  p_id    uuid,
  p_image text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.compilations
     set parent_image = nullif(btrim(coalesce(p_image, '')), '')
   where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'Compilation not found';
  end if;
end;
$$;

-- Expand a single owned game card into a full compilation, atomically, using the
-- moderator-linked shared template (compilation_templates.parent_catalog_id).
-- The parent card is converted, never merely deleted — everything it carried is
-- preserved on the new container:
--   - its copies' total USD cost becomes the container's total_cost AND is split
--     evenly (to the cent) across the children's cost copies;
--   - its logged played_hours become the container's carryover_hours (bundle-
--     level; never force-attributed to one child);
--   - its cover becomes parent_image (the collapsed card's art);
--   - a STARTED parent's activation fee (price_paid) is refunded in full — the
--     children each have their own buy→play→finish coin loop from here on;
--   - a FINISHED parent's children arrive as finished (its earned bounty stands).
-- The parent games row is then deleted (the status-events DELETE trigger audits
-- it with a title snapshot; coin/playtime event FKs are on delete set null).
-- Returns the new balance, the refund, and the inserted child rows as jsonb.
create or replace function public.expand_game_to_compilation(
  p_game     uuid,
  p_template uuid
)
returns table (coins integer, refund integer, children jsonb)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  g          public.games%rowtype;
  t          public.compilation_templates%rowtype;
  v_n        integer;
  v_pc_n     integer;
  v_total    numeric;
  v_platform text;
  v_format   text;
  v_comp_id   uuid;
  v_refund    integer := 0;
  v_coins     integer;
  v_children  jsonb;
  v_tpl       record;
  v_child_id  uuid;
  v_child_ids uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into g from public.games
   where id = p_game and user_id = auth.uid() for update;
  if not found then raise exception 'Game not found'; end if;
  if g.status = 'wishlist' then
    raise exception 'You don''t own this yet — import it before expanding';
  end if;
  if g.compilation_id is not null then
    raise exception 'This game is already part of a compilation';
  end if;

  select * into t from public.compilation_templates where id = p_template;
  if not found or t.parent_catalog_id is null then
    raise exception 'No compilation is linked to this game';
  end if;
  -- The owned card must actually BE the linked parent game (by catalog identity).
  if not (
    g.catalog_id = t.parent_catalog_id
    or (g.rawg_id is not null and g.rawg_id = (
          select c.rawg_id from public.catalog_games c where c.id = t.parent_catalog_id))
  ) then
    raise exception 'This game doesn''t match the linked compilation';
  end if;

  select count(*) into v_n from jsonb_array_elements(t.games) e
   where coalesce(btrim(e->>'name'), '') <> '';
  if v_n = 0 then raise exception 'The linked compilation has no games'; end if;

  -- The parent's copies map 1:1 onto the compilation's copies, and EACH copy's
  -- cost is split evenly (to the cent) across the children — remainder cents to
  -- the first children, mirroring splitEvenly in src/lib/compilations.ts, so
  -- every copy's child costs sum exactly to that copy's cost.
  v_pc_n := jsonb_array_length(coalesce(g.copies, '[]'::jsonb));
  select coalesce(sum(nullif(c->>'cost', '')::numeric), 0)
    into v_total from jsonb_array_elements(coalesce(g.copies, '[]'::jsonb)) c;
  v_platform := nullif(btrim(coalesce(g.copies->0->>'platform', '')), '');
  v_format   := nullif(btrim(coalesce(g.copies->0->>'format', '')), '');

  insert into public.compilations
    (user_id, title, total_cost, platform, format, template_id,
     expanded, carryover_hours, parent_image, copies, released)
  values
    (auth.uid(), t.title, v_total, v_platform, v_format, t.id,
     true, coalesce(g.played_hours, 0), g.image,
     case when v_pc_n > 0 then public.normalize_copies(g.copies) else '[]'::jsonb end,
     g.released)
  returning id into v_comp_id;

  -- Insert the children one by one IN THE TEMPLATE'S ORDER, collecting the new
  -- ids so the bundle's natural order persists as child_order (issue
  -- 140ac868) — same-batch children share one added_at, so nothing else can
  -- order them after a reload.
  for v_tpl in
    -- Renumber AFTER dropping blank rows so the remainder cents always land on
    -- children that exist (the split must sum exactly to v_total).
    select raw.e, row_number() over (order by raw.ord) as ord
    from jsonb_array_elements(t.games) with ordinality as raw(e, ord)
    where coalesce(btrim(raw.e->>'name'), '') <> ''
    order by raw.ord
  loop
    insert into public.games
      (user_id, title, hours, genres, image, stock_image, original_image, rawg_id,
       released, metacritic, platforms, developers, esrb, catalog_id, status, copies,
       compilation_id, compilation_name, finished_at, played_hours)
    values (
      auth.uid(),
      btrim(v_tpl.e->>'name'),
      nullif(v_tpl.e->>'hours', '')::real,
      -- Canonicalized against the master lists: a template stored before terms
      -- were validated (or before a taxonomy rename) can carry off-list
      -- spellings that the games validation trigger would reject, aborting the
      -- whole expand (issue 955090f2: 'UNKNOWN_PLATFORM:Xbox Series S/X').
      -- Off-list terms drop, exactly as the client's add path does.
      public.canonical_genre_terms(v_tpl.e->'genres'),
      nullif(v_tpl.e->>'image', ''),
      nullif(v_tpl.e->>'image', ''),
      nullif(v_tpl.e->>'image', ''),
      nullif(v_tpl.e->>'rawg_id', '')::integer,
      -- Fill-blanks release date: the template child's own date wins; the
      -- parent's date covers children that arrive without one.
      coalesce(nullif(v_tpl.e->>'released', '')::date, g.released),
      nullif(v_tpl.e->>'metacritic', '')::integer,
      public.canonical_platform_terms(v_tpl.e->'platforms'),
      coalesce(v_tpl.e->'developers', '[]'::jsonb),
      nullif(v_tpl.e->>'esrb', ''),
      nullif(v_tpl.e->>'catalog_id', '')::uuid,
      case when g.status = 'finished' then 'finished' else 'backlog' end,
      case when v_pc_n > 0 then (
        -- One child copy per parent copy, cost = this child's even-split slice of
        -- that copy's cents (base + 1 extra cent for the first `rem` children).
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', gen_random_uuid()::text,
          'platform', nullif(btrim(coalesce(pc.copy->>'platform', '')), ''),
          'format', nullif(btrim(coalesce(pc.copy->>'format', '')), ''),
          'cost', case when pc.cents > 0
                       then ((pc.cents / v_n)
                             + case when v_tpl.ord <= (pc.cents - (pc.cents / v_n) * v_n)
                                    then 1 else 0 end) / 100.0
                       else null end
        )) order by pc.k)
        from (
          select raw.copy, raw.k,
                 coalesce(round(nullif(raw.copy->>'cost', '')::numeric * 100), 0)::bigint as cents
          from jsonb_array_elements(g.copies) with ordinality as raw(copy, k)
        ) pc
      ) else jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text)) end,
      v_comp_id,
      t.title,
      case when g.status = 'finished' then coalesce(g.finished_at, now()) else null end,
      0
    )
    returning id into v_child_id;
    v_child_ids := v_child_ids || v_child_id;
  end loop;

  update public.compilations set child_order = v_child_ids
   where id = v_comp_id and user_id = auth.uid();

  -- A started parent was bought with coins; those children now carry their own
  -- coin loop, so the activation fee comes back in full. Economy off: no
  -- refund — the balance stays frozen (freeze wins; usually moot since an
  -- off-activation cost 0).
  if g.status = 'playing' and coalesce(g.price_paid, 0) > 0
     and public.economy_enabled(auth.uid()) then
    v_refund := g.price_paid;
    update public.profiles set coins = coins + v_refund
     where id = auth.uid() returning coins into v_coins;
    perform public.log_coin_event(
      auth.uid(), 'expand_refund', v_refund, 0, v_coins, null, p_game, g.title, null,
      jsonb_build_object('price_paid', v_refund, 'compilation', t.title)
    );
  else
    select coins into v_coins from public.profiles where id = auth.uid();
  end if;

  delete from public.games where id = p_game and user_id = auth.uid();

  insert into public.compilation_events
    (user_id, compilation_id, event_type, title, total_cost, child_count)
  values (auth.uid(), v_comp_id, 'expanded_from_game', t.title, v_total, v_n);

  -- Children come back in the template's order (= the saved child_order).
  select coalesce(jsonb_agg(to_jsonb(ch) order by ord.k), '[]'::jsonb) into v_children
    from public.games ch
    join unnest(v_child_ids) with ordinality as ord(id, k) on ch.id = ord.id
   where ch.compilation_id = v_comp_id and ch.user_id = auth.uid();

  return query select v_coins, v_refund, v_children;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard: aggregates only (no one sees another player's actual games).
-- ---------------------------------------------------------------------------

-- Distinct-clears rollup for public stats: finished games (retired excluded)
-- deduped by shared catalog identity, so a game finished on several per-platform
-- instances counts ONCE in standings and profile totals. Mirrors catalogKey in
-- src/lib/ownershipMerge.ts (rawg id, else catalog id); hand-typed customs (no
-- identity) count per row. Internal helper — leaderboard/view_profile call it;
-- clients never do.
create or replace function public.finished_game_stats(p_user uuid)
returns table (games_finished bigint, hours_finished bigint)
language sql stable
security definer set search_path = public
as $$
  select count(*)::bigint as games_finished,
         -- hours is `real`; round the total to whole hours for the bigint column.
         coalesce(round(sum(d.hours)), 0)::bigint as hours_finished
    from (
      select distinct on (coalesce('r:' || g.rawg_id::text,
                                   'c:' || g.catalog_id::text,
                                   'g:' || g.id::text))
             g.hours
        from public.games g
       where g.user_id = p_user
         and g.status = 'finished'
         and coalesce(g.finish_tag, '') <> 'retired'
       order by coalesce('r:' || g.rawg_id::text,
                         'c:' || g.catalog_id::text,
                         'g:' || g.id::text),
                g.finished_at asc nulls last, g.id asc
    ) d;
$$;
revoke execute on function public.finished_game_stats(uuid) from public, anon, authenticated;

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
  title          jsonb,
  cosmetics      jsonb
)
language sql
security definer set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    -- A frozen (economy-off) balance is private — no coin chip for that stall.
    case when p.economy_enabled then p.coins end                     as coins,
    -- Distinct clears (retired excluded; per-platform instances count once).
    f.games_finished,
    f.hours_finished,
    -- Presence is hidden for users who chose to appear offline.
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.last_seen_at end                           as last_seen_at,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.activity end                               as activity,
    public.user_title_json(p.id)                                     as title,
    public.user_cosmetics_json(p.id)                                 as cosmetics
  from public.profiles p
  cross join lateral public.finished_game_stats(p.id) f
  -- Admin-hidden accounts (test/bot/etc.) never appear here, and because the
  -- per-row aggregates are computed from this set, they're excluded from the
  -- leaderboard's stats entirely. Private profiles opt out of every public
  -- surface, the leaderboard included — dropped for ALL viewers (their own
  -- session too) so ranking positions are consistent (issue e3242526).
  where not p.hidden
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
  order by p.coins desc;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, which would let anyone with the
-- (public) anon key call these. Lock them to signed-in users only. (The
-- comprehensive grant/revoke block near the end of this file covers the rest,
-- including the apply_voucher_redemption/apply_replay slot functions.)
revoke execute on function public.apply_purchase(uuid, integer, uuid, boolean, boolean, boolean, boolean) from public;
revoke execute on function public.pick_start_slot(uuid, uuid, boolean)         from public;
revoke execute on function public.apply_finish(uuid, integer, integer, integer) from public;
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
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
  id             uuid,
  email          text,
  display_name   text,
  avatar_url     text,
  coins          integer,
  charters       integer,
  vouchers       integer,
  general_slots  integer,
  rotation_slots integer,
  replay_slots   integer,
  completionist_slots integer,
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
    p.id, u.email, p.display_name, p.avatar_url, p.coins, p.charters, p.vouchers, p.general_slots,
    p.rotation_slots, p.replay_slots, p.completionist_slots,
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
-- Dropped first because adding p_rotation_slots changes the signature (a bare
-- create-or-replace would leave the old overload behind).
drop function if exists public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean, integer);
-- Dropped again because adding the Replay + Completionist lane capacities changes
-- the signature once more.
drop function if exists public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean, integer, integer);
-- Dropped once more because adding p_charters (admin-grantable Import Charters)
-- changes the signature again.
drop function if exists public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean, integer, integer, integer, integer);
create or replace function public.admin_update_user(
  p_user           uuid,
  p_display_name   text,
  p_coins          integer,
  p_general_slots  integer,
  p_is_admin       boolean,
  p_blocked        boolean,
  p_blocked_reason text,
  p_hidden         boolean,
  p_vouchers       integer,
  p_rotation_slots integer default 3,
  p_replay_slots   integer default 2,
  p_completionist_slots integer default 2,
  -- Defaults to null (not 0) so an older client that omits it leaves the user's
  -- Import Charters untouched — never a silent wipe during a deploy window.
  p_charters       integer default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_old      integer;
  v_old_vou  integer;
  v_old_cha  integer;
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
  if p_charters is not null and p_charters < 0 then
    raise exception 'Charters must be 0 or more';
  end if;
  if p_general_slots < 0 or p_general_slots > 99 then
    raise exception 'Slots must be between 0 and 99';
  end if;
  if p_rotation_slots < 0 or p_rotation_slots > 99 then
    raise exception 'Rotation slots must be between 0 and 99';
  end if;
  if p_replay_slots < 0 or p_replay_slots > 99 then
    raise exception 'Replay slots must be between 0 and 99';
  end if;
  if p_completionist_slots < 0 or p_completionist_slots > 99 then
    raise exception 'Completionist slots must be between 0 and 99';
  end if;

  select * into v_cur from public.profiles where id = p_user;
  if not found then
    raise exception 'User not found';
  end if;
  v_old     := v_cur.coins;
  v_old_vou := v_cur.vouchers;
  v_old_cha := v_cur.charters;

  -- Per-field authority: a delegate may only change the field groups they hold.
  -- Compare each requested value to the current one and reject a change they
  -- can't make (the blanket update below is then safe).
  if (p_coins is distinct from v_cur.coins
      or p_vouchers is distinct from v_cur.vouchers
      or (p_charters is not null and p_charters is distinct from v_cur.charters)
      or p_general_slots is distinct from v_cur.general_slots
      or p_rotation_slots is distinct from v_cur.rotation_slots
      or p_replay_slots is distinct from v_cur.replay_slots
      or p_completionist_slots is distinct from v_cur.completionist_slots)
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
         charters       = coalesce(p_charters, charters),
         vouchers       = p_vouchers,
         general_slots  = p_general_slots,
         rotation_slots = p_rotation_slots,
         replay_slots   = p_replay_slots,
         completionist_slots = p_completionist_slots,
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

  -- Record an admin Import Charter grant/deduction (coins untouched) on the
  -- ledger, snapshotting the new charter balance. A null p_charters (older
  -- client) left the balance alone, so nothing is logged.
  if p_charters is not null and p_charters is distinct from v_old_cha then
    perform public.log_coin_event(
      p_user, 'charter_grant', 0, p_charters - coalesce(v_old_cha, 0),
      p_coins, p_charters, null, null, 'Admin charter change'
    );
  end if;
end;
$$;

-- Admin: reset a user's onboarding so the FULL fresh-signup tutorial runs for
-- them again, exactly as if they'd just signed up — clear the completion stamp,
-- re-flag the tutorial phase, and clear the grant stamp so re-entering the
-- checklist re-credits the configured vouchers (preserving the historical
-- re-grant-on-redo behavior). Admin-only, security definer.
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
     set onboarding_completed_at = null,
         onboarding_vouchers_pending = true,
         onboarding_vouchers_granted_at = null
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
language plpgsql
security definer set search_path = public
as $$
declare
  g        public.games%rowtype;
  v_friend boolean;
  v_optout boolean;
begin
  -- Privacy gate for unmoderated custom cover art. A custom upload is the only
  -- cover whose URL points into the 'covers' bucket; the safe, globally-verified
  -- default lives in stock_image. Visitors who are NOT the owner and NOT a
  -- confirmed friend are served stock_image instead of the upload — and a viewer
  -- who has opted out ('hide_custom_covers') gets the default for everyone's
  -- uploads regardless of friendship. The owner always sees their own board.
  -- Hard privacy: a private profile's library is the owner's alone — every
  -- other caller (friends included) gets an empty set (issue e3242526).
  if p_user <> auth.uid() and coalesce(
       (select (privacy->>'private_profile')::boolean
          from public.profiles where id = p_user), false) then
    return;
  end if;

  v_friend := (p_user = auth.uid()) or public.are_friends(auth.uid(), p_user);
  v_optout := coalesce(
    (select (privacy->>'hide_custom_covers')::boolean from public.profiles where id = auth.uid()),
    false);

  -- A visitor never sees games the owner marked private; the owner themselves
  -- (p_user = auth.uid()) always sees their full library through this function.
  for g in
    select * from public.games
     where user_id = p_user
       and (p_user = auth.uid() or not coalesce(private, false))
     order by added_at desc
  loop
    if g.image like '%/covers/%'
       and p_user <> auth.uid()
       and (v_optout or not v_friend) then
      g.image := g.stock_image; -- safe default (may be null → placeholder)
    end if;
    -- The family's custom card cover is a covers-bucket upload too — gate it
    -- the same way (null → the client resolver falls back to a member's
    -- already-gated cover).
    if g.family_image like '%/covers/%'
       and p_user <> auth.uid()
       and (v_optout or not v_friend) then
      g.family_image := null;
    end if;
    return next g;
  end loop;
end;
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
  title          jsonb,
  about_me       text,
  banner_url     text,
  accent         text,
  bg             text,
  cosmetics      jsonb,
  economy_enabled boolean
)
language sql
security definer set search_path = public
as $$
  select
    p.display_name,
    p.avatar_url,
    -- A frozen (economy-off) balance is private — visitors see no coin count.
    case when p.economy_enabled then p.coins end                     as coins,
    p.theme,
    -- Distinct clears (retired excluded; per-platform instances count once).
    f.games_finished,
    f.hours_finished,
    coalesce((p.privacy->>'hide_spend')::boolean, false)             as hide_spend,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.last_seen_at end                           as last_seen_at,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.activity end                               as activity,
    public.user_badges_json(p.id)                                    as badges,
    public.user_title_json(p.id)                                     as title,
    p.about_me                                                       as about_me,
    p.banner_url                                                     as banner_url,
    p.accent                                                         as accent,
    p.bg                                                             as bg,
    public.user_cosmetics_json(p.id)                                 as cosmetics,
    p.economy_enabled                                                as economy_enabled
  from public.profiles p
  cross join lateral public.finished_game_stats(p.id) f
  where p.id = p_user
    -- Hard privacy: a private profile can't be visited by anyone but its owner
    -- (returns no rows; the client shows a friendly notice) — issue e3242526.
    and (p.id = auth.uid()
         or not coalesce((p.privacy->>'private_profile')::boolean, false));
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
        when 'on_hold'           then 'On Hold'
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
  -- The instance-split migration MOVES a platform's sessions to the new
  -- instance and lowers the source's scalar to match — that reduction is a
  -- re-parenting, not played time, so it must not mint a correction event
  -- (which would shrink lifetime hours). Deliberately NOT the undo GUC: an
  -- undo restoring played_hours should keep logging its correction.
  if coalesce(current_setting('app.split_in_progress', true), '') = '1' then
    return new;
  end if;
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

-- Profile customization history: an append-only record of each change to a user's
-- public identity (display name, bio, accent, banner, avatar, theme). Captured by an
-- AFTER UPDATE trigger so plain client `update`s to profiles can't bypass it. Mirrors
-- the coin_events posture: read-own (admins all), no client writes. No backfill.
create table if not exists public.profile_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  field      text not null,  -- which field changed
  old_value  text,
  new_value  text,
  created_at timestamptz not null default now()
);
create index if not exists profile_events_user_idx
  on public.profile_events (user_id, created_at desc, id desc);

alter table public.profile_events enable row level security;
revoke insert, update, delete on public.profile_events from authenticated, anon;
drop policy if exists "profile_events_select" on public.profile_events;
create policy "profile_events_select" on public.profile_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function public.log_profile_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name then
    insert into public.profile_events (user_id, field, old_value, new_value)
      values (new.id, 'display_name', old.display_name, new.display_name);
  end if;
  if new.about_me is distinct from old.about_me then
    insert into public.profile_events (user_id, field, old_value, new_value)
      values (new.id, 'about_me', old.about_me, new.about_me);
  end if;
  if new.accent is distinct from old.accent then
    insert into public.profile_events (user_id, field, old_value, new_value)
      values (new.id, 'accent', old.accent, new.accent);
  end if;
  if new.banner_url is distinct from old.banner_url then
    insert into public.profile_events (user_id, field, old_value, new_value)
      values (new.id, 'banner_url', old.banner_url, new.banner_url);
  end if;
  if new.avatar_url is distinct from old.avatar_url then
    insert into public.profile_events (user_id, field, old_value, new_value)
      values (new.id, 'avatar_url', old.avatar_url, new.avatar_url);
  end if;
  if new.theme is distinct from old.theme then
    insert into public.profile_events (user_id, field, old_value, new_value)
      values (new.id, 'theme', old.theme, new.theme);
  end if;
  -- The "Money Well Spent" target rate (issue 6c60c213): a personal economy
  -- preference whose history is worth keeping (old→new, like config changes).
  if new.target_cost_per_hour is distinct from old.target_cost_per_hour then
    insert into public.profile_events (user_id, field, old_value, new_value)
      values (new.id, 'target_cost_per_hour',
              old.target_cost_per_hour::text, new.target_cost_per_hour::text);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_log_event on public.profiles;
create trigger profiles_log_event
  after update on public.profiles
  for each row execute function public.log_profile_event();

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
  -- Rows minted or trimmed by the instance-split migration are re-parented
  -- data, not user actions — instance_split_events is their audit record.
  if coalesce(current_setting('app.split_in_progress', true), '') = '1' then
    return coalesce(new, old);
  end if;
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

-- Player-review history: an append-only snapshot after every review/score save,
-- so edits in place (games.review / review_score overwrite) never lose their
-- own past. Mirrors the game_status_events posture: title snapshot + on delete
-- set null FK so history survives the game's removal; read-own (admins all);
-- writes come exclusively from the trigger. No backfill (fires on new saves).
create table if not exists public.review_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game_title  text,
  review      text,      -- the full text AFTER this save (null = review cleared)
  score       smallint,  -- half-star units after this save (null = score cleared)
  created_at  timestamptz not null default now()
);
create index if not exists review_events_user_idx
  on public.review_events (user_id, created_at desc, id desc);
create index if not exists review_events_game_idx
  on public.review_events (game_id);

alter table public.review_events enable row level security;
revoke insert, update, delete on public.review_events from authenticated, anon;
drop policy if exists "review_events_select" on public.review_events;
create policy "review_events_select" on public.review_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function public.log_review_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- An undo restoring pre-change values is a reversal, not a new opinion.
  if current_setting('app.undo_in_progress', true) = '1' then
    return new;
  end if;
  if new.review is distinct from old.review
     or new.review_score is distinct from old.review_score then
    insert into public.review_events (user_id, game_id, game_title, review, score)
    values (new.user_id, new.id, new.title, new.review, new.review_score);
  end if;
  return new;
end;
$$;

drop trigger if exists games_log_review on public.games;
create trigger games_log_review
  after update of review, review_score on public.games
  for each row execute function public.log_review_event();

-- ---------------------------------------------------------------------------
-- Likes — a taste marker on any library game (issue 15bf1e6c). Stored ON the
-- games row like reviews (liked_at, null = not liked): the toggle is a plain
-- owner update under RLS, player_library carries it to visitors for free, and
-- `private` games keep their like invisible along with everything else.
-- Community aggregation joins by catalog identity (community_game_stats gains
-- a likes count; list_game_likers below lists who). Purely informational —
-- never touches the economy.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists liked_at timestamptz;

-- Like/unlike history: append-only, one row per toggle, so the lifetime
-- "likes given" achievement metric counts GIVEN likes (an unlike-relike loop
-- can't farm it, and removed likes stay on record per the audit rule).
-- Mirrors review_events' posture: title snapshot + on delete set null FK,
-- read-own (admins all), trigger-only writes.
create table if not exists public.like_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game_title  text,
  action      text not null check (action in ('liked', 'unliked')),
  created_at  timestamptz not null default now()
);
create index if not exists like_events_user_idx
  on public.like_events (user_id, created_at desc, id desc);
create index if not exists like_events_game_idx
  on public.like_events (game_id);

alter table public.like_events enable row level security;
revoke insert, update, delete on public.like_events from authenticated, anon;
drop policy if exists "like_events_select" on public.like_events;
create policy "like_events_select" on public.like_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function public.log_like_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- An undo restoring pre-change values is a reversal, not a new opinion.
  if current_setting('app.undo_in_progress', true) = '1' then
    return new;
  end if;
  if (new.liked_at is null) <> (old.liked_at is null) then
    insert into public.like_events (user_id, game_id, game_title, action)
    values (new.user_id, new.id, new.title,
            case when new.liked_at is null then 'unliked' else 'liked' end);
  end if;
  return new;
end;
$$;

drop trigger if exists games_log_like on public.games;
create trigger games_log_like
  after update of liked_at on public.games
  for each row execute function public.log_like_event();

-- Mystery Pull history: one append-only row per CONFIRMED pull (the roll the
-- player accepted and bought — the purchase itself is captured separately in
-- coin_events/game_status_events). rerolls counts the rolls they passed on
-- before accepting, so future features can count/rank pull usage ("Feeling
-- Lucky" streaks, leaderboards) without a backfill. Mirrors review_events'
-- posture: title snapshot + on delete set null FK, read-own (admins all), no
-- client table writes — inserts come only through the definer RPC below.
create table if not exists public.mystery_pull_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game_title  text,
  rerolls     integer not null default 0 check (rerolls >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists mystery_pull_events_user_idx
  on public.mystery_pull_events (user_id, created_at desc, id desc);
create index if not exists mystery_pull_events_game_idx
  on public.mystery_pull_events (game_id);

alter table public.mystery_pull_events enable row level security;
revoke insert, update, delete on public.mystery_pull_events from authenticated, anon;
drop policy if exists "mystery_pull_events_select" on public.mystery_pull_events;
create policy "mystery_pull_events_select" on public.mystery_pull_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- kind: which pull this was — 'play' draws a Bazaar game to buy & start,
-- 'complete' draws a beaten Finished game to pull back for a 100% run.
alter table public.mystery_pull_events
  add column if not exists kind text not null default 'play';
alter table public.mystery_pull_events drop constraint if exists mystery_pull_events_kind_check;
alter table public.mystery_pull_events add constraint mystery_pull_events_kind_check
  check (kind in ('play', 'complete'));

-- Record a confirmed Mystery Pull. Called by the client right after the pulled
-- game's activation (or completion re-entry) succeeds; the row is pinned to the
-- caller (auth.uid()) and the title is snapshotted server-side from the
-- caller's own games row — a game id that isn't theirs (or doesn't exist) is
-- refused. Dropped first: the p_kind parameter changed the signature.
drop function if exists public.log_mystery_pull(uuid, integer);
create or replace function public.log_mystery_pull(
  p_game_id uuid,
  p_rerolls integer default 0,
  p_kind    text default 'play'
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_title text;
begin
  if p_kind not in ('play', 'complete') then
    raise exception 'Unknown pull kind';
  end if;
  select title into v_title
    from public.games
   where id = p_game_id and user_id = auth.uid();
  if v_title is null then
    raise exception 'Game not found in your library';
  end if;
  insert into public.mystery_pull_events (user_id, game_id, game_title, rerolls, kind)
  values (auth.uid(), p_game_id, v_title, greatest(coalesce(p_rerolls, 0), 0), p_kind);
end;
$$;

-- Every player's review of one game, for the game page's Community tab: the
-- write-up/score off each owner's games row joined with their public profile.
-- Matched by shared catalog identity — rawg_id for RAWG games, catalog_id for
-- community-added ones (either argument may be null; both null returns no
-- rows). Excludes rows the owner marked private (the same gate player_library
-- applies) and rows with nothing reviewable. platforms lists only the copies'
-- platform names — never costs or notes. Security definer so it can read every
-- library regardless of RLS; newest opinions first.
drop function if exists public.list_game_reviews(integer, uuid);
create or replace function public.list_game_reviews(p_rawg_id integer, p_catalog_id uuid)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  review       text,
  score        smallint,
  status       text,
  finish_tag   text,
  platforms    text[],
  reviewed_at  timestamptz,
  -- Rotation-lane flag: a live-service game being played reads "In Rotation"
  -- on the review row, not "Now Playing" (same input signature — the tail's
  -- grant/revoke lines are unchanged; the drop above handles the new column).
  in_rotation  boolean
)
language sql
security definer set search_path = public
as $$
  select
    g.user_id,
    p.display_name,
    p.avatar_url,
    g.review,
    g.review_score,
    g.status,
    g.finish_tag,
    (select array_agg(distinct c->>'platform')
       from jsonb_array_elements(coalesce(g.copies, '[]'::jsonb)) c
      where nullif(c->>'platform', '') is not null),
    g.reviewed_at,
    coalesce(g.in_rotation, false)
  from public.games g
  join public.profiles p on p.id = g.user_id
  where ((p_rawg_id is not null and g.rawg_id = p_rawg_id)
      or (p_catalog_id is not null and g.catalog_id = p_catalog_id))
    and not coalesce(g.private, false)
    -- Hard privacy: a private profile's reviews are shown to nobody but their
    -- author (they carry name + avatar) — issue e3242526.
    and (g.user_id = auth.uid()
         or not coalesce((p.privacy->>'private_profile')::boolean, false))
    and (nullif(btrim(g.review), '') is not null or g.review_score is not null)
  order by g.reviewed_at desc nulls last;
$$;

-- The game page's Community Stats panel: anonymous aggregates over every
-- library that holds this game (matched by shared catalog identity — rawg_id or
-- catalog_id, either may be null). Security definer to read across all
-- libraries; private games are excluded (the same gate list_game_reviews and
-- player_library apply), so nothing identifiable leaks — only counts and
-- averages. Owner/status counts are DISTINCT USERS ("how many players have it,
-- and where"); review/rating counts and the star distribution count library
-- rows (a rating per row). avg_score is in half-star units (1–10); dist is a
-- {"1".."10": count} histogram over those units. Hours are summed across all
-- rows, with the average taken only over rows that logged time. Dropped first to
-- keep the return shape authoritative on re-run.
drop function if exists public.community_game_stats(integer, uuid);
create or replace function public.community_game_stats(p_rawg_id integer, p_catalog_id uuid)
returns table (
  owners       bigint,
  playing      bigint,
  backlog      bigint,
  finished     bigint,
  wishlist     bigint,
  review_count bigint,
  rating_count bigint,
  avg_score    numeric,
  hours_total  bigint,
  hours_avg    numeric,
  dist         jsonb,
  likes        bigint
)
language sql
security definer set search_path = public
as $$
  with owned as (
    select g.user_id, g.status, g.played_hours, g.review, g.review_score, g.liked_at
      from public.games g
     where ((p_rawg_id is not null and g.rawg_id = p_rawg_id)
         or (p_catalog_id is not null and g.catalog_id = p_catalog_id))
       and not coalesce(g.private, false)
  )
  select
    count(distinct user_id) filter (where status <> 'wishlist')            as owners,
    count(distinct user_id) filter (where status = 'playing')              as playing,
    count(distinct user_id) filter (where status = 'backlog')              as backlog,
    count(distinct user_id) filter (where status = 'finished')             as finished,
    count(distinct user_id) filter (where status = 'wishlist')             as wishlist,
    count(*) filter (where nullif(btrim(coalesce(review, '')), '') is not null) as review_count,
    count(*) filter (where review_score is not null)                       as rating_count,
    avg(review_score) filter (where review_score is not null)              as avg_score,
    coalesce(sum(played_hours), 0)::bigint                                 as hours_total,
    avg(played_hours) filter (where coalesce(played_hours, 0) > 0)         as hours_avg,
    (select coalesce(jsonb_object_agg(s::text, c), '{}'::jsonb)
       from (select review_score as s, count(*) as c
               from owned where review_score is not null
              group by review_score) d)                                    as dist,
    count(distinct user_id) filter (where liked_at is not null)            as likes
  from owned;
$$;

-- Who liked this game: the players whose (non-private) copy of the catalog
-- game currently carries a like, for the clickable count in the Community
-- Stats panel. Excludes blocked and private-profile players (same gate as
-- search_users), exposes identity fields only, newest like first. Paginated —
-- the panel loads a page at a time.
drop function if exists public.list_game_likers(integer, uuid, integer, integer);
create or replace function public.list_game_likers(
  p_rawg_id integer, p_catalog_id uuid,
  p_limit integer default 30, p_offset integer default 0
)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  liked_at     timestamptz
)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return query
  select p.id, p.display_name, p.avatar_url, max(g.liked_at) as liked_at
    from public.games g
    join public.profiles p on p.id = g.user_id
   where ((p_rawg_id is not null and g.rawg_id = p_rawg_id)
       or (p_catalog_id is not null and g.catalog_id = p_catalog_id))
     and g.liked_at is not null
     and not coalesce(g.private, false)
     and not p.blocked
     and not coalesce((p.privacy->>'private_profile')::boolean, false)
   group by p.id, p.display_name, p.avatar_url
   order by max(g.liked_at) desc
   limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- The Profile Hub "Recent Activity" feed: a cross-game roll-up of a player's
-- game milestones (added / started / beat / completed / retired / unretired),
-- newest first. Security definer because game_milestones is select-own, so a
-- visitor can't read another player's rows directly — but this applies
-- player_library's privacy exactly: a visitor never sees a game marked private,
-- and a non-friend (or a viewer who opted out) is served the safe default cover
-- instead of a custom upload. The owner (p_user = auth.uid()) sees their whole
-- timeline. finish_tag rides along so the client can give Beat vs Completed
-- their distinct card treatment. Dropped first to keep the return shape
-- authoritative on re-run.
drop function if exists public.list_profile_activity(uuid, integer);
create or replace function public.list_profile_activity(p_user uuid, p_limit integer default 30)
returns table (
  milestone_id uuid,
  kind         text,
  occurred_on  date,
  created_at   timestamptz,
  game_id      uuid,
  game_title   text,
  game_image   text,
  finish_tag   text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_friend boolean;
  v_optout boolean;
begin
  -- Hard privacy: a private profile's timeline is the owner's alone — every
  -- other caller (friends included) gets an empty feed (issue e3242526).
  if p_user <> auth.uid() and coalesce(
       (select (privacy->>'private_profile')::boolean
          from public.profiles where id = p_user), false) then
    return;
  end if;

  v_friend := (p_user = auth.uid()) or public.are_friends(auth.uid(), p_user);
  v_optout := coalesce(
    (select (privacy->>'hide_custom_covers')::boolean from public.profiles where id = auth.uid()),
    false);

  return query
    select
      m.id,
      m.kind,
      m.occurred_on,
      m.created_at,
      g.id,
      g.title,
      case
        when g.image like '%/covers/%'
         and p_user <> auth.uid()
         and (v_optout or not v_friend)
        then g.stock_image           -- safe default (may be null → placeholder)
        else g.image
      end,
      g.finish_tag
    from public.game_milestones m
    join public.games g on g.id = m.game_id
    where m.user_id = p_user
      and g.user_id = p_user
      and (p_user = auth.uid() or not coalesce(g.private, false))
    order by m.occurred_on desc, m.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

-- Dissolve a Game Family that a deletion has reduced to one (or zero) members:
-- a "family" of one is meaningless, and its surviving edition otherwise keeps
-- showing the family marker forever. Mirrors the unlink RPC's last-member rule,
-- but as a trigger so EVERY deletion path is covered (card remove, merges,
-- future admin tools). Skipped while the OWNING USER is being cascade-deleted
-- (same guard as log_game_status_event above) — their rows are all going away,
-- so dissolving families would be wasted churn against vanishing rows.
create or replace function public.dissolve_orphan_family()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.family_id is not null
     and exists (select 1 from auth.users u where u.id = old.user_id)
     and (select count(*) from public.games g
           where g.user_id = old.user_id and g.family_id = old.family_id) <= 1 then
    update public.games
       set family_id = null, family_name = null,
           family_image = null, family_cover_game_id = null, family_split = false
     where user_id = old.user_id and family_id = old.family_id;
  end if;
  return old;
end;
$$;

drop trigger if exists games_dissolve_orphan_family on public.games;
create trigger games_dissolve_orphan_family
  after delete on public.games
  for each row execute function public.dissolve_orphan_family();

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
    'onboarding_vouchers', 'default_general_slots', 'price_formula', 'bounty_formula',
    'default_rotation_slots', 'rotation_checkin_reward', 'rotation_reset_dow',
    'rotation_reset_hour', 'rotation_reset_tz', 'default_replay_slots',
    'default_completionist_slots', 'completion_bonus_pct', 'co_op_bonus_pct',
    'sponsor_max_stake', 'sponsor_monthly_pair_cap', 'sponsor_expiry_days',
    'preorder_strip_days', 'shop_open'
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

-- profiles: meaningful field changes (name/theme/avatar/platforms/privacy, the
-- profile colors and the admin-managed flags). Coins/charters are excluded
-- (coin_events covers them) and last_seen_at/activity are excluded entirely — the
-- `update of` column list keeps presence pings from firing this trigger at all.
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
    'hidden', 'general_slots', 'selected_badge_id', 'accent', 'bg',
    'economy_enabled'
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
    privacy, is_admin, blocked, blocked_reason, hidden, general_slots,
    selected_badge_id, accent, bg, economy_enabled
  on public.profiles
  for each row execute function public.log_profile_event();

-- Account deletion: keep a tombstone (the display name + id) so a removal is
-- traceable after the row — and all the user's data — cascades away.
create or replace function public.log_profile_delete_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- A SELF-service deletion (delete_my_account) cascades here from auth.users,
  -- so the actor's own auth row is already gone — inserting their uid would
  -- violate audit_events_actor_id_fkey. Null the actor instead; detail still
  -- records who was deleted (and delete_my_account logged its own actor row).
  if v_actor is not null
     and not exists (select 1 from auth.users u where u.id = v_actor) then
    v_actor := null;
  end if;
  insert into public.audit_events
    (actor_id, target_user, entity, entity_id, action, detail)
  values (v_actor, null, 'profile', old.id::text, 'delete',
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
    -- Only log a revoke while the OWNER still exists. When the account is being
    -- deleted, this fires from the auth.users cascade after their row is gone:
    -- target_user (and, on self-deletion, actor_id) would dangle and violate
    -- the audit_events FKs — and the profile-delete tombstone above already
    -- records the removal. Mirrors the games_log_status guard.
    if exists (select 1 from auth.users u where u.id = old.user_id) then
      insert into public.audit_events
        (actor_id, target_user, entity, entity_id, action, detail)
      values (auth.uid(), old.user_id, 'user_slot', null, 'revoke',
              jsonb_build_object('definition_id', old.definition_id, 'slot_id', old.id));
    end if;
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

-- One-time Game Milestones seed from existing library data. Additive +
-- idempotent: every insert guards on its own (game, kind) not-exists. Column
-- passes first; then two event-mining passes recover dates the replay/shelve
-- flows destroyed (started_at / finished_at nulled in place) from the earliest
-- LIVE status event. Dates are ::date in UTC — a rare off-by-one is exactly
-- what the editable dates are for. At most one finish-kind row per game
-- (historical retire/unretire cycles aren't reconstructable from columns).
insert into public.game_milestones (user_id, game_id, kind, occurred_on, source, created_at)
select g.user_id, g.id, 'added', g.added_at::date, 'backfill', g.added_at
from public.games g
where not exists (select 1 from public.game_milestones m
                   where m.game_id = g.id and m.kind = 'added');

insert into public.game_milestones (user_id, game_id, kind, occurred_on, source, created_at)
select g.user_id, g.id, 'started', g.started_at::date, 'backfill', g.started_at
from public.games g
where g.started_at is not null
  and not exists (select 1 from public.game_milestones m
                   where m.game_id = g.id and m.kind = 'started');

insert into public.game_milestones (user_id, game_id, kind, occurred_on, source, created_at)
select g.user_id, g.id,
       case when g.finish_tag = 'completed' then 'completed'
            when g.finish_tag = 'endless'   then 'retired'
            else 'beat' end,
       g.finished_at::date, 'backfill', g.finished_at
from public.games g
where g.finished_at is not null
  and not exists (select 1 from public.game_milestones m
                   where m.game_id = g.id
                     and m.kind = case when g.finish_tag = 'completed' then 'completed'
                                       when g.finish_tag = 'endless'   then 'retired'
                                       else 'beat' end);

-- Replay-destroyed dates: started_at was nulled (shelve/exit_rotation) or
-- finished_at was nulled (a replay/completion run in flight) — the real dates
-- live in game_status_events. Earliest live event per game.
insert into public.game_milestones (user_id, game_id, kind, occurred_on, source, created_at)
select g.user_id, g.id, 'started', min(e.created_at)::date, 'backfill', min(e.created_at)
from public.games g
join public.game_status_events e
  on e.game_id = g.id and e.to_status = 'playing' and e.source = 'live'
where g.started_at is null
  and not exists (select 1 from public.game_milestones m
                   where m.game_id = g.id and m.kind = 'started')
group by g.user_id, g.id;

insert into public.game_milestones (user_id, game_id, kind, occurred_on, source, created_at)
select g.user_id, g.id,
       case when g.finish_tag = 'completed' then 'completed'
            when g.finish_tag = 'endless'   then 'retired'
            else 'beat' end,
       min(e.created_at)::date, 'backfill', min(e.created_at)
from public.games g
join public.game_status_events e
  on e.game_id = g.id and e.to_status = 'finished' and e.source = 'live'
where g.finished_at is null
  and not exists (select 1 from public.game_milestones m
                   where m.game_id = g.id
                     and m.kind = case when g.finish_tag = 'completed' then 'completed'
                                       when g.finish_tag = 'endless'   then 'retired'
                                       else 'beat' end)
group by g.user_id, g.id, g.finish_tag;

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

-- ===========================================================================
-- Controlled taxonomy: master lists for Platforms and Genres
-- ---------------------------------------------------------------------------
-- To keep catalog data clean for analytics, platforms and genres are drawn from
-- admin-curated master lists rather than free text. The lists are the single
-- source for every dropdown; writes that introduce an unknown term are rejected
-- by the triggers below. Existing data is grandfathered: the seed pulls every
-- value already in use (catalog, libraries, custom platforms) into the lists, so
-- nothing currently stored is off-list. The lists are additive — admins ADD new
-- terms as the collection grows (no destructive removal). Tables/seed/triggers
-- are all idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.platforms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- RAWG platform ids this label maps to (for discovery filtering); optional.
  rawg_ids   integer[] not null default '{}',
  created_at timestamptz not null default now()
);
-- Case-insensitive uniqueness so "PC" and "pc" can't both exist (clean data).
create unique index if not exists platforms_name_key on public.platforms (lower(name));

create table if not exists public.genres (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists genres_name_key on public.genres (lower(name));

alter table public.platforms enable row level security;
alter table public.genres    enable row level security;
drop policy if exists "platforms_read" on public.platforms;
create policy "platforms_read" on public.platforms for select to anon, authenticated using (true);
drop policy if exists "genres_read" on public.genres;
create policy "genres_read" on public.genres for select to anon, authenticated using (true);
-- No write policies: only the admin RPCs below (taxonomy.manage) mutate the lists.

-- Seed the built-in consoles (with their RAWG ids for discovery). Idempotent.
insert into public.platforms (name, rawg_ids) values
  ('PC', array[4]),
  ('PlayStation 5', array[187]),
  ('PlayStation 4', array[18]),
  ('Xbox Series X/S', array[186]),
  ('Xbox One', array[1]),
  ('Nintendo Switch', array[7])
on conflict (lower(name)) do nothing;

-- Seed RAWG's standard platform vocabulary so imports match the lists out of the
-- box (admins can prune/extend later). Idempotent.
insert into public.platforms (name)
select v from (values
  ('PlayStation 3'), ('PlayStation 2'), ('PlayStation'), ('PS Vita'), ('PSP'),
  ('Xbox 360'), ('Xbox'), ('Wii U'), ('Wii'), ('Nintendo 3DS'), ('Nintendo DS'),
  ('GameCube'), ('Nintendo 64'), ('Game Boy Advance'), ('SNES'), ('NES'),
  ('macOS'), ('Linux'), ('iOS'), ('Android'), ('Web')
) as t(v)
on conflict (lower(name)) do nothing;

-- Seed RAWG's standard genre vocabulary. Idempotent.
insert into public.genres (name)
select v from (values
  ('Action'), ('Indie'), ('Adventure'), ('RPG'), ('Strategy'), ('Shooter'),
  ('Casual'), ('Simulation'), ('Puzzle'), ('Arcade'), ('Platformer'), ('Racing'),
  ('Massively Multiplayer'), ('Sports'), ('Fighting'), ('Family'), ('Board Games'),
  ('Card'), ('Educational')
) as t(v)
on conflict (lower(name)) do nothing;

-- Grandfather every platform/genre already in use so no existing row is off-list:
-- catalog metadata, personal-library metadata, owned-copy platforms, and the
-- per-user custom platforms. Distinct, case-insensitive (first spelling wins).
insert into public.platforms (name)
select distinct on (lower(v)) v from (
  select jsonb_array_elements_text(platforms) as v from public.catalog_games
  union all
  select jsonb_array_elements_text(platforms) from public.games
  union all
  select (c->>'platform') from public.games g, jsonb_array_elements(g.copies) c
  union all
  select jsonb_array_elements_text(custom_platforms) from public.profiles
) s
where coalesce(btrim(v), '') <> ''
order by lower(v), v
on conflict (lower(name)) do nothing;

insert into public.genres (name)
select distinct on (lower(v)) v from (
  select jsonb_array_elements_text(genres) as v from public.catalog_games
  union all
  select jsonb_array_elements_text(genres) from public.games
) s
where coalesce(btrim(v), '') <> ''
order by lower(v), v
on conflict (lower(name)) do nothing;

-- Add a platform/genre to the master list (admin only; add-only by design — the
-- lists never shrink, so no stored value is ever orphaned). Case-insensitive
-- idempotent; returns nothing. Gated on the assignable taxonomy.manage key.
create or replace function public.admin_add_platform(p_name text, p_rawg_ids integer[] default '{}')
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('taxonomy.manage') then raise exception 'Not authorized'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'A name is required'; end if;
  insert into public.platforms (name, rawg_ids)
  values (btrim(p_name), coalesce(p_rawg_ids, '{}'))
  on conflict (lower(name)) do nothing;
end;
$$;

create or replace function public.admin_add_genre(p_name text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.has_permission('taxonomy.manage') then raise exception 'Not authorized'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'A name is required'; end if;
  insert into public.genres (name) values (btrim(p_name))
  on conflict (lower(name)) do nothing;
end;
$$;

-- Remove a platform from the master list (admin only). GUARDED, like
-- admin_delete_catalog_game: refuse while any game, catalog entry, owned copy,
-- submission, or compilation template still references it (case-insensitive), so a
-- removal can never orphan stored data or block a later edit of those rows. Raises
-- 'PLATFORM_IN_USE' so the client can explain. Idempotent on an unused/absent term.
create or replace function public.admin_remove_platform(p_name text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v text := lower(btrim(coalesce(p_name, '')));
begin
  if not public.has_permission('taxonomy.manage') then raise exception 'Not authorized'; end if;
  if v = '' then raise exception 'A name is required'; end if;
  if exists (select 1 from public.catalog_games c, jsonb_array_elements_text(coalesce(c.platforms, '[]'::jsonb)) x where lower(x) = v)
     or exists (select 1 from public.games g, jsonb_array_elements_text(coalesce(g.platforms, '[]'::jsonb)) x where lower(x) = v)
     or exists (select 1 from public.games g, jsonb_array_elements(coalesce(g.copies, '[]'::jsonb)) c where lower(c->>'platform') = v)
     or exists (select 1 from public.game_submissions s, jsonb_array_elements_text(coalesce(s.platforms, '[]'::jsonb)) x where lower(x) = v)
     or exists (select 1 from public.compilation_templates t, jsonb_array_elements(coalesce(t.games, '[]'::jsonb)) e,
                  jsonb_array_elements_text(coalesce(e->'platforms', '[]'::jsonb)) x where lower(x) = v)
  then
    raise exception 'PLATFORM_IN_USE';
  end if;
  delete from public.platforms where lower(name) = v;
end;
$$;

-- Remove a genre from the master list (admin only). Same in-use guard as
-- admin_remove_platform (genres aren't recorded on copies). Raises 'GENRE_IN_USE'.
create or replace function public.admin_remove_genre(p_name text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v text := lower(btrim(coalesce(p_name, '')));
begin
  if not public.has_permission('taxonomy.manage') then raise exception 'Not authorized'; end if;
  if v = '' then raise exception 'A name is required'; end if;
  if exists (select 1 from public.catalog_games c, jsonb_array_elements_text(coalesce(c.genres, '[]'::jsonb)) x where lower(x) = v)
     or exists (select 1 from public.games g, jsonb_array_elements_text(coalesce(g.genres, '[]'::jsonb)) x where lower(x) = v)
     or exists (select 1 from public.game_submissions s, jsonb_array_elements_text(coalesce(s.genres, '[]'::jsonb)) x where lower(x) = v)
     or exists (select 1 from public.compilation_templates t, jsonb_array_elements(coalesce(t.games, '[]'::jsonb)) e,
                  jsonb_array_elements_text(coalesce(e->'genres', '[]'::jsonb)) x where lower(x) = v)
  then
    raise exception 'GENRE_IN_USE';
  end if;
  delete from public.genres where lower(name) = v;
end;
$$;

-- ── Taxonomy replace (delete an in-use term by reassigning its usages) ──────────
-- admin_remove_* refuses to drop a term that's still referenced (so data is never
-- orphaned). These let a moderator delete an in-use platform/genre by first
-- REPLACING every reference with another term (existing or brand-new) and then
-- removing the old one. It's a value-preserving rename across the catalog, every
-- library game + owned copy, pending submissions, and shared compilation templates
-- — no row is dropped and no stored value is lost. Append-only audited; gated on
-- taxonomy.manage. Additive + idempotent like the rest of this file.

-- Append-only audit of taxonomy replacements (capture-history per CLAUDE.md).
create table if not exists public.taxonomy_events (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references auth.users (id) on delete set null,
  kind       text not null check (kind in ('platform', 'genre')),
  action     text not null check (action in ('replace')),
  old_value  text,
  new_value  text,
  affected   integer,
  created_at timestamptz not null default now()
);
alter table public.taxonomy_events enable row level security;
drop policy if exists "taxonomy_events_select" on public.taxonomy_events;
create policy "taxonomy_events_select" on public.taxonomy_events
  for select using (public.has_permission('taxonomy.manage'));
revoke insert, update, delete on public.taxonomy_events from authenticated, anon;

-- Replace one text value with another inside a jsonb string array: case-insensitive,
-- order-preserving, and de-duplicated (so a rename can never leave the array with a
-- duplicate term). Internal helper for the replace RPCs.
create or replace function public.jsonb_text_array_replace(arr jsonb, p_old text, p_new text)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_agg(val order by ord), '[]'::jsonb)
  from (
    select distinct on (lower(val)) val, ord
    from (
      select case when lower(x) = lower(p_old) then p_new else x end as val, ord
      from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) with ordinality as t(x, ord)
    ) mapped
    order by lower(val), ord
  ) deduped;
$$;

-- Replace the `platform` field inside a `copies` jsonb object array (case-insensitive,
-- order-preserving). Copies are NOT de-duplicated — a game may legitimately own the
-- same platform twice (e.g. physical + digital). Internal helper.
create or replace function public.jsonb_copies_replace_platform(arr jsonb, p_old text, p_new text)
returns jsonb
language sql immutable
as $$
  select coalesce(jsonb_agg(
           case when lower(c->>'platform') = lower(p_old)
                then jsonb_set(c, '{platform}', to_jsonb(p_new))
                else c end
           order by ord
         ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) with ordinality as t(c, ord);
$$;

-- Canonicalize a jsonb string array of platform terms against the master list:
-- each entry maps to the master spelling (case-insensitive, trimmed), off-list
-- terms are dropped, duplicates collapse to their first occurrence, order
-- preserved — the SQL mirror of canonicalizeTerms in src/lib/taxonomy.ts.
-- Internal helper for definer RPCs that store server-supplied metadata (which
-- never went through the client's canonicalization; issue 955090f2).
create or replace function public.canonical_platform_terms(arr jsonb)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(name order by ord), '[]'::jsonb)
  from (
    select distinct on (lower(p.name)) p.name, t.ord
    from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) with ordinality as t(v, ord)
    join public.platforms p on lower(p.name) = lower(btrim(t.v))
    order by lower(p.name), t.ord
  ) s;
$$;

-- Genre twin of canonical_platform_terms.
create or replace function public.canonical_genre_terms(arr jsonb)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(name order by ord), '[]'::jsonb)
  from (
    select distinct on (lower(g.name)) g.name, t.ord
    from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) with ordinality as t(v, ord)
    join public.genres g on lower(g.name) = lower(btrim(t.v))
    order by lower(g.name), t.ord
  ) s;
$$;

-- Canonicalize every embedded game snapshot's platforms/genres inside a
-- compilation template's games array. Template submissions arrive with raw
-- client metadata (RAWG spells some terms differently, e.g. 'Xbox Series S/X'
-- vs the master 'Xbox Series X/S') and compilation_templates carries no
-- term-validation trigger — so an off-list term could sit in a template until
-- expand_game_to_compilation tried to insert it into games and hit the
-- validation trigger there (issue 955090f2). All other fields and the game
-- order are preserved untouched.
create or replace function public.canonical_template_games(p_games jsonb)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(
           jsonb_set(
             jsonb_set(e, '{platforms}', public.canonical_platform_terms(e->'platforms')),
             '{genres}', public.canonical_genre_terms(e->'genres'))
           order by ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_games, '[]'::jsonb)) with ordinality as t(e, ord);
$$;

-- Replace a platform everywhere then remove the old term (admin only). Order
-- (ensure new exists → rewrite refs → delete old) plus the app.taxonomy_rewrite
-- flag (so the term-validation triggers don't reject a row that still carries an
-- unrelated grandfathered platform) keeps the rewrite from failing midway.
-- Returns the number of rows rewritten (for the audit + a friendly toast).
create or replace function public.admin_replace_platform(p_old text, p_new text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_old text := btrim(coalesce(p_old, ''));
  v_new text := btrim(coalesce(p_new, ''));
  v_affected integer := 0;
  n integer;
begin
  if not public.has_permission('taxonomy.manage') then raise exception 'Not authorized'; end if;
  if v_old = '' or v_new = '' then raise exception 'Both a term and its replacement are required'; end if;
  if lower(v_old) = lower(v_new) then raise exception 'The replacement must differ from the term being removed'; end if;

  -- Ensure the replacement is on the master list (supports "type a new platform").
  insert into public.platforms (name) values (v_new) on conflict (lower(name)) do nothing;

  -- This controlled rewrite only swaps v_old → v_new (now a known term); let the
  -- validation triggers skip rows so an unrelated legacy term doesn't block them.
  perform set_config('app.taxonomy_rewrite', 'true', true);

  update public.catalog_games c
     set platforms = public.jsonb_text_array_replace(c.platforms, v_old, v_new), updated_at = now()
   where exists (select 1 from jsonb_array_elements_text(coalesce(c.platforms, '[]'::jsonb)) x
                  where lower(x) = lower(v_old));
  get diagnostics n = row_count; v_affected := v_affected + n;

  -- The RAWG platforms source that re-seeds catalog_games (see the catalog seed).
  -- Must be rewritten too, or the stale term reappears and the seed's validation
  -- trigger rejects it on the next schema run.
  update public.game_catalog gc
     set platforms = public.jsonb_text_array_replace(gc.platforms, v_old, v_new), updated_at = now()
   where exists (select 1 from jsonb_array_elements_text(coalesce(gc.platforms, '[]'::jsonb)) x
                  where lower(x) = lower(v_old));
  get diagnostics n = row_count; v_affected := v_affected + n;

  update public.games g
     set platforms = public.jsonb_text_array_replace(g.platforms, v_old, v_new),
         copies    = public.jsonb_copies_replace_platform(g.copies, v_old, v_new)
   where exists (select 1 from jsonb_array_elements_text(coalesce(g.platforms, '[]'::jsonb)) x
                  where lower(x) = lower(v_old))
      or exists (select 1 from jsonb_array_elements(coalesce(g.copies, '[]'::jsonb)) c
                  where lower(c->>'platform') = lower(v_old));
  get diagnostics n = row_count; v_affected := v_affected + n;

  update public.game_submissions s
     set platforms = public.jsonb_text_array_replace(s.platforms, v_old, v_new)
   where exists (select 1 from jsonb_array_elements_text(coalesce(s.platforms, '[]'::jsonb)) x
                  where lower(x) = lower(v_old));
  get diagnostics n = row_count; v_affected := v_affected + n;

  update public.compilation_templates t
     set games = (
       select coalesce(jsonb_agg(
                case when e ? 'platforms'
                     then jsonb_set(e, '{platforms}',
                            public.jsonb_text_array_replace(e->'platforms', v_old, v_new))
                     else e end
                order by ord
              ), '[]'::jsonb)
       from jsonb_array_elements(coalesce(t.games, '[]'::jsonb)) with ordinality as g2(e, ord)
     ), updated_at = now()
   where exists (
     select 1 from jsonb_array_elements(coalesce(t.games, '[]'::jsonb)) e,
                   jsonb_array_elements_text(coalesce(e->'platforms', '[]'::jsonb)) x
      where lower(x) = lower(v_old)
   );
  get diagnostics n = row_count; v_affected := v_affected + n;

  delete from public.platforms where lower(name) = lower(v_old);

  insert into public.taxonomy_events (actor, kind, action, old_value, new_value, affected)
  values (auth.uid(), 'platform', 'replace', v_old, v_new, v_affected);

  return v_affected;
end;
$$;

-- Replace a genre everywhere then remove the old term (admin only). Same shape as
-- admin_replace_platform minus copies (genres aren't recorded on owned copies).
create or replace function public.admin_replace_genre(p_old text, p_new text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_old text := btrim(coalesce(p_old, ''));
  v_new text := btrim(coalesce(p_new, ''));
  v_affected integer := 0;
  n integer;
begin
  if not public.has_permission('taxonomy.manage') then raise exception 'Not authorized'; end if;
  if v_old = '' or v_new = '' then raise exception 'Both a term and its replacement are required'; end if;
  if lower(v_old) = lower(v_new) then raise exception 'The replacement must differ from the term being removed'; end if;

  insert into public.genres (name) values (v_new) on conflict (lower(name)) do nothing;

  -- This controlled rewrite only swaps v_old → v_new (now a known term); let the
  -- validation triggers skip rows so an unrelated legacy term doesn't block them.
  perform set_config('app.taxonomy_rewrite', 'true', true);

  update public.catalog_games c
     set genres = public.jsonb_text_array_replace(c.genres, v_old, v_new), updated_at = now()
   where exists (select 1 from jsonb_array_elements_text(coalesce(c.genres, '[]'::jsonb)) x
                  where lower(x) = lower(v_old));
  get diagnostics n = row_count; v_affected := v_affected + n;

  update public.games g
     set genres = public.jsonb_text_array_replace(g.genres, v_old, v_new)
   where exists (select 1 from jsonb_array_elements_text(coalesce(g.genres, '[]'::jsonb)) x
                  where lower(x) = lower(v_old));
  get diagnostics n = row_count; v_affected := v_affected + n;

  update public.game_submissions s
     set genres = public.jsonb_text_array_replace(s.genres, v_old, v_new)
   where exists (select 1 from jsonb_array_elements_text(coalesce(s.genres, '[]'::jsonb)) x
                  where lower(x) = lower(v_old));
  get diagnostics n = row_count; v_affected := v_affected + n;

  update public.compilation_templates t
     set games = (
       select coalesce(jsonb_agg(
                case when e ? 'genres'
                     then jsonb_set(e, '{genres}',
                            public.jsonb_text_array_replace(e->'genres', v_old, v_new))
                     else e end
                order by ord
              ), '[]'::jsonb)
       from jsonb_array_elements(coalesce(t.games, '[]'::jsonb)) with ordinality as g2(e, ord)
     ), updated_at = now()
   where exists (
     select 1 from jsonb_array_elements(coalesce(t.games, '[]'::jsonb)) e,
                   jsonb_array_elements_text(coalesce(e->'genres', '[]'::jsonb)) x
      where lower(x) = lower(v_old)
   );
  get diagnostics n = row_count; v_affected := v_affected + n;

  delete from public.genres where lower(name) = lower(v_old);

  insert into public.taxonomy_events (actor, kind, action, old_value, new_value, affected)
  values (auth.uid(), 'genre', 'replace', v_old, v_new, v_affected);

  return v_affected;
end;
$$;

-- Reject any write carrying a platform or genre that isn't in the master lists.
-- Shared by the table triggers below. Empty/blank entries are ignored (they're
-- dropped elsewhere). Raises 'UNKNOWN_PLATFORM:<value>' / 'UNKNOWN_GENRE:<value>'
-- so the client can show a precise message.
create or replace function public.assert_known_terms(
  p_genres jsonb, p_platforms jsonb, p_copies jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare bad text;
begin
  -- A controlled admin rewrite (admin_replace_platform / admin_replace_genre)
  -- swaps one term for another across existing rows. It must not be blocked by an
  -- unrelated, grandfathered off-list term left on a row from before the controlled
  -- taxonomy existed — that legacy value is preserved untouched. The rewrite sets
  -- this transaction-local flag, and the term it swaps in is always added to the
  -- master list first, so the bypass can never let a *new* off-list term slip in.
  if current_setting('app.taxonomy_rewrite', true) = 'true' then return; end if;

  select g into bad
  from jsonb_array_elements_text(coalesce(p_genres, '[]'::jsonb)) g
  where btrim(g) <> ''
    and not exists (select 1 from public.genres x where lower(x.name) = lower(btrim(g)))
  limit 1;
  if bad is not null then raise exception 'UNKNOWN_GENRE:%', bad; end if;

  select p into bad
  from jsonb_array_elements_text(coalesce(p_platforms, '[]'::jsonb)) p
  where btrim(p) <> ''
    and not exists (select 1 from public.platforms x where lower(x.name) = lower(btrim(p)))
  limit 1;
  if bad is not null then raise exception 'UNKNOWN_PLATFORM:%', bad; end if;

  if p_copies is not null and jsonb_typeof(p_copies) = 'array' then
    select c->>'platform' into bad
    from jsonb_array_elements(p_copies) c
    where coalesce(btrim(c->>'platform'), '') <> ''
      and not exists (select 1 from public.platforms x where lower(x.name) = lower(btrim(c->>'platform')))
    limit 1;
    if bad is not null then raise exception 'UNKNOWN_PLATFORM:%', bad; end if;
  end if;
end;
$$;

create or replace function public.games_validate_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_known_terms(NEW.genres, NEW.platforms, NEW.copies);
  return NEW;
end;
$$;
drop trigger if exists games_validate_terms on public.games;
create trigger games_validate_terms
  before insert or update of genres, platforms, copies on public.games
  for each row execute function public.games_validate_terms();

create or replace function public.catalog_games_validate_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_known_terms(NEW.genres, NEW.platforms, null);
  return NEW;
end;
$$;
drop trigger if exists catalog_games_validate_terms on public.catalog_games;
create trigger catalog_games_validate_terms
  before insert or update of genres, platforms on public.catalog_games
  for each row execute function public.catalog_games_validate_terms();

create or replace function public.game_submissions_validate_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_known_terms(NEW.genres, NEW.platforms, null);
  return NEW;
end;
$$;
drop trigger if exists game_submissions_validate_terms on public.game_submissions;
create trigger game_submissions_validate_terms
  before insert or update of genres, platforms on public.game_submissions
  for each row execute function public.game_submissions_validate_terms();

-- ---------------------------------------------------------------------------
-- Account self-service: Fresh Start + Delete Account. Both are self-gated on
-- auth.uid() (no permission key — they act only on the caller's own account)
-- and sit behind a typed multi-step confirmation in the client.
--
-- fresh_start(): wipes the CALLER's core-loop data — library, compilations,
-- economy balances, slots, and all game-derived history — and re-seeds the
-- newborn state exactly like handle_new_user. The account itself is untouched:
-- login, display name, cosmetics, badges/titles, friends, DMs, notifications,
-- board posts/submissions and roles all survive. Deleting games fires the
-- usual audit triggers (status/copy/visibility events), so the event tables
-- are wiped LAST — the trigger noise lands in tables this same transaction
-- clears; no trigger disabling needed. A permanent audit_events row (with
-- before-counts) records the reset; entity_id carries the uuid as text so the
-- record stays identifiable even if the account is later deleted.
-- ---------------------------------------------------------------------------
create or replace function public.fresh_start()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_summary       jsonb;
  v_general       integer;
  v_rotation      integer;
  v_replay        integer;
  v_completionist integer;
  v_coins         integer;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  -- Before-state snapshot for the audit record + the client's summary toast.
  select jsonb_build_object(
    'games',        (select count(*) from public.games        where user_id = v_uid),
    'compilations', (select count(*) from public.compilations where user_id = v_uid),
    'coins',    p.coins,
    'charters', p.charters,
    'vouchers', p.vouchers,
    'slots',    (select count(*) from public.user_slots where user_id = v_uid)
  ) into v_summary
  from public.profiles p where p.id = v_uid;

  if v_summary is null then
    raise exception 'Profile not found';
  end if;

  -- Library first (audit triggers fire into the event tables — wiped below),
  -- then containers, per-user grants and game-derived feed posts.
  delete from public.games        where user_id = v_uid;
  delete from public.compilations where user_id = v_uid;
  delete from public.user_slots   where user_id = v_uid;
  delete from public.rotation_checkins where user_id = v_uid;
  delete from public.action_undos      where user_id = v_uid;
  delete from public.activity_events   where actor = v_uid; -- cheers on them cascade

  -- Event history LAST so the trigger noise from the deletes above goes too.
  delete from public.compilation_events     where user_id = v_uid;
  delete from public.family_events          where user_id = v_uid;
  delete from public.game_prerequisite_events where user_id = v_uid;
  delete from public.coin_events            where user_id = v_uid;
  delete from public.playtime_events        where user_id = v_uid;
  delete from public.game_status_events     where user_id = v_uid;
  delete from public.game_visibility_events where user_id = v_uid;
  delete from public.copy_events            where user_id = v_uid;
  delete from public.like_events            where user_id = v_uid;
  delete from public.instance_split_events  where user_id = v_uid;
  delete from public.user_active_days       where user_id = v_uid;

  -- Reset the profile's core-loop columns to the newborn state (mirrors
  -- handle_new_user: lane capacities from the admin default loadout, same
  -- coalesce fallbacks). Identity/cosmetics/social/badges stay untouched.
  select default_general_slots, default_rotation_slots,
         default_replay_slots, default_completionist_slots
    into v_general, v_rotation, v_replay, v_completionist
    from public.app_config where id = 1;

  update public.profiles set
    coins                       = 120, -- keep in sync with the profiles.coins column default
    charters                    = 0,
    vouchers                    = 0,
    general_slots               = coalesce(v_general, 2),
    rotation_slots              = coalesce(v_rotation, 3),
    replay_slots                = coalesce(v_replay, 2),
    completionist_slots         = coalesce(v_completionist, 2),
    platforms                   = '[]'::jsonb,
    custom_platforms            = '[]'::jsonb,
    hidden_market               = '[]'::jsonb,
    track_editions              = false,
    onboarding_completed_at     = null,
    onboarding_vouchers_pending = true,
    -- Newborn parity: the restarted account re-claims its starter vouchers when
    -- it re-enters the Getting Started checklist (vouchers were zeroed above).
    onboarding_vouchers_granted_at = null
  where id = v_uid
  returning coins into v_coins;

  -- Re-seed the default targeted-slot loadout + the opening ledger baseline,
  -- exactly like handle_new_user does for a fresh signup.
  insert into public.user_slots (user_id, definition_id)
  select v_uid, d.id
    from public.slot_definitions d
    cross join generate_series(1, d.default_grant_count) g
   where d.active and d.default_grant_count > 0;

  perform public.log_coin_event(
    v_uid, 'opening', 0, 0, v_coins, 0, null, null, 'Opening balance'
  );

  insert into public.audit_events
    (actor_id, target_user, entity, entity_id, action, old_value, detail)
  values
    (v_uid, v_uid, 'account', v_uid::text, 'fresh_start', v_summary,
     jsonb_build_object('source', 'self_service'));

  return v_summary;
end;
$$;

-- delete_my_account(): permanent self-service account deletion (the admin
-- counterpart, admin_delete_user, forbids self-deletion). Records a tombstone
-- audit row FIRST (actor/target null out via their set-null FKs when the auth
-- row goes, but entity_id keeps the uuid as text), blanks the caller's
-- issue-board comment bodies (the rows survive authorless thanks to the
-- set-null authorship FKs in the feature tables section), then deletes the
-- auth.users row — FK cascade removes the profile, library, economy, events,
-- DMs and everything else personal.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select display_name into v_name from public.profiles where id = v_uid;
  if v_name is null then
    raise exception 'Profile not found';
  end if;

  insert into public.audit_events
    (actor_id, target_user, entity, entity_id, action, old_value, detail)
  values
    (v_uid, v_uid, 'account', v_uid::text, 'delete',
     jsonb_build_object(
       'display_name', v_name,
       'games', (select count(*) from public.games    where user_id = v_uid),
       'coins', (select coins    from public.profiles where id      = v_uid)
     ),
     jsonb_build_object('source', 'self_service'));

  -- Tombstone the departing user's comment bodies; authorship nulls when the
  -- auth row goes, so threads and other players' replies survive intact.
  update public.feature_comments set body = '[deleted]' where user_id = v_uid;

  delete from auth.users where id = v_uid;
end;
$$;

-- Supabase grants EXECUTE directly to the `anon` role by default, so revoking
-- from PUBLIC alone is not enough — revoke from `anon` too so these require login.
revoke execute on function public.apply_purchase(uuid, integer, uuid, boolean, boolean, boolean, boolean) from public, anon;
revoke execute on function public.apply_voucher_redemption(uuid, uuid, boolean) from public, anon;
revoke execute on function public.pick_start_slot(uuid, uuid, boolean)  from public, anon;
revoke execute on function public.apply_replay(uuid, uuid)              from public, anon;
revoke execute on function public.abort_replay(uuid)                    from public, anon;
revoke execute on function public.enter_replay(uuid)                    from public, anon;
revoke execute on function public.enter_completionist(uuid)             from public, anon;
revoke execute on function public.exit_completionist(uuid)             from public, anon;
revoke execute on function public.abandon_completion(uuid)             from public, anon;
revoke execute on function public.retire_rotation(uuid)                from public, anon;
revoke execute on function public.convert_to_endless(uuid)             from public, anon;
revoke execute on function public.rotation_checkin(uuid)                from public, anon;
revoke execute on function public.enter_rotation(uuid)                  from public, anon;
revoke execute on function public.exit_rotation(uuid)                   from public, anon;
revoke execute on function public.rotation_period_start(timestamptz, integer, integer, text) from public, anon;
revoke execute on function public.complete_onboarding()                 from public, anon;
revoke execute on function public.claim_onboarding_vouchers()           from public, anon;
revoke execute on function public.admin_reset_onboarding(uuid)          from public, anon;
revoke execute on function public.fresh_start()                         from public, anon;
revoke execute on function public.delete_my_account()                   from public, anon;
revoke execute on function public.apply_finish(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.undo_action(uuid)            from public, anon;
revoke execute on function public.apply_shelve(uuid)            from public, anon;
revoke execute on function public.apply_retire(uuid)            from public, anon;
revoke execute on function public.move_game_to_slot(uuid, uuid) from public, anon;
revoke execute on function public.link_games(uuid, uuid, uuid)  from public, anon;
revoke execute on function public.unlink_game(uuid)             from public, anon;
revoke execute on function public.set_family_cover(uuid, text, uuid) from public, anon;
revoke execute on function public.set_family_split(uuid, boolean)    from public, anon;
revoke execute on function public.set_family_primary(uuid, uuid)     from public, anon;
revoke execute on function public.sever_family(uuid)                 from public, anon;
revoke execute on function public.log_playtime(uuid, real, text, text) from public, anon;
revoke execute on function public.set_platform_playtime(uuid, text, text, real) from public, anon;
revoke execute on function public.leaderboard()                 from public, anon;
revoke execute on function public.player_library(uuid)          from public, anon;
revoke execute on function public.list_game_reviews(integer, uuid) from public, anon;
revoke execute on function public.community_game_stats(integer, uuid) from public, anon;
revoke execute on function public.list_game_likers(integer, uuid, integer, integer) from public, anon;
revoke execute on function public.log_mystery_pull(uuid, integer, text) from public, anon;
revoke execute on function public.list_profile_activity(uuid, integer) from public, anon;
revoke execute on function public.view_profile(uuid)            from public, anon;
-- are_friends is only called by other security-definer functions; no client needs it.
revoke execute on function public.are_friends(uuid, uuid)       from public, anon, authenticated;
revoke execute on function public.admin_set_coins(integer)      from public, anon;
revoke execute on function public.admin_list_users()            from public, anon;
revoke execute on function public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean, integer, integer, integer, integer, integer) from public, anon;
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
-- Internal helper (called only by the catalog-mutating RPCs, which authorize);
-- never invoked directly by clients, so revoke from authenticated too.
revoke execute on function public.refresh_compilation_templates_for_catalog(uuid) from public, anon, authenticated;
revoke execute on function public.reject_game_submission(uuid, text)  from public, anon;
revoke execute on function public.list_game_submissions()       from public, anon;
revoke execute on function public.pending_submission_count()    from public, anon;
revoke execute on function public.list_community_catalog()      from public, anon;
revoke execute on function public.admin_edit_catalog_game(uuid, text, text, jsonb, jsonb, jsonb, date, real, jsonb, boolean) from public, anon;
revoke execute on function public.admin_delete_catalog_game(uuid) from public, anon;
revoke execute on function public.list_compilation_templates()  from public, anon;
revoke execute on function public.admin_edit_compilation_template(uuid, text, jsonb, uuid) from public, anon;
revoke execute on function public.admin_set_compilation_template_image(uuid, text) from public, anon;
revoke execute on function public.admin_delete_compilation_template(uuid) from public, anon;
revoke execute on function public.ledger_totals()               from public, anon;
revoke execute on function public.buy_charter(integer)          from public, anon;
revoke execute on function public.sell_charter()                from public, anon;
revoke execute on function public.import_with_charter(uuid, boolean, date) from public, anon;
revoke execute on function public.admin_add_platform(text, integer[]) from public, anon;
revoke execute on function public.admin_add_genre(text)         from public, anon;
revoke execute on function public.admin_remove_platform(text)   from public, anon;
revoke execute on function public.admin_remove_genre(text)      from public, anon;
revoke execute on function public.admin_replace_platform(text, text) from public, anon;
revoke execute on function public.admin_replace_genre(text, text)    from public, anon;
-- Internal taxonomy validators + jsonb rewrite helpers (run by triggers / the
-- security-definer replace RPCs as the table owner); never called directly by
-- clients, so revoke from authenticated too.
revoke execute on function public.assert_known_terms(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.jsonb_text_array_replace(jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.jsonb_copies_replace_platform(jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.canonical_platform_terms(jsonb) from public, anon, authenticated;
revoke execute on function public.canonical_genre_terms(jsonb)    from public, anon, authenticated;
revoke execute on function public.canonical_template_games(jsonb) from public, anon, authenticated;
revoke execute on function public.games_validate_terms()        from public, anon, authenticated;
-- Prerequisite internals: the gate helper is called only by the cold-start
-- RPCs, the other two only by triggers — no client ever invokes them.
revoke execute on function public.assert_prerequisite_cleared(uuid) from public, anon, authenticated;
revoke execute on function public.games_validate_prerequisite()  from public, anon, authenticated;
revoke execute on function public.log_game_prerequisite_event()  from public, anon, authenticated;
-- Milestone capture runs only as the games trigger; clients CRUD the table
-- directly under RLS instead. The added_at sync likewise runs only as the
-- game_milestones trigger.
revoke execute on function public.capture_game_milestone()      from public, anon, authenticated;
revoke execute on function public.sync_added_at_from_milestones() from public, anon, authenticated;
-- Review history runs only as the games trigger.
revoke execute on function public.log_review_event()            from public, anon, authenticated;
-- Like history likewise runs only as the games trigger.
revoke execute on function public.log_like_event()              from public, anon, authenticated;
revoke execute on function public.catalog_games_validate_terms() from public, anon, authenticated;
revoke execute on function public.game_submissions_validate_terms() from public, anon, authenticated;

grant execute on function public.apply_purchase(uuid, integer, uuid, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.apply_voucher_redemption(uuid, uuid, boolean) to authenticated;
grant execute on function public.apply_replay(uuid, uuid)              to authenticated;
grant execute on function public.abort_replay(uuid)                    to authenticated;
grant execute on function public.enter_replay(uuid)                    to authenticated;
grant execute on function public.enter_completionist(uuid)             to authenticated;
grant execute on function public.exit_completionist(uuid)             to authenticated;
grant execute on function public.abandon_completion(uuid)             to authenticated;
grant execute on function public.retire_rotation(uuid)                to authenticated;
grant execute on function public.convert_to_endless(uuid)             to authenticated;
grant execute on function public.rotation_checkin(uuid)                to authenticated;
grant execute on function public.enter_rotation(uuid)                  to authenticated;
grant execute on function public.exit_rotation(uuid)                   to authenticated;
grant execute on function public.complete_onboarding()                 to authenticated;
grant execute on function public.claim_onboarding_vouchers()           to authenticated;
grant execute on function public.admin_reset_onboarding(uuid)          to authenticated;
grant execute on function public.fresh_start()                         to authenticated;
grant execute on function public.delete_my_account()                   to authenticated;
grant execute on function public.apply_finish(uuid, integer, integer, integer) to authenticated;
grant execute on function public.undo_action(uuid)            to authenticated;
grant execute on function public.apply_shelve(uuid)            to authenticated;
grant execute on function public.apply_retire(uuid)            to authenticated;
grant execute on function public.move_game_to_slot(uuid, uuid) to authenticated;
grant execute on function public.link_games(uuid, uuid, uuid)  to authenticated;
grant execute on function public.unlink_game(uuid)             to authenticated;
grant execute on function public.set_family_cover(uuid, text, uuid) to authenticated;
grant execute on function public.set_family_split(uuid, boolean)    to authenticated;
grant execute on function public.set_family_primary(uuid, uuid)     to authenticated;
grant execute on function public.sever_family(uuid)                 to authenticated;
grant execute on function public.log_playtime(uuid, real, text, text) to authenticated;
grant execute on function public.set_platform_playtime(uuid, text, text, real) to authenticated;
grant execute on function public.leaderboard()                 to authenticated;
grant execute on function public.player_library(uuid)          to authenticated;
grant execute on function public.list_game_reviews(integer, uuid) to authenticated;
grant execute on function public.community_game_stats(integer, uuid) to authenticated;
grant execute on function public.list_game_likers(integer, uuid, integer, integer) to authenticated;
grant execute on function public.log_mystery_pull(uuid, integer, text) to authenticated;
grant execute on function public.list_profile_activity(uuid, integer) to authenticated;
grant execute on function public.view_profile(uuid)            to authenticated;
grant execute on function public.admin_set_coins(integer)      to authenticated;
grant execute on function public.admin_list_users()            to authenticated;
grant execute on function public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean, integer, integer, integer, integer, integer) to authenticated;
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
grant execute on function public.admin_edit_catalog_game(uuid, text, text, jsonb, jsonb, jsonb, date, real, jsonb, boolean) to authenticated;
grant execute on function public.admin_delete_catalog_game(uuid) to authenticated;
grant execute on function public.list_compilation_templates()  to authenticated;
grant execute on function public.admin_edit_compilation_template(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.admin_set_compilation_template_image(uuid, text) to authenticated;
grant execute on function public.admin_delete_compilation_template(uuid) to authenticated;
grant execute on function public.ledger_totals()               to authenticated;
grant execute on function public.buy_charter(integer)          to authenticated;
grant execute on function public.sell_charter()                to authenticated;
grant execute on function public.import_with_charter(uuid, boolean, date) to authenticated;
grant execute on function public.admin_add_platform(text, integer[]) to authenticated;
grant execute on function public.admin_add_genre(text)         to authenticated;
grant execute on function public.admin_remove_platform(text)   to authenticated;
grant execute on function public.admin_remove_genre(text)      to authenticated;
grant execute on function public.admin_replace_platform(text, text) to authenticated;
grant execute on function public.admin_replace_genre(text, text)    to authenticated;

-- ---------------------------------------------------------------------------
-- Social — activity-feed capture trigger, friend/feed/cheer RPCs, and grants.
-- Placed at the end so every referenced object exists (profiles, games,
-- notifications, has_permission, and the social tables defined above link_games).
-- Every RPC is security-definer and gated on `social.use` (soft-launch); readers
-- raise when the caller lacks it, mutators self-scope via auth.uid().
-- ---------------------------------------------------------------------------

-- Broadcast milestones to the activity feed on the status transitions that matter.
-- AFTER UPDATE so it can't be bypassed by a client write. (family_created is
-- emitted inside link_games; imports/finishes are plain status moves captured here.)
create or replace function public.emit_game_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- An undo's own status writes are reversals, not milestones — don't broadcast them
  -- (a convert undo restores status='finished', which would otherwise post a card).
  if current_setting('app.undo_in_progress', true) = '1' then
    return new;
  end if;
  if old.status = 'wishlist' and new.status = 'backlog' then
    insert into public.activity_events (actor, kind, game_id, game_title)
    values (new.user_id, 'game_imported', new.id, new.title);
  elsif old.status is distinct from 'finished' and new.status = 'finished' then
    insert into public.activity_events (actor, kind, game_id, game_title, detail)
    values (new.user_id, 'bounty_claimed', new.id, new.title,
            jsonb_build_object('coins', coalesce(new.reward, 0)));
  end if;
  return new;
end;
$$;

drop trigger if exists games_emit_activity on public.games;
create trigger games_emit_activity
  after update on public.games
  for each row execute function public.emit_game_activity();

-- Send a friend request. Auto-accepts a reverse-pending request; re-opens a
-- previously declined edge; idempotent for an existing pending/accepted edge.
-- Returns the resulting status ('pending' | 'accepted' | 'declined').
create or replace function public.send_friend_request(p_addressee uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_existing public.friendships%rowtype;
  v_name     text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_addressee = v_me then raise exception 'Cannot friend yourself'; end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_addressee and not p.blocked
       and not coalesce((p.privacy->>'private_profile')::boolean, false)
  ) then
    raise exception 'User not available';
  end if;

  select * into v_existing from public.friendships
   where (requester = v_me and addressee = p_addressee)
      or (requester = p_addressee and addressee = v_me)
   limit 1;

  select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_me;

  -- NB: check the row directly, not FOUND — the v_name SELECT above resets FOUND, so
  -- it would always be true here and a brand-new request would wrongly take the
  -- existing-edge path and insert nothing.
  if v_existing.id is not null then
    -- Reverse pending request → accept it (mutual friendship).
    if v_existing.status = 'pending' and v_existing.requester = p_addressee then
      update public.friendships set status = 'accepted', responded_at = now()
       where id = v_existing.id;
      insert into public.friend_events (actor, target, action) values (v_me, p_addressee, 'accepted');
      insert into public.notifications (user_id, type, title, body, link)
      values (p_addressee, 'friend_accepted', 'Friend request accepted',
              v_name || ' accepted your friend request', 'social');
      return 'accepted';
    end if;
    -- A prior decline → reopen as a fresh request from us.
    if v_existing.status = 'declined' then
      update public.friendships
         set requester = v_me, addressee = p_addressee, status = 'pending',
             created_at = now(), responded_at = null
       where id = v_existing.id;
      insert into public.friend_events (actor, target, action) values (v_me, p_addressee, 'requested');
      insert into public.notifications (user_id, type, title, body, link)
      values (p_addressee, 'friend_request', 'New friend request',
              v_name || ' sent you a friend request', 'social');
      return 'pending';
    end if;
    -- Already pending-out or accepted: no-op.
    return v_existing.status;
  end if;

  insert into public.friendships (requester, addressee) values (v_me, p_addressee);
  insert into public.friend_events (actor, target, action) values (v_me, p_addressee, 'requested');
  insert into public.notifications (user_id, type, title, body, link)
  values (p_addressee, 'friend_request', 'New friend request',
          v_name || ' sent you a friend request', 'social');
  return 'pending';
end;
$$;

-- Accept or decline a pending request addressed to the caller.
create or replace function public.respond_friend_request(p_id uuid, p_accept boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_req  uuid;
  v_name text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  update public.friendships
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_id and addressee = v_me and status = 'pending'
   returning requester into v_req;
  if v_req is null then return false; end if;

  insert into public.friend_events (actor, target, action)
  values (v_me, v_req, case when p_accept then 'accepted' else 'declined' end);

  if p_accept then
    select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_me;
    insert into public.notifications (user_id, type, title, body, link)
    values (v_req, 'friend_accepted', 'Friend request accepted',
            v_name || ' accepted your friend request', 'social');
  end if;
  return true;
end;
$$;

-- Cancel a pending request the caller sent.
create or replace function public.cancel_friend_request(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_target uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  delete from public.friendships
   where id = p_id and requester = v_me and status = 'pending'
   returning addressee into v_target;
  if v_target is null then return false; end if;

  insert into public.friend_events (actor, target, action) values (v_me, v_target, 'cancelled');
  return true;
end;
$$;

-- Remove an accepted friend (either side). Hard-deletes the edge; the event log
-- preserves the history, and re-friending later is a fresh row.
create or replace function public.remove_friend(p_other uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  delete from public.friendships
   where status = 'accepted'
     and ((requester = v_me and addressee = p_other)
       or (requester = p_other and addressee = v_me));
  if not found then return false; end if;

  insert into public.friend_events (actor, target, action) values (v_me, p_other, 'removed');
  return true;
end;
$$;

-- Find users by display name, with the caller's friendship status for each so the
-- UI can show the right button. Excludes self, blocked, hidden, and private users.
create or replace function public.search_users(p_query text)
returns table (id uuid, display_name text, avatar_url text, status text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(coalesce(p_query, '')) < 1 then return; end if;

  return query
  select p.id, p.display_name, p.avatar_url,
    case
      when f.id is null then 'none'
      when f.status = 'accepted' then 'friends'
      when f.status = 'pending' and f.requester = auth.uid() then 'pending_out'
      when f.status = 'pending' then 'pending_in'
      else 'none'
    end as status
  from public.profiles p
  left join lateral (
    select ff.id, ff.status, ff.requester
      from public.friendships ff
     where (ff.requester = auth.uid() and ff.addressee = p.id)
        or (ff.requester = p.id and ff.addressee = auth.uid())
     limit 1
  ) f on true
  where p.id <> auth.uid()
    and not p.blocked and not p.hidden
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
    and p.display_name ilike '%' || p_query || '%'
  order by p.display_name
  limit 20;
end;
$$;

-- The caller's accepted friends, with privacy-respecting coins/presence and the
-- title they currently have in Now Playing.
create or replace function public.list_friends()
returns table (
  id uuid, display_name text, avatar_url text, coins integer,
  last_seen_at timestamptz, activity text, now_playing text
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  return query
  select p.id, p.display_name, p.avatar_url,
    -- Hidden-spend friends and frozen (economy-off) balances show no coins.
    case when coalesce((p.privacy->>'hide_spend')::boolean, false)
           or not p.economy_enabled
         then null else p.coins end,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false) then null else p.last_seen_at end,
    -- A private friend stays on the list (the friendship + messaging survive),
    -- but their activity string and Now Playing title are library/profile data
    -- a hard-private profile no longer shares (issue e3242526).
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
           or coalesce((p.privacy->>'private_profile')::boolean, false)
         then null else p.activity end,
    (select g.title from public.games g
      where g.user_id = p.id and g.status = 'playing' and not coalesce(g.private, false)
        and not coalesce((p.privacy->>'private_profile')::boolean, false)
      order by g.started_at desc nulls last, g.added_at desc
      limit 1) as now_playing
  from public.profiles p
  join (
    select case when requester = auth.uid() then addressee else requester end as fid
      from public.friendships
     where status = 'accepted' and auth.uid() in (requester, addressee)
  ) fr on fr.fid = p.id
  order by p.display_name;
end;
$$;

-- Pending requests involving the caller, both incoming and outgoing.
create or replace function public.list_friend_requests()
returns table (
  id uuid, direction text, other_id uuid, other_name text, other_avatar text, created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  return query
  select f.id,
    case when f.requester = auth.uid() then 'outgoing' else 'incoming' end,
    case when f.requester = auth.uid() then f.addressee else f.requester end,
    p.display_name, p.avatar_url, f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'pending' and auth.uid() in (f.requester, f.addressee)
  order by f.created_at desc;
end;
$$;

-- The activity feed: friends' milestones, newest-first, keyset-paginated on
-- created_at. Privacy is applied here at read time: appear-offline friends are
-- dropped entirely, and the coin amount is stripped from friends who hide their
-- financial milestones (default hidden). Each row carries its cheer count + whether
-- the caller has cheered.
create or replace function public.list_activity_feed(
  p_before timestamptz default null,
  p_limit  integer default 30
)
returns table (
  id uuid, actor uuid, actor_name text, actor_avatar text,
  kind text, game_title text, detail jsonb, created_at timestamptz,
  cheer_count bigint, cheered_by_me boolean
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  return query
  with friends as (
    select case when requester = auth.uid() then addressee else requester end as fid
      from public.friendships
     where status = 'accepted' and auth.uid() in (requester, addressee)
  )
  select a.id, a.actor, p.display_name, p.avatar_url,
    a.kind, a.game_title,
    case when coalesce((p.privacy->>'hide_financial_feed')::boolean, true)
         then a.detail - 'coins' else a.detail end,
    a.created_at,
    (select count(*) from public.activity_cheers c where c.event_id = a.id),
    exists (select 1 from public.activity_cheers c where c.event_id = a.id and c.user_id = auth.uid())
  from public.activity_events a
  join friends fr on fr.fid = a.actor
  join public.profiles p on p.id = a.actor
  where not coalesce((p.privacy->>'appear_offline')::boolean, false)
    -- Hard privacy: a private profile broadcasts no milestones, even to
    -- friends (issue e3242526).
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
    and (p_before is null or a.created_at < p_before)
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

-- Cheer a friend's (or your own) feed event. Idempotent; notifies the actor once.
create or replace function public.cheer_activity(p_event uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_actor   uuid;
  v_kind    text;
  v_created timestamptz;
  v_name    text;
  v_label   text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select actor, kind, created_at into v_actor, v_kind, v_created
    from public.activity_events where id = p_event;
  if v_actor is null then raise exception 'Event not available'; end if;
  -- The actor and their friends may always cheer. Anyone else may cheer only
  -- an event that's publicly visible in the Market Square's community feed —
  -- the exact list_square_activity gates (kind, launch floor, and the actor's
  -- privacy stack), so a private/opted-out player's events stay uncheerable
  -- by strangers even if an event id leaks.
  if v_actor <> v_me and not exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester = v_me and f.addressee = v_actor)
         or (f.requester = v_actor and f.addressee = v_me))
  ) then
    if v_kind not in ('bounty_claimed', 'co_op_completed')
      or v_created < timestamptz '2026-07-18 00:00:00+00'
      or not exists (
        select 1 from public.profiles p
         where p.id = v_actor
           and not p.hidden
           and not coalesce((p.privacy->>'appear_offline')::boolean, false)
           and not coalesce((p.privacy->>'private_profile')::boolean, false)
           and not coalesce((p.privacy->>'hide_from_square')::boolean, false)
      )
    then
      raise exception 'Event not available';
    end if;
  end if;

  insert into public.activity_cheers (event_id, user_id) values (p_event, v_me)
    on conflict do nothing;
  if not found then return true; end if; -- already cheered: no duplicate notification

  if v_actor <> v_me then
    select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_me;
    v_label := case v_kind
                 when 'bounty_claimed' then 'finished game'
                 when 'family_created' then 'new Game Family'
                 else 'activity' end;
    insert into public.notifications (user_id, type, title, body, link)
    values (v_actor, 'activity_cheer', 'You got a cheer',
            v_name || ' cheered your ' || v_label, 'social');
  end if;
  return true;
end;
$$;

-- Un-cheer (toggle off).
create or replace function public.uncheer_activity(p_event uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  delete from public.activity_cheers where event_id = p_event and user_id = v_me;
  return true;
end;
$$;

-- Lock the social RPCs to signed-in users (the body re-checks social.use); the
-- trigger function is never called directly. Mirrors the view_profile/leaderboard
-- treatment for cross-user definer readers.
revoke execute on function public.emit_game_activity()                from public, anon, authenticated;
revoke execute on function public.send_friend_request(uuid)           from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_friend_request(uuid)         from public, anon;
revoke execute on function public.remove_friend(uuid)                 from public, anon;
revoke execute on function public.search_users(text)                  from public, anon;
revoke execute on function public.list_friends()                      from public, anon;
revoke execute on function public.list_friend_requests()              from public, anon;
revoke execute on function public.list_activity_feed(timestamptz, integer) from public, anon;
revoke execute on function public.cheer_activity(uuid)                from public, anon;
revoke execute on function public.uncheer_activity(uuid)              from public, anon;

grant execute on function public.send_friend_request(uuid)            to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid)          to authenticated;
grant execute on function public.remove_friend(uuid)                  to authenticated;
grant execute on function public.search_users(text)                   to authenticated;
grant execute on function public.list_friends()                       to authenticated;
grant execute on function public.list_friend_requests()               to authenticated;
grant execute on function public.list_activity_feed(timestamptz, integer) to authenticated;
grant execute on function public.cheer_activity(uuid)                 to authenticated;
grant execute on function public.uncheer_activity(uuid)               to authenticated;

-- ---------------------------------------------------------------------------
-- Social Phase 2 — direct messages (friends-only DMs). Same social.use gate.
-- All security-definer + self-scoped via auth.uid(). Each per-side mutation
-- checks `found` immediately after its own UPDATE (no intervening query — see the
-- send_friend_request FOUND-clobber fix).
-- ---------------------------------------------------------------------------

-- Send a DM to a friend. Friends-only; optional game-card snapshot (the sender's
-- own game). Returns the new message id. Deliberately does NOT create a bell
-- notification — the envelope's unread badge is the messaging indicator, so a DM
-- doesn't double up as a notification too.
-- Signature change (added p_reply_to, then p_images): drop older versions first.
drop function if exists public.send_message(uuid, text, uuid);
drop function if exists public.send_message(uuid, text, uuid, uuid);
create or replace function public.send_message(
  p_recipient uuid, p_body text, p_game uuid default null, p_reply_to uuid default null,
  p_images jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
  v_id     uuid;
  v_title  text;
  v_image  text;
  v_reply  uuid := null;
  v_images jsonb := coalesce(p_images, '[]'::jsonb);
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_recipient = v_me then raise exception 'Cannot message yourself'; end if;
  if length(v_body) > 4000 then raise exception 'Message is too long'; end if;
  if jsonb_typeof(v_images) <> 'array' then raise exception 'Invalid images'; end if;
  if jsonb_array_length(v_images) > 5 then raise exception 'Too many images (max 5)'; end if;

  if not exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester = v_me and f.addressee = p_recipient)
         or (f.requester = p_recipient and f.addressee = v_me))
  ) then
    raise exception 'You can only message friends';
  end if;

  -- Optional embedded game card — only if it's the sender's own game. Snapshot the
  -- title + cover so the card survives the game being deleted later.
  if p_game is not null then
    select title, image into v_title, v_image from public.games where id = p_game and user_id = v_me;
  end if;

  -- Optional quoted message — must belong to this same 1:1 conversation.
  if p_reply_to is not null then
    select id into v_reply from public.messages
     where id = p_reply_to
       and ((sender = v_me and recipient = p_recipient)
         or (sender = p_recipient and recipient = v_me));
  end if;

  -- A message must carry something — text, a (valid, own) game card, or image(s).
  if v_body = '' and v_title is null and jsonb_array_length(v_images) = 0 then
    raise exception 'Message is empty';
  end if;

  insert into public.messages (sender, recipient, body, game_id, game_title, game_image, reply_to, images)
  values (v_me, p_recipient, v_body,
          case when v_title is not null then p_game else null end, v_title, v_image, v_reply, v_images)
  returning id into v_id;

  return v_id;
end;
$$;

-- Toggle an emoji reaction on a message you're part of. Server-authoritative like
-- the rest of messaging; validates the emoji palette and your participation, and
-- records an append-only audit row (added/removed). Idempotent.
create or replace function public.toggle_message_reaction(p_message uuid, p_emoji text, p_on boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_emoji not in ('👍', '❤️', '🎉', '😄') then raise exception 'Invalid reaction'; end if;
  -- Only the recipient may react — you can't react to your own messages.
  if not exists (
    select 1 from public.messages m
     where m.id = p_message and m.recipient = v_me and m.deleted_at is null
  ) then
    raise exception 'Cannot react to this message';
  end if;

  if p_on then
    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_message, v_me, p_emoji)
    on conflict do nothing;
  else
    delete from public.message_reactions
     where message_id = p_message and user_id = v_me and emoji = p_emoji;
  end if;

  insert into public.message_reaction_events (message_id, user_id, emoji, action)
  values (p_message, v_me, p_emoji, case when p_on then 'added' else 'removed' end);

  return true;
end;
$$;

-- Superseded by the conversation model + per-message tombstone below.
drop function if exists public.list_messages(text);
drop function if exists public.mark_message_read(uuid);
drop function if exists public.archive_message(uuid, boolean);

-- Edit the caller's MOST RECENT message in a conversation (sender-only). Sets
-- edited_at so the client can show an "(edited)" marker.
create or replace function public.edit_message(p_id uuid, p_body text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_body    text := btrim(coalesce(p_body, ''));
  v_other   uuid;
  v_created timestamptz;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_body = '' then raise exception 'Message is empty'; end if;
  if length(v_body) > 4000 then raise exception 'Message is too long'; end if;

  -- Must be the caller's own, non-deleted message.
  select recipient, created_at into v_other, v_created
    from public.messages where id = p_id and sender = v_me and deleted_at is null;
  if v_other is null then return false; end if;

  -- Only the caller's latest message in that conversation is editable.
  if exists (
    select 1 from public.messages m2
     where m2.sender = v_me and m2.recipient = v_other and m2.deleted_at is null
       and m2.created_at > v_created
  ) then
    raise exception 'Only your most recent message can be edited';
  end if;

  update public.messages set body = v_body, edited_at = now() where id = p_id;
  return true;
end;
$$;

-- Delete one of the caller's own messages for EVERYONE (a two-sided tombstone): the
-- body/embedded card are cleared and both parties see "This message was deleted".
create or replace function public.delete_message(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  update public.messages
     set deleted_at = now(), body = '', game_id = null, game_title = null,
         game_image = null, edited_at = null
   where id = p_id and sender = v_me and deleted_at is null;
  return found;
end;
$$;

-- Unread received messages — drives the envelope badge. Excludes tombstoned
-- messages and chats the caller has removed (hidden).
create or replace function public.unread_message_count()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select count(*) into v_n from public.messages
   where recipient = auth.uid() and read_at is null
     and deleted_at is null and recipient_hidden_at is null;
  return coalesce(v_n, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversation view: the inbox is grouped into per-friend threads (chat-style).
-- "Removing" a chat (remove_conversation) just HIDES it per-side — Discord-style:
-- it drops off your list until there's newer activity, and the full history is
-- intact when you reopen it (history is never destroyed). Per-message deletes are
-- the two-sided tombstone above (delete_message); Archive tucks a chat into the
-- Archived tab (still browsable), distinct from removing it.
-- ---------------------------------------------------------------------------

-- One row per friend the caller has ever messaged with, EXCEPT chats they've removed
-- with no newer activity since (hidden). Carries the latest message, unread count,
-- whether it's archived, and whether the latest message is a tombstone.
-- Dropped first: the return shape changed (added last_deleted).
drop function if exists public.list_conversations();
create or replace function public.list_conversations()
returns table (
  other_id uuid, other_name text, other_avatar text,
  last_body text, last_outgoing boolean, last_created_at timestamptz,
  last_deleted boolean, unread_count bigint, archived boolean
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  return query
  with latest as (
    select distinct on (o_id)
      o_id, body, game_title, images, deleted_at, (sender = auth.uid()) as outgoing, created_at,
      case when sender = auth.uid() then sender_hidden_at   else recipient_hidden_at   end as my_hidden_at,
      case when sender = auth.uid() then sender_archived_at else recipient_archived_at end as my_archived_at
    from (
      select m.*, case when m.sender = auth.uid() then m.recipient else m.sender end as o_id
      from public.messages m
      where m.sender = auth.uid() or m.recipient = auth.uid()
    ) x
    order by o_id, created_at desc, id desc
  )
  select
    l.o_id, p.display_name, p.avatar_url,
    -- An embed-only message shows the shared game's title; an image-only one a label.
    coalesce(
      nullif(l.body, ''), l.game_title,
      case when jsonb_array_length(coalesce(l.images, '[]'::jsonb)) > 0 then '📷 Photo' else '' end
    ), l.outgoing, l.created_at,
    (l.deleted_at is not null),
    (select count(*) from public.messages u
       where u.recipient = auth.uid() and u.sender = l.o_id
         and u.read_at is null and u.deleted_at is null and u.recipient_hidden_at is null) as unread_count,
    (l.my_archived_at is not null) as archived
  from latest l
  join public.profiles p on p.id = l.o_id
  where l.my_hidden_at is null  -- removed chats stay off the list until newer activity
  order by l.created_at desc;
end;
$$;

-- The full message history between the caller and one other user (oldest first).
-- History is always returned in full — removing a chat only hides it from the list.
-- Tombstoned messages come back blanked with deleted=true. RETURNS TABLE shape has
-- changed over time (edited_at/deleted, then reactions + quoted-message columns) so
-- drop first.
drop function if exists public.list_thread(uuid);
create or replace function public.list_thread(p_other uuid)
returns table (
  id uuid, sender uuid, recipient uuid, outgoing boolean,
  other_id uuid, other_name text, other_avatar text,
  body text, game_id uuid, game_title text, game_image text,
  read_at timestamptz, created_at timestamptz, edited_at timestamptz, deleted boolean,
  images jsonb,
  reactions jsonb, my_reactions text[],
  reply_to uuid, reply_body text, reply_outgoing boolean, reply_deleted boolean,
  reply_game_title text, reply_game_image text
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  return query
  select m.id, m.sender, m.recipient, (m.sender = v_me) as outgoing,
    p.id, p.display_name, p.avatar_url,
    case when m.deleted_at is not null then '' else m.body end,
    case when m.deleted_at is not null then null else m.game_id end,
    case when m.deleted_at is not null then null else m.game_title end,
    case when m.deleted_at is not null then null else m.game_image end,
    m.read_at, m.created_at, m.edited_at, (m.deleted_at is not null),
    case when m.deleted_at is not null then '[]'::jsonb else m.images end,
    -- emoji → count tally for this message
    (
      select coalesce(jsonb_object_agg(t.emoji, t.n), '{}'::jsonb)
        from (
          select r.emoji, count(*) as n
            from public.message_reactions r
           where r.message_id = m.id
           group by r.emoji
        ) t
    ) as reactions,
    -- which of those the caller added
    (
      select coalesce(array_agg(r.emoji), '{}')
        from public.message_reactions r
       where r.message_id = m.id and r.user_id = v_me
    ) as my_reactions,
    -- quoted message snapshot (tombstone-aware), resolved from the same thread
    m.reply_to,
    case when q.id is null then null
         when q.deleted_at is not null then ''
         else q.body end as reply_body,
    case when q.id is null then null else (q.sender = v_me) end as reply_outgoing,
    case when q.id is null then null else (q.deleted_at is not null) end as reply_deleted,
    case when q.id is null or q.deleted_at is not null then null else q.game_title end as reply_game_title,
    case when q.id is null or q.deleted_at is not null then null else q.game_image end as reply_game_image
  from public.messages m
  join public.profiles p on p.id = p_other
  left join public.messages q on q.id = m.reply_to
  where (m.sender = v_me and m.recipient = p_other)
     or (m.sender = p_other and m.recipient = v_me)
  order by m.created_at asc, m.id asc
  limit 500;
end;
$$;

-- Mark every unread message FROM p_other (to the caller) read. Returns how many.
create or replace function public.mark_thread_read(p_other uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  with upd as (
    update public.messages set read_at = now()
     where recipient = auth.uid() and sender = p_other and read_at is null
     returning 1
  )
  select count(*) into v_n from upd;
  return coalesce(v_n, 0);
end;
$$;

-- Archive (or un-archive) the caller's side of a whole conversation.
create or replace function public.archive_conversation(p_other uuid, p_archived boolean default true)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_ts timestamptz := case when p_archived then now() else null end;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  update public.messages
     set sender_archived_at    = case when sender = v_me then v_ts else sender_archived_at end,
         recipient_archived_at = case when recipient = v_me then v_ts else recipient_archived_at end
   where (sender = v_me and recipient = p_other) or (sender = p_other and recipient = v_me);
  return found;
end;
$$;

-- Remove (hide) the caller's view of a whole conversation — Discord-style. History
-- is preserved; the chat reappears (full history intact) on newer activity or when
-- reopened from the friend. Supersedes the old delete_conversation.
drop function if exists public.delete_conversation(uuid);
create or replace function public.remove_conversation(p_other uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  update public.messages
     set sender_hidden_at    = case when sender = v_me then now() else sender_hidden_at end,
         recipient_hidden_at = case when recipient = v_me then now() else recipient_hidden_at end
   where (sender = v_me and recipient = p_other) or (sender = p_other and recipient = v_me);
  return found;
end;
$$;

revoke execute on function public.send_message(uuid, text, uuid, uuid, jsonb) from public, anon;
revoke execute on function public.edit_message(uuid, text)             from public, anon;
revoke execute on function public.delete_message(uuid)                 from public, anon;
revoke execute on function public.unread_message_count()               from public, anon;
revoke execute on function public.list_conversations()                 from public, anon;
revoke execute on function public.list_thread(uuid)                    from public, anon;
revoke execute on function public.mark_thread_read(uuid)               from public, anon;
revoke execute on function public.archive_conversation(uuid, boolean)  from public, anon;
revoke execute on function public.remove_conversation(uuid)            from public, anon;
revoke execute on function public.toggle_message_reaction(uuid, text, boolean) from public, anon;

grant execute on function public.send_message(uuid, text, uuid, uuid, jsonb)  to authenticated;
grant execute on function public.edit_message(uuid, text)              to authenticated;
grant execute on function public.delete_message(uuid)                  to authenticated;
grant execute on function public.unread_message_count()                to authenticated;
grant execute on function public.list_conversations()                  to authenticated;
grant execute on function public.list_thread(uuid)                     to authenticated;
grant execute on function public.mark_thread_read(uuid)                to authenticated;
grant execute on function public.archive_conversation(uuid, boolean)   to authenticated;
grant execute on function public.remove_conversation(uuid)             to authenticated;
grant execute on function public.toggle_message_reaction(uuid, text, boolean)  to authenticated;

-- ---------------------------------------------------------------------------
-- Social Phase 3 — Co-op Pacts (issue d57afe4f): two friends bind copies of the
-- same game (matched by catalog identity, any platform) into a shared
-- playthrough. The inviter picks a friend who owns the title; accepting runs the
-- invitee's normal activation (their client-computed price, their lane pick)
-- and links both cards. Both sides finishing pays each player a Completion
-- Bounty bonus (bonus_pct, snapshotted at accept — wired in the economy phase).
-- Everything is security-definer + self-scoped, like the rest of social; the
-- client additionally gates the UI on the social.use permission (soft-launch).
-- ---------------------------------------------------------------------------

create table if not exists public.co_op_pacts (
  id                  uuid primary key default gen_random_uuid(),
  inviter             uuid not null references auth.users (id) on delete cascade,
  invitee             uuid not null references auth.users (id) on delete cascade,
  -- The bound cards. on delete set null so a deleted game leaves the pact row
  -- (and its history) intact; the games guard trigger dissolves the pact.
  -- invitee_game stays null until the invite is accepted.
  inviter_game        uuid references public.games (id) on delete set null,
  invitee_game        uuid references public.games (id) on delete set null,
  -- Catalog identity ('r:<rawg_id>' / 'c:<catalog_id>' — mirrors
  -- finished_game_stats) + a title snapshot that survives deletes.
  game_key            text not null,
  title               text not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'active', 'declined', 'dissolved', 'completed')),
  -- Co-op bonus percentage snapshotted at accept time, so a later admin config
  -- change never alters an in-flight pact's payout.
  bonus_pct           integer,
  inviter_finished_at timestamptz,
  invitee_finished_at timestamptz,
  created_at          timestamptz not null default now(),
  responded_at        timestamptz,
  ended_at            timestamptz,
  ended_by            uuid references auth.users (id) on delete set null,
  end_reason          text,
  check (inviter <> invitee)
);

-- One LIVE pact per player per game identity, per role; the invite RPC also
-- blocks the cross-role duplicate (inviter on one, invitee on another).
create unique index if not exists co_op_pacts_inviter_live_idx
  on public.co_op_pacts (inviter, game_key) where status in ('pending', 'active');
create unique index if not exists co_op_pacts_invitee_live_idx
  on public.co_op_pacts (invitee, game_key) where status in ('pending', 'active');
-- The games guard trigger's lookups (every games update checks these — keep cheap).
create index if not exists co_op_pacts_inviter_game_idx
  on public.co_op_pacts (inviter_game) where status in ('pending', 'active');
create index if not exists co_op_pacts_invitee_game_idx
  on public.co_op_pacts (invitee_game) where status in ('pending', 'active');

-- Append-only audit of every pact lifecycle event (capture-history rule). Both
-- user FKs set null so the trail survives account removal.
create table if not exists public.co_op_pact_events (
  id         uuid primary key default gen_random_uuid(),
  pact_id    uuid references public.co_op_pacts (id) on delete set null,
  actor      uuid references auth.users (id) on delete set null,
  target     uuid references auth.users (id) on delete set null,
  action     text not null
               check (action in ('invited', 'accepted', 'declined', 'dissolved',
                                 'half_finished', 'completed', 'fee_offer', 'fee_shortfall')),
  title      text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists co_op_pact_events_actor_idx
  on public.co_op_pact_events (actor, created_at desc);

alter table public.co_op_pacts       enable row level security;
alter table public.co_op_pact_events enable row level security;
revoke insert, update, delete on public.co_op_pacts       from authenticated, anon;
revoke insert, update, delete on public.co_op_pact_events from authenticated, anon;

drop policy if exists "co_op_pacts_select" on public.co_op_pacts;
create policy "co_op_pacts_select" on public.co_op_pacts
  for select to authenticated using (
    auth.uid() in (inviter, invitee)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "co_op_pact_events_select" on public.co_op_pact_events;
create policy "co_op_pact_events_select" on public.co_op_pact_events
  for select to authenticated using (
    auth.uid() in (actor, target)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- The admin economy knob for the both-finished payout (0–100, like the other
-- rate levers; editable in the admin Economy panel).
alter table public.app_config add column if not exists co_op_bonus_pct integer not null default 25;
alter table public.app_config drop constraint if exists app_config_co_op_bonus_pct_check;
alter table public.app_config add constraint app_config_co_op_bonus_pct_check
  check (co_op_bonus_pct between 0 and 100);

-- Each side's escrowed bonus in coins, SNAPSHOTTED when that side's half is
-- stamped (bonus_pct of the coins that finish actually paid) — denormalized so
-- the payout survives the finished card being deleted before the partner's
-- half lands. Paid out (both at once) when the pact completes.
alter table public.co_op_pacts add column if not exists inviter_bonus integer;
alter table public.co_op_pacts add column if not exists invitee_bonus integer;

-- Player 2 joins (2026-07-18): a pact invite may now target a friend who does
-- NOT own the game — accepting auto-adds it to their library with a "Player 2"
-- copy (acquisition 'player2': they play on the inviter's copy; see
-- normalize_copies / src/lib/copies.ts). The charter is waived for that add —
-- the standard coin activation fee still applies (user-approved economy call).
--   covers_fee: the inviter's standing offer to pay the invitee's activation
--     fee — chosen at invite time, or offered/retracted later on a pending
--     invite via set_co_op_pact_fee_offer. Settled at ACCEPT: if the inviter
--     can afford the fee right then it's debited from THEM and the invitee's
--     card is activated at price_paid 0 (like a voucher redemption, so a later
--     shelve refunds nothing and the gift can't be converted back into coins).
--     When they can't, nothing falls back silently: the accept stops and
--     reports the shortfall unless the invitee explicitly chose to pay their
--     own way (p_self_pay — see respond_co_op_pact).
--   gifted_fee: the coins the inviter actually covered, stamped at accept
--     (null = nobody gifted anything) — the durable record of the gift.
alter table public.co_op_pacts add column if not exists covers_fee boolean not null default false;
alter table public.co_op_pacts add column if not exists gifted_fee integer;

-- Fee-offer follow-up (2026-07-18): two new pact event actions —
--   'fee_offer'     the inviter offered (or retracted) covering the invitee's
--                   activation fee on an already-sent pending invite
--                   (set_co_op_pact_fee_offer; detail.cover says which way);
--   'fee_shortfall' an accept attempt found nobody able/willing to pay the fee
--                   right now (detail.price) — the accept stopped with no
--                   changes (see respond_co_op_pact).
-- The inline check was created with this auto-generated name; widen it in place.
alter table public.co_op_pact_events drop constraint if exists co_op_pact_events_action_check;
alter table public.co_op_pact_events add constraint co_op_pact_events_action_check
  check (action in ('invited', 'accepted', 'declined', 'dissolved',
                    'half_finished', 'completed', 'fee_offer', 'fee_shortfall'));

-- A completed pact broadcasts to BOTH players' activity feeds — widen the feed
-- kinds (the inline check was created with this auto-generated name).
alter table public.activity_events drop constraint if exists activity_events_kind_check;
alter table public.activity_events add constraint activity_events_kind_check
  check (kind in ('game_imported', 'family_created', 'bounty_claimed', 'co_op_completed'));

-- A game's catalog identity for pact matching — shared spelling with
-- finished_game_stats/catalogKey. Null for hand-typed customs (no identity), so
-- those can't be pacted (nothing to match the partner's copy against).
create or replace function public.co_op_game_key(p_rawg integer, p_catalog uuid)
returns text
language sql immutable
as $$
  select coalesce('r:' || p_rawg::text, 'c:' || p_catalog::text);
$$;

-- Friends eligible for a pact on this game: EVERY accepted friend who isn't
-- blocked or hard-private and has no live pact with anyone on it. owns_game
-- tells the picker whether they hold the same catalog identity (any platform,
-- not wishlist) — a friend who doesn't would join as Player 2 on the caller's
-- copy (the game is auto-added to their library at accept). Owners sort first.
-- Dropped first: owns_game was added (RETURNS TABLE shape change).
drop function if exists public.co_op_partner_options(uuid);
create or replace function public.co_op_partner_options(p_game uuid)
returns table (id uuid, display_name text, avatar_url text, owns_game boolean)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_me  uuid := auth.uid();
  v_key text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select public.co_op_game_key(g.rawg_id, g.catalog_id) into v_key
    from public.games g where g.id = p_game and g.user_id = v_me;
  if v_key is null then return; end if;

  return query
  select p.id, p.display_name, p.avatar_url,
         exists (
           select 1 from public.games g
            where g.user_id = p.id and g.status <> 'wishlist'
              and public.co_op_game_key(g.rawg_id, g.catalog_id) = v_key
         ) as owns_game
  from public.profiles p
  join (
    select case when requester = v_me then addressee else requester end as fid
      from public.friendships
     where status = 'accepted' and v_me in (requester, addressee)
  ) fr on fr.fid = p.id
  where not p.blocked
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
    and not exists (
      select 1 from public.co_op_pacts cp
       where cp.status in ('pending', 'active') and cp.game_key = v_key
         and p.id in (cp.inviter, cp.invitee)
    )
  order by owns_game desc, p.display_name;
end;
$$;

-- Invite a friend to a Co-op Pact on one of the caller's games. Validates
-- friendship, availability and no live duplicate; notifies the invitee.
-- The friend no longer has to own the game (2026-07-18): a non-owner joins as
-- Player 2 — accepting auto-adds the game to their library (charter waived,
-- activation fee still due). p_cover_fee is the inviter's offer to pay that
-- fee for them (settled at accept; see the covers_fee column note above).
-- Returns the new pact id.
-- Dropped first: p_cover_fee was added (a defaulted extra arg would otherwise
-- leave an ambiguous overload for PostgREST).
drop function if exists public.invite_co_op_pact(uuid, uuid);
create or replace function public.invite_co_op_pact(
  p_game uuid, p_partner uuid, p_cover_fee boolean default false
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me           uuid := auth.uid();
  v_key          text;
  v_title        text;
  v_pact         uuid;
  v_name         text;
  v_partner_game uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_partner = v_me then raise exception 'You can''t pact with yourself'; end if;
  if not public.are_friends(v_me, p_partner) then
    raise exception 'You can only invite friends';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_partner and not p.blocked
       and not coalesce((p.privacy->>'private_profile')::boolean, false)
  ) then
    raise exception 'User not available';
  end if;

  select public.co_op_game_key(g.rawg_id, g.catalog_id), g.title into v_key, v_title
    from public.games g
   where g.id = p_game and g.user_id = v_me and g.status <> 'wishlist';
  if not found then raise exception 'Game not available for a pact'; end if;
  if v_key is null then
    raise exception 'This game has no shared identity to match a partner''s copy';
  end if;

  -- One live pact per player per game, either role, either side.
  if exists (
    select 1 from public.co_op_pacts cp
     where cp.status in ('pending', 'active') and cp.game_key = v_key
       and (v_me in (cp.inviter, cp.invitee) or p_partner in (cp.inviter, cp.invitee))
  ) then
    raise exception 'A pact for this game already exists';
  end if;

  -- The partner's copy, if any — preferring an owned card over a wishlist
  -- entry — so the notification can deep-link to it. A partner with no card at
  -- all gets a 'coop:' link instead (opens the Player 2 join flow; they have
  -- no game page to land on).
  select g.id into v_partner_game
    from public.games g
   where g.user_id = p_partner
     and public.co_op_game_key(g.rawg_id, g.catalog_id) = v_key
   order by (g.status <> 'wishlist') desc, g.added_at desc
   limit 1;

  insert into public.co_op_pacts (inviter, invitee, inviter_game, game_key, title, covers_fee)
  values (v_me, p_partner, p_game, v_key, v_title, coalesce(p_cover_fee, false))
  returning id into v_pact;

  -- The inviter's own playing copy moves into the Co-op lane right away — the
  -- invite must not keep hogging a Focus/targeted slot while the friend
  -- decides (the card wears the pending pact badge there). Plain Focus games
  -- only: Completionist/Rotation/Replay entries keep their lane + economics,
  -- and a Bazaar card simply lands in the Co-op lane when later bought (the
  -- games_sync_co_op trigger). Like every lane exit, the seat is kept until
  -- the game leaves play — even if this invite is declined or withdrawn.
  update public.games g
     set co_op = true, slot_id = null
   where g.id = p_game and g.user_id = v_me and g.status = 'playing'
     and not coalesce(g.in_rotation, false)
     and not coalesce(g.completionist, false)
     and not coalesce(g.resumed, false)
     and not coalesce(g.ongoing, false)
     and not coalesce(g.co_op, false);

  insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
  values (v_pact, v_me, p_partner, 'invited', v_title,
          jsonb_build_object('cover_fee', coalesce(p_cover_fee, false),
                             'partner_owns', v_partner_game is not null));

  select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_me;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_partner, 'co_op_invite', 'Co-op Pact invite',
          v_name || ' wants to finish ' || v_title || ' together'
          || case when v_partner_game is null then ' — join as Player 2 on their copy' else '' end
          || case when coalesce(p_cover_fee, false) then ' (they''ll cover your activation fee)' else '' end,
          case when v_partner_game is not null then 'game:' || v_partner_game
               else 'coop:' || v_pact end);

  return v_pact;
end;
$$;

-- Offer (or retract) covering the invitee's activation fee on an ALREADY-SENT
-- pending invite — so a friend short on coins doesn't force a withdraw-and-
-- reinvite dance. Settlement stays at accept time (see the covers_fee note
-- above); this only flips the standing offer. Inviter-only, pending-only.
-- Logs a 'fee_offer' pact event and notifies the invitee either way.
create or replace function public.set_co_op_pact_fee_offer(p_id uuid, p_cover boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me           uuid := auth.uid();
  v_pact         public.co_op_pacts%rowtype;
  v_name         text;
  v_partner_game uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select * into v_pact from public.co_op_pacts
   where id = p_id and inviter = v_me and status = 'pending'
   for update;
  if not found then return false; end if;
  if v_pact.covers_fee = coalesce(p_cover, false) then return true; end if;

  update public.co_op_pacts set covers_fee = coalesce(p_cover, false) where id = p_id;

  insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
  values (p_id, v_me, v_pact.invitee, 'fee_offer', v_pact.title,
          jsonb_build_object('cover', coalesce(p_cover, false)));

  -- Deep-link like the invite: the invitee's own card when they hold one,
  -- else the Player 2 join flow.
  select g.id into v_partner_game
    from public.games g
   where g.user_id = v_pact.invitee
     and public.co_op_game_key(g.rawg_id, g.catalog_id) = v_pact.game_key
   order by (g.status <> 'wishlist') desc, g.added_at desc
   limit 1;

  select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_me;
  insert into public.notifications (user_id, type, title, body, link)
  values (v_pact.invitee, 'co_op_fee_offer',
          case when coalesce(p_cover, false)
               then 'Pact activation fee covered' else 'Pact fee offer retracted' end,
          case when coalesce(p_cover, false)
               then v_name || ' will now cover your activation fee for ' || v_pact.title
               else v_name || ' retracted the offer to cover your activation fee for '
                    || v_pact.title end,
          case when v_partner_game is not null then 'game:' || v_partner_game
               else 'coop:' || p_id end);

  return true;
end;
$$;

-- Accept or decline a pending pact addressed to the caller. Accepting binds one
-- of the caller's copies (p_game, or the single matching copy when omitted):
--   - a Bazaar (backlog) copy is activated through the STANDARD buy path
--     (apply_purchase: client-computed price, chosen lane, coin/slot checks);
--   - a copy already in Now Playing attaches as-is (nothing to pay);
--   - a finished (non-retired) copy attaches with that half already cleared.
-- Player 2 join (2026-07-18): when the caller owns NO copy and p_player2 is
-- true, the game is first auto-added to their library from the inviter's card
-- (catalog metadata only — never the inviter's personal state) with a single
-- 'player2' copy on the inviter's platform, then activated through the same
-- standard buy path. The charter is waived by design; the activation fee is
-- not. A wishlist-only entry is left untouched (it stays a want-list for a
-- copy of their own).
-- Gifted fee: if the pact carries covers_fee and the copy needs buying, the
-- fee is debited from the INVITER when they can afford it right now (the card
-- then activates at price_paid 0, voucher-style — no later refund).
-- fee_covered in the result says what happened. When the inviter CAN'T afford
-- it at that moment there is no silent fallback: unless the caller explicitly
-- opted to pay their own way (p_self_pay) and can, the accept stops with NO
-- changes and returns status 'pending' — the caller's signal to show the
-- shortfall — logging a 'fee_shortfall' event and notifying the inviter (first
-- time only) so they can top up or retract the offer. p_self_pay defaults
-- true so already-deployed clients keep the old fall-back-to-caller behavior.
-- Halves already finished at accept are stamped; if BOTH are, the pact
-- completes immediately (no shared playthrough happened — no bonus).
-- Returns the caller's new coin balance/slot when a purchase ran (nulls
-- otherwise), the resulting pact status, the bound card's id (freshly created
-- on a Player 2 join), and the coins the inviter covered (null when none).
-- Dropped first: p_player2 + the wider RETURNS TABLE, then p_self_pay, were
-- added (a defaulted extra arg would otherwise leave an ambiguous overload).
drop function if exists public.respond_co_op_pact(uuid, boolean, uuid, integer, uuid, boolean, boolean, boolean);
drop function if exists public.respond_co_op_pact(uuid, boolean, uuid, integer, uuid, boolean, boolean, boolean, boolean);
create or replace function public.respond_co_op_pact(
  p_id uuid, p_accept boolean, p_game uuid default null,
  p_price integer default 0, p_slot uuid default null, p_general boolean default false,
  p_completionist boolean default false, p_family_discount boolean default false,
  p_player2 boolean default false, p_self_pay boolean default true
)
returns table (coins integer, slot_id uuid, status text, game_id uuid, fee_covered integer)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_me            uuid := auth.uid();
  v_pact          public.co_op_pacts%rowtype;
  v_game          public.games%rowtype;
  v_src           public.games%rowtype;
  v_name          text;
  v_coins         integer;
  v_slot          uuid;
  v_pct           integer;
  v_inv_done      timestamptz;
  v_inv_reward    integer;
  v_status        text;
  v_platform      text;
  v_inviter_name  text;
  v_inviter_coins integer;
  v_gift          integer;
  v_created       boolean := false;
  v_fee_due       boolean;
  v_my_coins      integer;
  v_warned        boolean;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select * into v_pact from public.co_op_pacts
   where id = p_id and invitee = v_me and status = 'pending'
   for update;
  if not found then raise exception 'Pact not found'; end if;

  select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_me;

  if not p_accept then
    update public.co_op_pacts
       set status = 'declined', responded_at = now(), ended_at = now(),
           ended_by = v_me, end_reason = 'declined'
     where id = p_id;
    insert into public.co_op_pact_events (pact_id, actor, target, action, title)
    values (p_id, v_me, v_pact.inviter, 'declined', v_pact.title);
    insert into public.notifications (user_id, type, title, body, link)
    values (v_pact.inviter, 'co_op_declined', 'Co-op Pact declined',
            v_name || ' declined the pact for ' || v_pact.title,
            case when v_pact.inviter_game is not null then 'game:' || v_pact.inviter_game end);
    return query select null::integer, null::uuid, 'declined'::text, null::uuid, null::integer;
    return;
  end if;

  -- Resolve the copy to bind: the requested one, or the single matching copy.
  select g.* into v_game
    from public.games g
   where g.user_id = v_me and g.status <> 'wishlist'
     and public.co_op_game_key(g.rawg_id, g.catalog_id) = v_pact.game_key
     and (p_game is null or g.id = p_game)
   order by (g.status = 'playing') desc, g.added_at desc
   limit 1;

  if v_game.id is not null and v_game.status = 'finished'
     and coalesce(v_game.finish_tag, '') = 'retired' then
    raise exception 'You retired this game — pick another copy or un-retire it first';
  end if;

  -- Settle the inviter's gift offer BEFORE anything is created or charged.
  -- The fee is due when the bound copy needs buying: an owned Bazaar copy, or
  -- the Player 2 card about to be created (it lands in the Bazaar below). If
  -- the inviter can afford the fee right now it's debited from them and the
  -- activation later runs at 0. If they can't, nothing falls back silently:
  -- unless the caller explicitly opted to pay their own way (p_self_pay) and
  -- has the coins, stop here with NO changes — log the shortfall, tell the
  -- inviter (first time only, so repeat attempts don't spam), and return
  -- status 'pending' so the client can present the choice.
  v_fee_due := (v_game.id is null and coalesce(p_player2, false))
               or v_game.status = 'backlog';
  -- Economy off on the invitee's side: their activation runs at 0 anyway
  -- (apply_purchase forces it), so there is no fee to gift.
  if v_fee_due and coalesce(v_pact.covers_fee, false) and coalesce(p_price, 0) > 0
     and public.economy_enabled(v_me) then
    if not public.economy_enabled(v_pact.inviter) then
      -- The inviter's balance is frozen — the gift can't be honoured. Resolve
      -- like a quiet shortfall: self-pay if the caller opted in and can afford
      -- it (the standard activation below charges them), else stop with
      -- 'pending' so the client can present the choice.
      select coins into v_my_coins from public.profiles where id = v_me;
      if not coalesce(p_self_pay, true) or coalesce(v_my_coins, 0) < p_price then
        return query select null::integer, null::uuid, 'pending'::text,
                            null::uuid, null::integer;
        return;
      end if;
    else
      update public.profiles
         set coins = coins - p_price
       where id = v_pact.inviter and coins >= p_price
       returning coins into v_inviter_coins;
      if v_inviter_coins is not null then
        v_gift := p_price;
        perform public.log_coin_event(
          v_pact.inviter, 'co_op_gift', -p_price, 0, v_inviter_coins, null,
          v_pact.inviter_game, v_pact.title, null,
          jsonb_build_object('pact', p_id, 'partner', v_me)
        );
      else
        select coins into v_my_coins from public.profiles where id = v_me;
        if not coalesce(p_self_pay, true) or coalesce(v_my_coins, 0) < p_price then
          select exists (
            select 1 from public.co_op_pact_events e
             where e.pact_id = p_id and e.action = 'fee_shortfall'
          ) into v_warned;
          insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
          values (p_id, v_me, v_pact.inviter, 'fee_shortfall', v_pact.title,
                  jsonb_build_object('price', p_price));
          if not v_warned then
            insert into public.notifications (user_id, type, title, body, link)
            values (v_pact.inviter, 'co_op_fee_short', 'Your pact gift needs more coins',
                    v_name || ' tried to accept the pact for ' || v_pact.title
                    || ' but you''re short of the ' || p_price
                    || '-coin activation fee you offered to cover',
                    case when v_pact.inviter_game is not null
                         then 'game:' || v_pact.inviter_game end);
          end if;
          return query select null::integer, null::uuid, 'pending'::text,
                              null::uuid, null::integer;
          return;
        end if;
        -- The caller chose to pay their own way — the standard activation below
        -- charges them like any buy.
      end if;
    end if;
  end if;

  if v_game.id is null then
    if not coalesce(p_player2, false) then
      raise exception 'You don''t own this game';
    end if;
    -- Player 2 join: no copy of their own — add the game from the inviter's
    -- card. Catalog/metadata columns only (a custom cover stays personal: the
    -- stock cover is preferred), one 'player2' copy on the inviter's first
    -- base platform, provider = whose copy the seat is on. The insert lands in
    -- the Bazaar so the standard activation below runs unchanged; the usual
    -- games triggers audit the add.
    select g.* into v_src
      from public.games g
     where g.id = v_pact.inviter_game and g.user_id = v_pact.inviter;
    if v_src.id is null then
      raise exception 'The inviter''s copy is gone — ask them to re-invite';
    end if;
    select c->>'platform' into v_platform
      from jsonb_array_elements(coalesce(v_src.copies, '[]'::jsonb)) c
     where coalesce(c->>'format', '') <> 'dlc'
       and btrim(coalesce(c->>'platform', '')) <> ''
     limit 1;
    select coalesce(display_name, 'A friend') into v_inviter_name
      from public.profiles where id = v_pact.inviter;
    insert into public.games (
      user_id, rawg_id, catalog_id, title, released, hours, rating, metacritic,
      genres, image, stock_image, platforms, developers, esrb, ongoing,
      status, copies
    )
    values (
      v_me, v_src.rawg_id, v_src.catalog_id, v_src.title, v_src.released,
      v_src.hours, v_src.rating, v_src.metacritic, v_src.genres,
      coalesce(v_src.stock_image, v_src.image), v_src.stock_image,
      v_src.platforms, v_src.developers, v_src.esrb, coalesce(v_src.ongoing, false),
      'backlog',
      public.normalize_copies(jsonb_build_array(jsonb_build_object(
        'platform', v_platform, 'acquisition', 'player2', 'provider', v_inviter_name)))
    )
    returning * into v_game;
    v_created := true;
  end if;

  -- A backlog copy starts through the standard activation (price/coins
  -- validated exactly like a normal buy) — straight into the UNCAPPED Co-op
  -- Pacts lane, so a pact accept is never blocked by a full Focus lane and a
  -- slow partner never hogs a Focus slot. Playing/finished copies attach
  -- as-is, except a plain Focus game, which moves into the Co-op lane (its
  -- Focus slot is freed — the lane's whole point). A settled gift (above)
  -- runs the activation at 0 (voucher-style: price_paid 0, so a later shelve
  -- refunds nothing and the gift can never be turned back into the invitee's
  -- coins).
  if v_game.status = 'backlog' then
    select ap.coins, ap.slot_id into v_coins, v_slot
      from public.apply_purchase(v_game.id,
                                 case when v_gift is not null then 0 else p_price end,
                                 null, false, false, p_family_discount, true) ap;
  elsif v_game.status = 'playing'
        and not coalesce(v_game.in_rotation, false)
        and not coalesce(v_game.completionist, false)
        and not coalesce(v_game.resumed, false)
        and not coalesce(v_game.ongoing, false)
        and not coalesce(v_game.co_op, false) then
    -- A plain Focus game (general seat or a standard targeted slot) moves into
    -- the Co-op lane, giving the Focus lane its capacity back. Replay (resumed
    -- — slot_id drives the replay bonus), Completionist, Rotation and endless
    -- games keep their lane and economics; the pact just decorates them.
    update public.games set co_op = true, slot_id = null where id = v_game.id;
  end if;

  -- Snapshot the bonus knob; stamp any halves that are already finished, each
  -- with its escrowed bonus (bonus_pct of the coins that finish paid). When
  -- BOTH were already finished the pact completes immediately WITHOUT a payout
  -- — no shared playthrough happened (the guard trigger's completion path,
  -- which pays, never runs for this status write).
  select co_op_bonus_pct into v_pct from public.app_config where id = 1;
  v_pct := coalesce(v_pct, 25);
  select g.finished_at, coalesce(g.reward, 0) into v_inv_done, v_inv_reward
    from public.games g
   where g.id = v_pact.inviter_game and g.status = 'finished'
     and coalesce(g.finish_tag, '') <> 'retired';

  v_status := case when v_inv_done is not null and v_game.status = 'finished'
                   then 'completed' else 'active' end;

  update public.co_op_pacts
     set status = v_status, responded_at = now(),
         invitee_game = v_game.id,
         bonus_pct = v_pct,
         gifted_fee = v_gift,
         inviter_finished_at = v_inv_done,
         inviter_bonus = case when v_inv_done is not null
           then greatest(0, round(coalesce(v_inv_reward, 0) * v_pct / 100.0))::integer end,
         invitee_finished_at = case when v_game.status = 'finished'
                                    then coalesce(v_game.finished_at, now()) end,
         invitee_bonus = case when v_game.status = 'finished'
           then greatest(0, round(coalesce(v_game.reward, 0) * v_pct / 100.0))::integer end,
         ended_at = case when v_inv_done is not null and v_game.status = 'finished'
                         then now() end,
         end_reason = case when v_inv_done is not null and v_game.status = 'finished'
                           then 'both_already_finished' end
   where id = p_id;

  insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
  values (p_id, v_me, v_pact.inviter, 'accepted', v_pact.title,
          jsonb_build_object('player2', v_created, 'gifted_fee', v_gift));

  insert into public.notifications (user_id, type, title, body, link)
  values (v_pact.inviter, 'co_op_accepted', 'Co-op Pact accepted',
          v_name || ' accepted the pact for ' || v_pact.title || ' — good luck!'
          || case when v_created then ' They joined as Player 2 on your copy.' else '' end
          || case when v_gift is not null
                  then ' You covered their ' || v_gift || '-coin activation fee.' else '' end,
          case when v_pact.inviter_game is not null then 'game:' || v_pact.inviter_game end);

  return query select v_coins, v_slot, v_status, v_game.id, v_gift;
end;
$$;

-- Dissolve a live pact (either participant; a pending invite's inviter cancels
-- the same way). Per the pact's terms the breaker's own playing copy is shelved
-- back to the Bazaar through the standard shelve (normal refund); the partner's
-- card simply reverts to a solo playthrough. The pact row is updated FIRST so
-- the games guard trigger below sees no live pact when the shelve runs.
create or replace function public.dissolve_co_op_pact(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_pact    public.co_op_pacts%rowtype;
  v_partner uuid;
  v_mine    uuid;
  v_name    text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;

  select * into v_pact from public.co_op_pacts
   where id = p_id and v_me in (inviter, invitee) and status in ('pending', 'active')
   for update;
  if not found then return false; end if;

  v_partner := case when v_pact.inviter = v_me then v_pact.invitee else v_pact.inviter end;
  v_mine    := case when v_pact.inviter = v_me then v_pact.inviter_game else v_pact.invitee_game end;

  update public.co_op_pacts
     set status = 'dissolved', ended_at = now(), ended_by = v_me, end_reason = 'dissolved'
   where id = p_id;

  insert into public.co_op_pact_events (pact_id, actor, target, action, title)
  values (p_id, v_me, v_partner, 'dissolved', v_pact.title);

  select coalesce(display_name, 'Someone') into v_name from public.profiles where id = v_me;
  insert into public.notifications (user_id, type, title, body, link)
  values (v_partner, 'co_op_dissolved',
          case when v_pact.status = 'pending' then 'Co-op Pact invite withdrawn'
               else 'Co-op Pact dissolved' end,
          v_name || case when v_pact.status = 'pending'
                         then ' withdrew the pact invite for ' else ' dissolved the pact for ' end
                 || v_pact.title, null);

  -- The breaker's active copy goes back to the Bazaar (standard shelve refund).
  if v_mine is not null and v_pact.status = 'active'
     and exists (select 1 from public.games g
                  where g.id = v_mine and g.user_id = v_me and g.status = 'playing') then
    perform public.apply_shelve(v_mine);
  end if;

  return true;
end;
$$;

-- The caller's pacts (pending both ways + active + recently ended), with the
-- partner's display fields for the pact banner/badge, plus the partner's
-- logged hours on their bound copy (the spec's relative-progress readout) —
-- nulled for a hard-private partner or a game they made private. The partner
-- card's cover/length/platform ride along under the same privacy gate: the
-- Player 2 join surfaces (a pending invite for a game the caller doesn't own)
-- preview and price the game from them.
-- Dropped first: partner_hours, then covers_fee/gifted_fee + the partner-card
-- fields, were added (RETURNS TABLE shape changes).
drop function if exists public.list_co_op_pacts();
create or replace function public.list_co_op_pacts()
returns table (
  id uuid, status text, game_key text, title text,
  partner uuid, partner_name text, partner_avatar text,
  my_game uuid, partner_game uuid, i_am_inviter boolean,
  my_finished_at timestamptz, partner_finished_at timestamptz,
  bonus_pct integer, created_at timestamptz, ended_at timestamptz, ended_by uuid,
  partner_hours real,
  covers_fee boolean, gifted_fee integer,
  partner_game_image text, partner_game_hours real, partner_game_platform text
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  return query
  select cp.id, cp.status, cp.game_key, cp.title,
         p.id, p.display_name, p.avatar_url,
         case when cp.inviter = v_me then cp.inviter_game else cp.invitee_game end,
         case when cp.inviter = v_me then cp.invitee_game else cp.inviter_game end,
         cp.inviter = v_me,
         case when cp.inviter = v_me then cp.inviter_finished_at else cp.invitee_finished_at end,
         case when cp.inviter = v_me then cp.invitee_finished_at else cp.inviter_finished_at end,
         cp.bonus_pct, cp.created_at, cp.ended_at, cp.ended_by,
         case when coalesce((p.privacy->>'private_profile')::boolean, false) then null
              else pg.played_hours end,
         cp.covers_fee, cp.gifted_fee,
         case when coalesce((p.privacy->>'private_profile')::boolean, false) then null
              else pg.image end,
         case when coalesce((p.privacy->>'private_profile')::boolean, false) then null
              else pg.hours end,
         case when coalesce((p.privacy->>'private_profile')::boolean, false) then null
              else pg.platform end
  from public.co_op_pacts cp
  join public.profiles p
    on p.id = case when cp.inviter = v_me then cp.invitee else cp.inviter end
  left join lateral (
    select g.played_hours, g.image, g.hours,
           (select c->>'platform'
              from jsonb_array_elements(coalesce(g.copies, '[]'::jsonb)) c
             where coalesce(c->>'format', '') <> 'dlc'
               and btrim(coalesce(c->>'platform', '')) <> ''
             limit 1) as platform
      from public.games g
     where g.id = case when cp.inviter = v_me then cp.invitee_game else cp.inviter_game end
       and not coalesce(g.private, false)
  ) pg on true
  where v_me in (cp.inviter, cp.invitee)
    and (cp.status in ('pending', 'active') or cp.ended_at > now() - interval '14 days')
  order by cp.created_at desc;
end;
$$;

-- Games guard: keep pacts truthful about their bound cards, server-side so no
-- client path can bypass it. On a pacted card:
--   - leaving Now Playing for the Bazaar/Wishlist (a shelve) DISSOLVES the pact
--     with the mover as breaker (their copy already moved — no second shelve);
--   - finishing with tag 'retired' (a terminal drop) also dissolves it;
--   - finishing properly stamps that side's half (the economy phase pays the
--     bonus when the second half lands); an undone finish un-stamps it.
create or replace function public.co_op_pact_game_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_pact          public.co_op_pacts%rowtype;
  v_partner       uuid;
  v_name          text;
  v_done          boolean;
  v_bonus         integer;
  v_inviter_bonus integer;
  v_invitee_bonus integer;
  v_bal           integer;
begin
  -- Cheap hot-path exit: nothing pacted on this row.
  select * into v_pact from public.co_op_pacts
   where status in ('pending', 'active') and new.id in (inviter_game, invitee_game)
   limit 1
   for update;
  if not found then return new; end if;

  v_partner := case when v_pact.inviter = new.user_id then v_pact.invitee else v_pact.inviter end;

  -- An undo reverting a finish un-stamps that side's half (and its escrowed
  -- bonus) on a still-live pact. A pact already completed (bonus paid) is
  -- history — the undo refunds the finish reward via apply_finish's own path
  -- but the joint bonus stands, like any other already-settled joint event.
  if current_setting('app.undo_in_progress', true) = '1' then
    if old.status = 'finished' and new.status <> 'finished' and v_pact.status = 'active' then
      update public.co_op_pacts
         set inviter_finished_at = case when inviter_game = new.id then null else inviter_finished_at end,
             inviter_bonus       = case when inviter_game = new.id then null else inviter_bonus end,
             invitee_finished_at = case when invitee_game = new.id then null else invitee_finished_at end,
             invitee_bonus       = case when invitee_game = new.id then null else invitee_bonus end
       where id = v_pact.id;
    end if;
    return new;
  end if;

  if old.status = 'playing' and new.status in ('backlog', 'wishlist') then
    -- Shelved out from under the pact → dissolved, mover is the breaker.
    update public.co_op_pacts
       set status = 'dissolved', ended_at = now(), ended_by = new.user_id,
           end_reason = 'shelved'
     where id = v_pact.id;
    insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
    values (v_pact.id, new.user_id, v_partner, 'dissolved', v_pact.title,
            jsonb_build_object('reason', 'shelved'));
    if exists (select 1 from auth.users u where u.id = v_partner) then
      select coalesce(display_name, 'Someone') into v_name
        from public.profiles where id = new.user_id;
      insert into public.notifications (user_id, type, title, body, link)
      values (v_partner, 'co_op_dissolved', 'Co-op Pact dissolved',
              v_name || ' shelved ' || v_pact.title || ' — the pact is off', null);
    end if;

  elsif old.status is distinct from 'finished' and new.status = 'finished' then
    if coalesce(new.finish_tag, '') = 'retired' then
      update public.co_op_pacts
         set status = 'dissolved', ended_at = now(), ended_by = new.user_id,
             end_reason = 'retired'
       where id = v_pact.id;
      insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
      values (v_pact.id, new.user_id, v_partner, 'dissolved', v_pact.title,
              jsonb_build_object('reason', 'retired'));
      if exists (select 1 from auth.users u where u.id = v_partner) then
        select coalesce(display_name, 'Someone') into v_name
          from public.profiles where id = new.user_id;
        insert into public.notifications (user_id, type, title, body, link)
        values (v_partner, 'co_op_dissolved', 'Co-op Pact dissolved',
                v_name || ' retired ' || v_pact.title || ' — the pact is off', null);
      end if;
    elsif v_pact.status = 'active' then
      -- Stamp this side's half + its escrowed bonus: bonus_pct of the coins
      -- this finish actually paid (games.reward), snapshotted so the payout
      -- survives the card being deleted before the partner finishes.
      v_bonus := greatest(0, round(coalesce(new.reward, 0)
                   * coalesce(v_pact.bonus_pct, 25) / 100.0))::integer;
      update public.co_op_pacts
         set inviter_finished_at = case when inviter_game = new.id
                                        then coalesce(new.finished_at, now())
                                        else inviter_finished_at end,
             inviter_bonus       = case when inviter_game = new.id
                                        then v_bonus else inviter_bonus end,
             invitee_finished_at = case when invitee_game = new.id
                                        then coalesce(new.finished_at, now())
                                        else invitee_finished_at end,
             invitee_bonus       = case when invitee_game = new.id
                                        then v_bonus else invitee_bonus end
       where id = v_pact.id
       returning (inviter_finished_at is not null and invitee_finished_at is not null),
                 inviter_bonus, invitee_bonus
         into v_done, v_inviter_bonus, v_invitee_bonus;
      insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
      values (v_pact.id, new.user_id, v_partner, 'half_finished', v_pact.title,
              jsonb_build_object('bonus', v_bonus));
      if v_done then
        update public.co_op_pacts
           set status = 'completed', ended_at = now(), end_reason = 'completed'
         where id = v_pact.id;
        insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
        values (v_pact.id, new.user_id, v_partner, 'completed', v_pact.title,
                jsonb_build_object('inviter_bonus', v_inviter_bonus,
                                   'invitee_bonus', v_invitee_bonus));

        -- Pay out both escrowed bonuses, server-authoritative, each on the
        -- player's own finish reward (issue d57afe4f, economy phase). A side
        -- whose account is mid-deletion is skipped safely, and a side with the
        -- economy off is skipped too (their reward was 0 anyway; no retro
        -- earning into a frozen balance) — the ON partner is unaffected.
        if coalesce(v_inviter_bonus, 0) > 0
           and public.economy_enabled(v_pact.inviter)
           and exists (select 1 from auth.users u where u.id = v_pact.inviter) then
          update public.profiles set coins = coins + v_inviter_bonus
           where id = v_pact.inviter returning coins into v_bal;
          perform public.log_coin_event(
            v_pact.inviter, 'co_op_bonus', v_inviter_bonus, 0, v_bal, null,
            v_pact.inviter_game, v_pact.title, null,
            jsonb_build_object('pact_id', v_pact.id, 'partner', v_pact.invitee,
                               'bonus_pct', v_pact.bonus_pct));
        end if;
        if coalesce(v_invitee_bonus, 0) > 0
           and public.economy_enabled(v_pact.invitee)
           and exists (select 1 from auth.users u where u.id = v_pact.invitee) then
          update public.profiles set coins = coins + v_invitee_bonus
           where id = v_pact.invitee returning coins into v_bal;
          perform public.log_coin_event(
            v_pact.invitee, 'co_op_bonus', v_invitee_bonus, 0, v_bal, null,
            v_pact.invitee_game, v_pact.title, null,
            jsonb_build_object('pact_id', v_pact.id, 'partner', v_pact.inviter,
                               'bonus_pct', v_pact.bonus_pct));
        end if;

        if exists (select 1 from auth.users u where u.id = v_partner) then
          select coalesce(display_name, 'Someone') into v_name
            from public.profiles where id = new.user_id;
          insert into public.notifications (user_id, type, title, body, link)
          values (v_partner, 'co_op_completed', 'Co-op Pact completed',
                  v_name || ' finished ' || v_pact.title || ' — you both cleared it!'
                    || case when coalesce(case when v_pact.inviter = v_partner
                                               then v_inviter_bonus else v_invitee_bonus end, 0) > 0
                            then ' Your +' || (case when v_pact.inviter = v_partner
                                                    then v_inviter_bonus else v_invitee_bonus end)
                                 || '-coin pact bonus is in.'
                            else '' end, null);
        end if;

        -- Broadcast the joint clear to BOTH sides' activity feeds, each post
        -- naming the partner (snapshot — feed rows outlive the pact's users).
        -- Privacy applies at read time in list_activity_feed, like every post.
        insert into public.activity_events (actor, kind, game_id, game_title, detail)
        select x.actor, 'co_op_completed', x.game_id, v_pact.title,
               jsonb_build_object('partner_name', coalesce(p.display_name, 'a friend'))
          from (values (v_pact.inviter, v_pact.inviter_game, v_pact.invitee),
                       (v_pact.invitee, v_pact.invitee_game, v_pact.inviter))
                 as x(actor, game_id, partner)
          join public.profiles p on p.id = x.partner
         where exists (select 1 from auth.users u where u.id = x.actor);
      elsif exists (select 1 from auth.users u where u.id = v_partner) then
        select coalesce(display_name, 'Someone') into v_name
          from public.profiles where id = new.user_id;
        insert into public.notifications (user_id, type, title, body, link)
        values (v_partner, 'co_op_half', 'Your co-op partner finished',
                v_name || ' finished ' || v_pact.title || ' — your half awaits!',
                case when v_pact.inviter = v_partner and v_pact.inviter_game is not null
                       then 'game:' || v_pact.inviter_game
                     when v_pact.invitee = v_partner and v_pact.invitee_game is not null
                       then 'game:' || v_pact.invitee_game end);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists games_co_op_pact_guard on public.games;
create trigger games_co_op_pact_guard
  after update of status on public.games
  for each row execute function public.co_op_pact_game_guard();

-- A pacted card being deleted dissolves the pact (the FK already nulled — match
-- on OLD.id). Guarded for the auth.users deletion cascade: when the whole
-- account is going away its pacts cascade too, so skip the bookkeeping.
create or replace function public.co_op_pact_game_deleted()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_pact    public.co_op_pacts%rowtype;
  v_partner uuid;
  v_name    text;
begin
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old; -- account cascade: pact rows are being removed with the user
  end if;

  -- Only an UNFINISHED side deleting its bound card breaks the pact: a
  -- finished half already happened (its bonus is snapshotted on the pact), so
  -- deleting that card is just cleanup and the partner's chase stays alive.
  select * into v_pact from public.co_op_pacts
   where status in ('pending', 'active')
     and (inviter = old.user_id or invitee = old.user_id)
     and game_key = public.co_op_game_key(old.rawg_id, old.catalog_id)
     and ((inviter = old.user_id and inviter_game is null and inviter_finished_at is null)
       or (invitee = old.user_id and invitee_game is null and invitee_finished_at is null))
   limit 1
   for update;
  if not found then return old; end if;

  v_partner := case when v_pact.inviter = old.user_id then v_pact.invitee else v_pact.inviter end;

  update public.co_op_pacts
     set status = 'dissolved', ended_at = now(), ended_by = old.user_id,
         end_reason = 'game_deleted'
   where id = v_pact.id;
  insert into public.co_op_pact_events (pact_id, actor, target, action, title, detail)
  values (v_pact.id, old.user_id, v_partner, 'dissolved', v_pact.title,
          jsonb_build_object('reason', 'game_deleted'));
  if exists (select 1 from auth.users u where u.id = v_partner) then
    select coalesce(display_name, 'Someone') into v_name
      from public.profiles where id = old.user_id;
    insert into public.notifications (user_id, type, title, body, link)
    values (v_partner, 'co_op_dissolved', 'Co-op Pact dissolved',
            v_name || ' no longer has ' || v_pact.title || ' — the pact is off', null);
  end if;
  return old;
end;
$$;

drop trigger if exists games_co_op_pact_deleted on public.games;
create trigger games_co_op_pact_deleted
  after delete on public.games
  for each row execute function public.co_op_pact_game_deleted();

revoke execute on function public.co_op_game_key(integer, uuid)  from public, anon, authenticated;
revoke execute on function public.co_op_pact_game_guard()        from public, anon, authenticated;
revoke execute on function public.co_op_pact_game_deleted()      from public, anon, authenticated;
revoke execute on function public.co_op_partner_options(uuid)    from public, anon;
revoke execute on function public.invite_co_op_pact(uuid, uuid, boolean) from public, anon;
revoke execute on function public.respond_co_op_pact(uuid, boolean, uuid, integer, uuid, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke execute on function public.set_co_op_pact_fee_offer(uuid, boolean) from public, anon;
revoke execute on function public.dissolve_co_op_pact(uuid)      from public, anon;
revoke execute on function public.list_co_op_pacts()             from public, anon;

grant execute on function public.co_op_partner_options(uuid)     to authenticated;
grant execute on function public.invite_co_op_pact(uuid, uuid, boolean) to authenticated;
grant execute on function public.respond_co_op_pact(uuid, boolean, uuid, integer, uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.set_co_op_pact_fee_offer(uuid, boolean) to authenticated;
grant execute on function public.dissolve_co_op_pact(uuid)       to authenticated;
grant execute on function public.list_co_op_pacts()              to authenticated;

-- ---------------------------------------------------------------------------
-- Reporting RPCs — submit a report, the moderator queue, and resolution. All
-- security-definer + server-authoritative (the reports/report_events tables have
-- no client write grants). The reporter is recorded for moderators but never
-- surfaced to the reported user (RLS + the front end). See src/lib/reports.ts.
-- ---------------------------------------------------------------------------

-- File a report against a user (kind='user') or a custom cover (kind='cover').
-- Soft-dedupes an identical open report from the same reporter (returns the
-- existing id). For a cover report, the game must belong to the reported user; we
-- snapshot its title + current cover so the moderator sees what was flagged even
-- after a strip/delete. Never notifies the reported user.
create or replace function public.submit_report(
  p_reported_user uuid,
  p_kind          text,
  p_reason        text,
  p_details       text default null,
  p_game          uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_id      uuid;
  v_title   text;
  v_image   text;
  v_details text := nullif(btrim(p_details), '');
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_reported_user = v_me then raise exception 'You cannot report yourself'; end if;
  if p_kind not in ('user', 'cover') then raise exception 'Invalid report kind'; end if;
  if p_reason not in ('explicit', 'harassment', 'spam', 'inappropriate_name', 'other') then
    raise exception 'Invalid report reason';
  end if;
  if not exists (select 1 from public.profiles where id = p_reported_user) then
    raise exception 'User not found';
  end if;

  -- For a cover report, the game must belong to the reported user; snapshot it.
  if p_kind = 'cover' then
    if p_game is null then raise exception 'Missing game for a cover report'; end if;
    select title, image into v_title, v_image
      from public.games where id = p_game and user_id = p_reported_user;
    if not found then raise exception 'That game is not on this player''s board'; end if;
  end if;

  -- Soft-dedupe: an open report from this reporter for the same target/kind/game.
  select id into v_id from public.reports
   where reporter = v_me and reported_user = p_reported_user
     and kind = p_kind and status = 'open'
     and game_id is not distinct from p_game
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.reports
    (reporter, reported_user, kind, reason, details, game_id, game_title, image_url)
  values
    (v_me, p_reported_user, p_kind, p_reason, v_details,
     case when p_kind = 'cover' then p_game else null end, v_title, v_image)
  returning id into v_id;

  insert into public.report_events (report_id, actor, action, note)
  values (v_id, v_me, 'submitted', v_details);

  return v_id;
end;
$$;

-- The moderation queue: reports (optionally filtered by status) with the reporter
-- and reported user's display names/avatars, plus the live cover so the queue can
-- tell whether a flagged custom upload is still up. Gated on reports.moderate;
-- returns nothing for others (a SQL function can't raise). Moderators DO see the
-- reporter (the AC requires capturing the reporter's id) — anonymity is enforced
-- toward the REPORTED user, who has no read access at all.
create or replace function public.list_reports(p_status text default 'open')
returns table (
  id                 uuid,
  reporter           uuid,
  reporter_name      text,
  reported_user      uuid,
  reported_name      text,
  reported_avatar    text,
  reported_blocked   boolean,
  kind               text,
  reason             text,
  details            text,
  game_id            uuid,
  game_title         text,
  image_url          text,
  live_image         text,
  status             text,
  resolution         text,
  reviewer_name      text,
  reviewer_note      text,
  created_at         timestamptz,
  resolved_at        timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    r.id,
    r.reporter,
    rp.display_name,
    r.reported_user,
    tp.display_name,
    tp.avatar_url,
    tp.blocked,
    r.kind,
    r.reason,
    r.details,
    r.game_id,
    r.game_title,
    r.image_url,
    g.image,
    r.status,
    r.resolution,
    vp.display_name,
    r.reviewer_note,
    r.created_at,
    r.resolved_at
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter
  left join public.profiles tp on tp.id = r.reported_user
  left join public.profiles vp on vp.id = r.reviewer
  left join public.games    g  on g.id  = r.game_id
  where public.has_permission('reports.moderate')
    and (p_status = 'all' or r.status = p_status)
  order by r.created_at desc;
$$;

-- Resolve a report. p_action:
--   'dismiss' — close as invalid; no user impact.
--   'strip'   — reset the flagged game's cover to its stock_image default (the
--               authoritative removal; the client best-effort deletes the blob)
--               and notify the owner.
--   'suspend' — block the reported account (requires users.block too) + notify.
-- The reporter is never revealed in any notification.
create or replace function public.resolve_report(p_id uuid, p_action text, p_note text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_rep    public.reports%rowtype;
  v_note   text := nullif(btrim(p_note), '');
  v_resn   text;
  v_evt    text;
  v_stock  text;
  v_title  text;
begin
  if not public.has_permission('reports.moderate') then
    raise exception 'Not authorized';
  end if;
  if p_action not in ('dismiss', 'strip', 'suspend') then
    raise exception 'Invalid action';
  end if;

  select * into v_rep from public.reports where id = p_id;
  if not found then raise exception 'Report not found'; end if;
  if v_rep.status <> 'open' then raise exception 'Report already resolved'; end if;

  if p_action = 'dismiss' then
    v_resn := 'dismissed'; v_evt := 'dismissed';

  elsif p_action = 'strip' then
    if v_rep.game_id is null then raise exception 'This report has no cover to strip'; end if;
    -- Reset to the safe default only if it's still a custom upload owned by the
    -- reported user. stock_image is what we already keep for the Revert feature,
    -- so the original art is never lost.
    select stock_image, title into v_stock, v_title
      from public.games
     where id = v_rep.game_id and user_id = v_rep.reported_user and image like '%/covers/%';
    if found then
      update public.games set image = v_stock where id = v_rep.game_id;
      insert into public.notifications (user_id, type, title, body, link)
      values (
        v_rep.reported_user, 'cover_stripped',
        'A custom cover was removed',
        'A moderator removed the custom cover art on "'
          || coalesce(nullif(btrim(v_title), ''), 'one of your games')
          || '". The standard catalog cover has been restored.'
          || case when v_note is not null then ' Note: ' || v_note else '' end,
        null
      );
    end if;
    v_resn := 'stripped'; v_evt := 'stripped';

  elsif p_action = 'suspend' then
    -- Banning is a distinct authority — don't let a report-only moderator escalate.
    if not (public.has_permission('users.block')
            or exists (select 1 from public.profiles me where me.id = v_me and me.is_admin)) then
      raise exception 'Not authorized to suspend users';
    end if;
    update public.profiles
       set blocked = true,
           blocked_reason = coalesce(v_note, 'Suspended after a report')
     where id = v_rep.reported_user;
    insert into public.notifications (user_id, type, title, body, link)
    values (
      v_rep.reported_user, 'account_suspended',
      'Your account has been suspended',
      'A moderator has suspended your account'
        || case when v_note is not null then ': ' || v_note else '.' end,
      null
    );
    v_resn := 'suspended'; v_evt := 'suspended';
  end if;

  update public.reports
     set status = case when v_resn = 'dismissed' then 'dismissed' else 'actioned' end,
         resolution = v_resn,
         reviewer = v_me,
         reviewer_note = v_note,
         resolved_at = now()
   where id = p_id;

  insert into public.report_events (report_id, actor, action, note)
  values (p_id, v_me, v_evt, v_note);
end;
$$;

-- Count of open reports, for the admin nav badge. Gated on reports.moderate.
create or replace function public.pending_report_count()
returns integer
language sql
security definer set search_path = public
as $$
  select case when public.has_permission('reports.moderate')
    then (select count(*) from public.reports where status = 'open')
    else 0 end::int;
$$;

revoke execute on function public.submit_report(uuid, text, text, text, uuid) from public, anon;
revoke execute on function public.list_reports(text)                   from public, anon;
revoke execute on function public.resolve_report(uuid, text, text)     from public, anon;
revoke execute on function public.pending_report_count()               from public, anon;

grant execute on function public.submit_report(uuid, text, text, text, uuid)  to authenticated;
grant execute on function public.list_reports(text)                    to authenticated;
grant execute on function public.resolve_report(uuid, text, text)      to authenticated;
grant execute on function public.pending_report_count()                to authenticated;

-- (import_with_charter v2 — merge-on-import — is defined at its original spot
-- above, drop-first since the RETURNS shape changed on 2026-07-02. It must sit
-- before the social section's revoke/grant statements that reference it.)

-- ---------------------------------------------------------------------------
-- Custom game lists (issue d6fee1a8): user-curated, ordered collections with a
-- per-game blurb ("Top 10 JRPGs", "Zelda: Ranked"). Items reference shared
-- catalog identity (rawg_id / catalog_id — either may be null, both null for a
-- purely custom library game) plus a title+image snapshot, so a list can rank
-- games its owner never logged and survives catalog removals. Folders are the
-- owner's private workspace organisation; visibility is per list:
--   private  — owner only.
--   unlisted — anyone with the link (via the definer RPC only; RLS deliberately
--              does NOT open unlisted rows, so they can't be enumerated).
--   public   — on the owner's profile, readable via RLS (profile-visible gate).
-- This section must stay ABOVE the achievements section: achievement_metrics()
-- reads game_lists/game_list_items for the Curator medals.
-- ---------------------------------------------------------------------------
create table if not exists public.game_list_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists game_list_folders_user_idx
  on public.game_list_folders (user_id, sort, created_at);

create table if not exists public.game_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Folder is workspace organisation, never an access boundary. Deleting a
  -- folder releases its lists back to "no folder" rather than deleting them.
  folder_id   uuid references public.game_list_folders (id) on delete set null,
  title       text not null,
  description text not null default '',
  visibility  text not null default 'private'
              check (visibility in ('private', 'unlisted', 'public')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists game_lists_user_idx
  on public.game_lists (user_id, updated_at desc);
create index if not exists game_lists_folder_idx
  on public.game_lists (folder_id);

create table if not exists public.game_list_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.game_lists (id) on delete cascade,
  -- Denormalised owner: keeps item RLS/wipes cheap and event rows attributable.
  user_id    uuid not null references auth.users (id) on delete cascade,
  rawg_id    integer,
  catalog_id uuid references public.catalog_games (id) on delete set null,
  title      text not null,          -- snapshot; survives catalog changes
  image      text,                   -- snapshot cover (catalog art, never a private custom cover)
  blurb      text not null default '',
  rank       integer not null default 0,   -- position within the list (1-based)
  created_at timestamptz not null default now()
);

create index if not exists game_list_items_list_idx
  on public.game_list_items (list_id, rank, created_at);
-- One entry per catalog identity per list (a ranked list has no duplicates).
create unique index if not exists game_list_items_rawg_uniq
  on public.game_list_items (list_id, rawg_id) where rawg_id is not null;
create unique index if not exists game_list_items_catalog_uniq
  on public.game_list_items (list_id, catalog_id) where catalog_id is not null;

alter table public.game_list_folders enable row level security;
alter table public.game_lists        enable row level security;
alter table public.game_list_items   enable row level security;

-- Folders: owner-only in every direction (visitors see lists flat).
drop policy if exists "game_list_folders_own" on public.game_list_folders;
create policy "game_list_folders_own" on public.game_list_folders
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Lists: owner full CRUD. Others may read PUBLIC lists of a visible profile;
-- unlisted stays out of RLS reach (link access goes through get_game_list).
drop policy if exists "game_lists_select" on public.game_lists;
create policy "game_lists_select" on public.game_lists
  for select to authenticated using (
    auth.uid() = user_id
    or (visibility = 'public' and exists (
      select 1 from public.profiles p
       where p.id = user_id and not p.blocked
         and not coalesce((p.privacy->>'private_profile')::boolean, false)))
  );
drop policy if exists "game_lists_insert" on public.game_lists;
create policy "game_lists_insert" on public.game_lists
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "game_lists_update" on public.game_lists;
create policy "game_lists_update" on public.game_lists
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "game_lists_delete" on public.game_lists;
create policy "game_lists_delete" on public.game_lists
  for delete to authenticated using (auth.uid() = user_id);

-- Items mirror their list's readability; writes are owner-only and must target
-- the owner's own list (the with-check closes the "insert into someone else's
-- list" hole a bare user_id check would leave).
drop policy if exists "game_list_items_select" on public.game_list_items;
create policy "game_list_items_select" on public.game_list_items
  for select to authenticated using (
    auth.uid() = user_id
    or exists (
      select 1 from public.game_lists l
       where l.id = list_id and l.visibility = 'public'
         and exists (
           select 1 from public.profiles p
            where p.id = l.user_id and not p.blocked
              and not coalesce((p.privacy->>'private_profile')::boolean, false)))
  );
drop policy if exists "game_list_items_insert" on public.game_list_items;
create policy "game_list_items_insert" on public.game_list_items
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.game_lists l
                 where l.id = list_id and l.user_id = auth.uid())
  );
drop policy if exists "game_list_items_update" on public.game_list_items;
create policy "game_list_items_update" on public.game_list_items
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "game_list_items_delete" on public.game_list_items;
create policy "game_list_items_delete" on public.game_list_items
  for delete to authenticated using (auth.uid() = user_id);

-- Keep updated_at honest on direct client updates (it drives "recently
-- updated" ordering); item churn touches the parent list below.
create or replace function public.touch_game_list()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists game_lists_touch on public.game_lists;
create trigger game_lists_touch
  before update on public.game_lists
  for each row execute function public.touch_game_list();

-- ── Append-only history (the audit rule): list lifecycle + item churn. ──────
-- Mirrors like_events' posture: title snapshot, set-null FK so history survives
-- the list's deletion, read-own (admins all), no client writes — rows come only
-- from the security-definer triggers.
create table if not exists public.game_list_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  list_id    uuid references public.game_lists (id) on delete set null,
  list_title text not null,
  action     text not null check (action in
               ('created', 'renamed', 'visibility_changed',
                'item_added', 'item_removed', 'deleted')),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_list_events_user_idx
  on public.game_list_events (user_id, created_at desc, id desc);

alter table public.game_list_events enable row level security;
revoke insert, update, delete on public.game_list_events from authenticated, anon;
drop policy if exists "game_list_events_select" on public.game_list_events;
create policy "game_list_events_select" on public.game_list_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create or replace function public.log_game_list_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.game_list_events (user_id, list_id, list_title, action)
    values (new.user_id, new.id, new.title, 'created');
    return new;
  elsif tg_op = 'UPDATE' then
    if new.title is distinct from old.title then
      insert into public.game_list_events (user_id, list_id, list_title, action, detail)
      values (new.user_id, new.id, new.title, 'renamed',
              jsonb_build_object('from', old.title, 'to', new.title));
    end if;
    if new.visibility is distinct from old.visibility then
      insert into public.game_list_events (user_id, list_id, list_title, action, detail)
      values (new.user_id, new.id, new.title, 'visibility_changed',
              jsonb_build_object('from', old.visibility, 'to', new.visibility));
    end if;
    return new;
  end if;
  -- DELETE. Only log while the owner still exists: on account deletion this
  -- fires from the auth.users cascade after their row is gone, and the event's
  -- user_id FK would dangle (mirrors the games_log_status guard).
  if exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into public.game_list_events (user_id, list_id, list_title, action)
    values (old.user_id, null, old.title, 'deleted');
  end if;
  return old;
end;
$$;

drop trigger if exists game_lists_log_event on public.game_lists;
create trigger game_lists_log_event
  after insert or update or delete on public.game_lists
  for each row execute function public.log_game_list_event();

create or replace function public.log_game_list_item_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare v_list_title text;
begin
  if tg_op = 'INSERT' then
    select l.title into v_list_title from public.game_lists l where l.id = new.list_id;
    insert into public.game_list_events (user_id, list_id, list_title, action, detail)
    values (new.user_id, new.list_id, coalesce(v_list_title, ''), 'item_added',
            jsonb_build_object('title', new.title));
    -- Item churn counts as list activity for "recently updated" ordering.
    update public.game_lists set updated_at = now() where id = new.list_id;
    return new;
  end if;
  -- DELETE: skip when the parent list is already gone — a list deletion (or an
  -- account deletion) cascades here, and the removal is captured by the list's
  -- own 'deleted' event rather than one noisy row per item.
  select l.title into v_list_title from public.game_lists l where l.id = old.list_id;
  if v_list_title is not null then
    insert into public.game_list_events (user_id, list_id, list_title, action, detail)
    values (old.user_id, old.list_id, v_list_title, 'item_removed',
            jsonb_build_object('title', old.title));
    update public.game_lists set updated_at = now() where id = old.list_id;
  end if;
  return old;
end;
$$;

drop trigger if exists game_list_items_log_event on public.game_list_items;
create trigger game_list_items_log_event
  after insert or delete on public.game_list_items
  for each row execute function public.log_game_list_item_event();

-- ── Read RPCs ───────────────────────────────────────────────────────────────
-- One list with its ordered items, for the routed list page (#l/<id>). This is
-- the only door to UNLISTED lists — the share link. Definer so it can read
-- across owners; the gate mirrors list_game_reviews' profile-visibility rules.
create or replace function public.get_game_list(p_list_id uuid)
returns table (
  id uuid, user_id uuid, owner_name text, owner_avatar text,
  title text, description text, visibility text,
  created_at timestamptz, updated_at timestamptz,
  items jsonb
)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  return query
  select l.id, l.user_id, p.display_name, p.avatar_url,
         l.title, l.description, l.visibility, l.created_at, l.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', i.id, 'rawg_id', i.rawg_id, 'catalog_id', i.catalog_id,
                    'title', i.title, 'image', i.image, 'blurb', i.blurb,
                    'rank', i.rank)
                  order by i.rank, i.created_at, i.id)
             from public.game_list_items i
            where i.list_id = l.id), '[]'::jsonb)
    from public.game_lists l
    join public.profiles p on p.id = l.user_id
   where l.id = p_list_id
     and (l.user_id = v_me
       or (l.visibility in ('public', 'unlisted') and not p.blocked
           and not coalesce((p.privacy->>'private_profile')::boolean, false)));
end;
$$;

-- A player's list shelf with counts and cover previews, one round-trip. Self
-- (p_user null or own id) gets ALL lists including private + folder ids for
-- the workspace; anyone else gets only the public lists of a visible profile.
create or replace function public.list_user_game_lists(p_user uuid default null)
returns table (
  id uuid, folder_id uuid, title text, description text, visibility text,
  item_count bigint, preview jsonb, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_me     uuid := auth.uid();
  v_target uuid;
  v_self   boolean;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  v_target := coalesce(p_user, v_me);
  v_self   := v_target = v_me;

  if not v_self and not exists (
    select 1 from public.profiles pr
     where pr.id = v_target and not pr.blocked
       and not coalesce((pr.privacy->>'private_profile')::boolean, false)
  ) then
    raise exception 'User not available';
  end if;

  return query
  select l.id, case when v_self then l.folder_id end, l.title, l.description,
         l.visibility,
         (select count(*) from public.game_list_items i where i.list_id = l.id),
         coalesce((
           select jsonb_agg(x.image)
             from (select i.image from public.game_list_items i
                    where i.list_id = l.id and i.image is not null
                    order by i.rank, i.created_at, i.id limit 4) x), '[]'::jsonb),
         l.created_at, l.updated_at
    from public.game_lists l
   where l.user_id = v_target
     and (v_self or l.visibility = 'public')
   order by l.updated_at desc;
end;
$$;

-- Persist a drag-reorder in one atomic call: ranks become the array positions
-- (1-based). Owner-only; items not in the array keep their rank (the client
-- always sends the full list, but a stale call can't null anyone out).
create or replace function public.reorder_game_list(p_list_id uuid, p_item_ids uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.game_lists l
                  where l.id = p_list_id and l.user_id = v_me) then
    raise exception 'Not your list';
  end if;
  update public.game_list_items i
     set rank = o.ord
    from unnest(p_item_ids) with ordinality as o(item_id, ord)
   where i.id = o.item_id and i.list_id = p_list_id;
  update public.game_lists set updated_at = now() where id = p_list_id;
end;
$$;

revoke execute on function public.get_game_list(uuid)             from public, anon;
revoke execute on function public.list_user_game_lists(uuid)      from public, anon;
revoke execute on function public.reorder_game_list(uuid, uuid[]) from public, anon;

grant execute on function public.get_game_list(uuid)              to authenticated;
grant execute on function public.list_user_game_lists(uuid)       to authenticated;
grant execute on function public.reorder_game_list(uuid, uuid[])  to authenticated;

-- ---------------------------------------------------------------------------
-- Achievements — auto-earned milestone medals (Bronze/Silver/Gold tiers), the
-- standard-milestones counterpart to the rare, admin-granted `badges` above
-- (titles still come from badges only). The catalog lives in the DB so adding
-- an achievement on an existing metric is one seed row, zero code: each row is
-- {metric, threshold, tier} plus presentation, and the generic evaluator below
-- awards whatever the caller's metrics now pass. Earns are append-only and
-- server-authoritative: user_achievements has no client write grants — only
-- evaluate_achievements() (security definer, auth.uid()) inserts, so a player
-- can't grant themselves a medal. There are no triggers: metrics are cumulative
-- lifetime totals, so a client-side evaluate after key actions plus one at each
-- session start is self-healing (anything missed is caught at the next boot —
-- which is also what retroactively awards existing users their history the
-- first time they sign in after this ships). Additive + idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,            -- stable key ('first-clear')
  family      text not null,                   -- tier group ('finisher')
  tier        smallint not null check (tier between 1 and 3),  -- 1 bronze · 2 silver · 3 gold
  name        text not null,
  description text not null,                   -- the requirement, user-facing
  icon        text not null default 'award',   -- lucide name; see src/lib/badges.ts ICONS
  metric      text not null,                   -- key into achievement_metrics()
  threshold   numeric not null,
  sort        integer not null default 0,      -- family display order
  created_at  timestamptz not null default now(),
  unique (family, tier)
);

create table if not exists public.user_achievements (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  earned_at      timestamptz not null default now(),
  -- The metric's value at the moment of earning — a snapshot for posterity.
  value          numeric,
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_achievement_idx
  on public.user_achievements (achievement_id);

alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;

-- Public prestige, like badges: catalog and earns are readable by anyone signed
-- in; deliberately NO write policies (the evaluator is the only writer).
drop policy if exists "achievements_select" on public.achievements;
create policy "achievements_select" on public.achievements
  for select to authenticated using (true);

drop policy if exists "user_achievements_select" on public.user_achievements;
create policy "user_achievements_select" on public.user_achievements
  for select to authenticated using (true);

-- Launch catalog: 8 families × 3 tiers. Thresholds are on cumulative metrics,
-- so nothing is ever revoked when a metric later dips (a deleted game, an
-- unretire). Idempotent: re-runs add nothing; edits to existing rows are done
-- deliberately, not by re-seeding.
insert into public.achievements (slug, family, tier, name, description, icon, metric, threshold, sort) values
  ('first-clear',         'finisher',       1, 'First Clear',         'Finish your first game',              'trophy',    'games_finished',    1,     1),
  ('seasoned-finisher',   'finisher',       2, 'Seasoned Finisher',   'Finish 10 games',                     'trophy',    'games_finished',    10,    1),
  ('backlog-slayer',      'finisher',       3, 'Backlog Slayer',      'Finish 50 games',                     'trophy',    'games_finished',    50,    1),
  ('completionist',       'perfectionist',  1, 'Completionist',       '100%-complete a game',                'target',    'games_completed',   1,     2),
  ('perfectionist',       'perfectionist',  2, 'Perfectionist',       '100%-complete 5 games',               'target',    'games_completed',   5,     2),
  ('platinum-soul',       'perfectionist',  3, 'Platinum Soul',       '100%-complete 25 games',              'target',    'games_completed',   25,    2),
  ('warming-up',          'marathoner',     1, 'Warming Up',          'Log 50 hours of play',                'clock',     'hours_played',      50,    3),
  ('marathoner',          'marathoner',     2, 'Marathoner',          'Log 250 hours of play',               'clock',     'hours_played',      250,   3),
  ('beyond-the-credits',  'marathoner',     3, 'Beyond the Credits',  'Log 1,000 hours of play',             'clock',     'hours_played',      1000,  3),
  ('pocket-change',       'tycoon',         1, 'Pocket Change',       'Earn 500 coins',                      'coins',     'coins_earned',      500,   4),
  ('merchant',            'tycoon',         2, 'Merchant',            'Earn 2,500 coins',                    'coins',     'coins_earned',      2500,  4),
  ('bazaar-tycoon',       'tycoon',         3, 'Bazaar Tycoon',       'Earn 10,000 coins',                   'coins',     'coins_earned',      10000, 4),
  -- NB: "Curator" lives in the lists seed below (Custom Lists, issue d6fee1a8)
  -- — the name was earmarked for it from the start.
  ('shelf-starter',       'collector',      1, 'Shelf Starter',       'Grow your library to 10 games',       'library',   'games_owned',       10,    5),
  ('archivist',           'collector',      2, 'Archivist',           'Grow your library to 50 games',       'library',   'games_owned',       50,    5),
  ('grand-collector',     'collector',      3, 'Grand Collector',     'Grow your library to 200 games',      'library',   'games_owned',       200,   5),
  ('first-impressions',   'critic',         1, 'First Impressions',   'Review a game',                       'star',      'games_reviewed',    1,     6),
  ('critic',              'critic',         2, 'Critic',              'Review 10 games',                     'star',      'games_reviewed',    10,    6),
  ('voice-of-the-bazaar', 'critic',         3, 'Voice of the Bazaar', 'Review 50 games',                     'star',      'games_reviewed',    50,    6),
  ('letting-go',          'honest-quitter', 1, 'Letting Go',          'Retire a game that isn''t clicking',  'flag-off',  'games_retired',     1,     7),
  ('honest-quitter',      'honest-quitter', 2, 'Honest Quitter',      'Retire 5 games',                      'flag-off',  'games_retired',     5,     7),
  ('zero-regrets',        'honest-quitter', 3, 'Zero Regrets',        'Retire 25 games',                     'flag-off',  'games_retired',     25,    7),
  ('diary-opened',        'chronicler',     1, 'Diary Opened',        'Record 5 game milestones',            'milestone', 'milestones_logged', 5,     8),
  ('chronicler',          'chronicler',     2, 'Chronicler',          'Record 25 game milestones',           'milestone', 'milestones_logged', 25,    8),
  ('bazaar-historian',    'chronicler',     3, 'Bazaar Historian',    'Record 100 game milestones',          'milestone', 'milestones_logged', 100,   8),
  ('first-favorite',      'tastemaker',     1, 'First Favorite',      'Like a game',                         'thumbs-up', 'likes_given',       1,     9),
  ('tastemaker',          'tastemaker',     2, 'Tastemaker',          'Like 10 games',                       'thumbs-up', 'likes_given',       10,    9),
  ('heart-of-the-bazaar', 'tastemaker',     3, 'Heart of the Bazaar', 'Like 50 games',                       'thumbs-up', 'likes_given',       50,    9)
on conflict (slug) do nothing;

-- Likes switched from a heart to a thumbs-up (the heart is the Wishlist's icon
-- — issue cde4d3de); the seed above is on-conflict-do-nothing, so correct the
-- already-seeded rows too. Idempotent (a no-op once flipped).
update public.achievements set icon = 'thumbs-up'
 where family = 'tastemaker' and icon = 'heart';

-- Custom Lists medals (issue d6fee1a8): a "qualifying" list holds 5+ games —
-- the requester's bar for the earmarked Curator badge. Live-state metric like
-- games_owned (dips never revoke).
insert into public.achievements (slug, family, tier, name, description, icon, metric, threshold, sort) values
  ('curator',        'curator', 1, 'Curator',        'Curate a game list with at least 5 games',  'list-ordered', 'lists_curated', 1,  10),
  ('head-curator',   'curator', 2, 'Head Curator',   'Curate 5 lists of at least 5 games each',   'list-ordered', 'lists_curated', 5,  10),
  ('master-curator', 'curator', 3, 'Master Curator', 'Curate 15 lists of at least 5 games each',  'list-ordered', 'lists_curated', 15, 10)
on conflict (slug) do nothing;

-- Every achievement metric for one user, computed in one place so the evaluator
-- and the progress display can never disagree. Semantics mirror the visible
-- profile stats: finished/completed counts exclude retired drops (like
-- view_profile / the leaderboard); hours come from the playtime event log (so
-- they survive game deletions, and downward corrections net out); coins are
-- lifetime EARNED (positive deltas, excluding the opening-balance baseline).
-- Internal: called only by the two definer RPCs below.
create or replace function public.achievement_metrics(p_user uuid)
returns table (metric text, value numeric)
language sql stable set search_path = public
as $$
  -- Game-counting metrics dedupe by shared catalog identity (the catalogKey
  -- mirror: rawg id, else catalog id, else the row itself), so per-platform
  -- instances of one game count it once — a second platform copy can never
  -- farm medals, and the instance-split migration can't inflate earned counts.
  select 'games_finished'::text,
         count(distinct coalesce('r:' || g.rawg_id::text,
                                 'c:' || g.catalog_id::text,
                                 'g:' || g.id::text))::numeric
    from public.games g
   where g.user_id = p_user and g.status = 'finished'
     and coalesce(g.finish_tag, '') <> 'retired'
  union all
  select 'games_completed',
         count(distinct coalesce('r:' || g.rawg_id::text,
                                 'c:' || g.catalog_id::text,
                                 'g:' || g.id::text))::numeric
    from public.games g
   where g.user_id = p_user and g.status = 'finished' and g.finish_tag = 'completed'
  union all
  select 'hours_played', coalesce(sum(e.hours), 0)::numeric
    from public.playtime_events e
   where e.user_id = p_user
  union all
  select 'coins_earned', coalesce(sum(e.coin_delta), 0)::numeric
    from public.coin_events e
   where e.user_id = p_user and e.coin_delta > 0 and e.kind <> 'opening'
  union all
  select 'games_owned',
         count(distinct coalesce('r:' || g.rawg_id::text,
                                 'c:' || g.catalog_id::text,
                                 'g:' || g.id::text))::numeric
    from public.games g
   where g.user_id = p_user and g.status <> 'wishlist'
  union all
  select 'games_reviewed',
         count(distinct coalesce('r:' || g.rawg_id::text,
                                 'c:' || g.catalog_id::text,
                                 'g:' || g.id::text))::numeric
    from public.games g
   where g.user_id = p_user
     and (nullif(btrim(coalesce(g.review, '')), '') is not null or g.review_score is not null)
  union all
  select 'games_retired',
         count(distinct coalesce('r:' || g.rawg_id::text,
                                 'c:' || g.catalog_id::text,
                                 'g:' || g.id::text))::numeric
    from public.games g
   where g.user_id = p_user and g.finish_tag = 'retired'
  union all
  select 'milestones_logged', count(*)::numeric
    from public.game_milestones m
   where m.user_id = p_user
  union all
  -- Lifetime likes GIVEN (from the event log, not current liked rows), so an
  -- unlike-relike loop can't farm the Tastemaker medals.
  select 'likes_given', count(*)::numeric
    from public.like_events e
   where e.user_id = p_user and e.action = 'liked'
  union all
  -- Curated lists that meet the Curator bar (5+ games). Live state, like
  -- games_owned: a later-emptied list dips the metric but never a medal.
  select 'lists_curated', count(*)::numeric
    from public.game_lists l
   where l.user_id = p_user
     and (select count(*) from public.game_list_items i where i.list_id = l.id) >= 5
$$;

-- Award the caller every unearned achievement whose metric now passes, and
-- return just the NEW earns (so the client can toast them). Idempotent and
-- safe to call at any frequency; concurrent calls are deduped by the primary
-- key + on-conflict guard.
create or replace function public.evaluate_achievements()
returns table (
  id uuid, slug text, family text, tier smallint,
  name text, description text, icon text, earned_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  return query
  with m as (
    select * from public.achievement_metrics(v_me)
  ),
  won as (
    insert into public.user_achievements (user_id, achievement_id, value)
    select v_me, a.id, m.value
      from public.achievements a
      join m on m.metric = a.metric
     where m.value >= a.threshold
       and not exists (
         select 1 from public.user_achievements ua
          where ua.user_id = v_me and ua.achievement_id = a.id)
    on conflict (user_id, achievement_id) do nothing
    returning achievement_id, user_achievements.earned_at
  )
  select a.id, a.slug, a.family, a.tier, a.name, a.description, a.icon, w.earned_at
    from won w
    join public.achievements a on a.id = w.achievement_id
   order by a.sort, a.tier;
end;
$$;

-- The full catalog with one user's earns, for the trophy-room UI: every
-- achievement (locked ones included) + earned_at, the caller's own live metric
-- value (progress bars — withheld when viewing someone else), and holder counts
-- for rarity. p_user null = self; another id shows that player's earned set
-- (their profile module), gated like other profile reads.
create or replace function public.list_achievements(p_user uuid default null)
returns table (
  id uuid, slug text, family text, tier smallint, name text, description text,
  icon text, metric text, threshold numeric, sort integer,
  earned_at timestamptz, metric_value numeric, holders bigint, players bigint
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_me     uuid := auth.uid();
  v_target uuid;
  v_self   boolean;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  v_target := coalesce(p_user, v_me);
  v_self   := v_target = v_me;

  -- Mirror the profile-visibility gate: no reading a blocked or private
  -- player's trophy case.
  if not v_self and not exists (
    select 1 from public.profiles pr
     where pr.id = v_target and not pr.blocked
       and not coalesce((pr.privacy->>'private_profile')::boolean, false)
  ) then
    raise exception 'User not available';
  end if;

  return query
  with m as (
    select * from public.achievement_metrics(v_target)
  ),
  h as (
    select ua.achievement_id, count(*)::bigint as holders
      from public.user_achievements ua
     group by ua.achievement_id
  ),
  pl as (
    select count(*)::bigint as players from public.profiles
  )
  select a.id, a.slug, a.family, a.tier, a.name, a.description, a.icon,
         a.metric, a.threshold, a.sort,
         ua.earned_at,
         case when v_self then m.value end as metric_value,
         coalesce(h.holders, 0) as holders,
         pl.players
    from public.achievements a
    left join public.user_achievements ua
      on ua.achievement_id = a.id and ua.user_id = v_target
    left join m on m.metric = a.metric
    left join h on h.achievement_id = a.id
    cross join pl
   order by a.sort, a.tier;
end;
$$;

-- The metrics helper is internal (called only by the two definer RPCs, which
-- run as the owner); no client ever invokes it directly.
revoke execute on function public.achievement_metrics(uuid)  from public, anon, authenticated;
revoke execute on function public.evaluate_achievements()    from public, anon;
revoke execute on function public.list_achievements(uuid)    from public, anon;

grant execute on function public.evaluate_achievements()     to authenticated;
grant execute on function public.list_achievements(uuid)     to authenticated;

-- ---------------------------------------------------------------------------
-- Instance isolation: per-platform game instances (issues a2b0bcf4 + 5a320005).
-- One library card per (game × platform): physical/digital/DLC copies of the
-- SAME platform live together on that platform's row; a different platform is
-- its own row with independent status, playtime and economy. The client's Add
-- routing enforces the grain going forward; split_platform_instances() below
-- unfolds the multi-platform rows that predate it.
-- ---------------------------------------------------------------------------

-- Append-only audit of every split: the source row's pre-split copies/hours/
-- status snapshot plus the sibling rows minted from it, so any split is fully
-- reconstructable (and reversible by hand if ever needed). Mirrors the
-- coin_events posture: read-own + admin, writes only from the definer function.
create table if not exists public.instance_split_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  game_id      uuid references public.games (id) on delete set null,
  game_title   text,
  snapshot     jsonb not null,             -- pre-split copies/played_hours/status/finish_tag/price_paid/reward
  new_game_ids uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists instance_split_events_user_idx
  on public.instance_split_events (user_id, created_at desc);

alter table public.instance_split_events enable row level security;
revoke insert, update, delete on public.instance_split_events from authenticated, anon;
drop policy if exists "instance_split_events_select" on public.instance_split_events;
create policy "instance_split_events_select" on public.instance_split_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Unfold every standalone row whose copies span more than one platform into
-- per-platform instance rows. For each such row:
--   • The platform with the most attributed play time (tie → first copy order)
--     is the PRIMARY and stays on the existing row, which keeps the economy
--     snapshots (price_paid/reward), review, like, progress note and milestones.
--   • Every other platform gets a new sibling row copying the shared metadata,
--     added_at (freshness pricing stays honest) and family membership. Siblings
--     inherit the row's status — a finished game stays finished everywhere —
--     with zero coin snapshots (no phantom backlog debt, no double bounties).
--     A PLAYING source's siblings land in the Bazaar instead (lane capacity).
--   • The platform's attributed playtime_events are re-parented to the sibling
--     and the scalars are split to match (unattributed hours stay primary).
--   • DLC and platform-less copies stay with the primary.
-- Compilation children never split (their copies mirror the bundle's).
-- Suppressions while it runs (app.split_in_progress GUC): playtime-correction
-- and status events (this is re-parenting, not play or user action) — the
-- instance_split_events row is the audit. Milestone capture stays ON so each
-- sibling gets an honest Journey (added + finish, dated from the source).
-- Naturally idempotent: after a split no standalone row spans two platforms,
-- so a re-run finds nothing. p_dry_run (the default) only reports what WOULD
-- split — the actual run is a deliberate, signed-off admin action, which is
-- why nothing in this file calls it.
create or replace function public.split_platform_instances(p_dry_run boolean default true)
returns table (
  user_id          uuid,
  game_id          uuid,
  game_title       text,
  status           text,
  platforms        text[],
  primary_platform text,
  hours_moved      real,
  siblings_created integer
)
language plpgsql
security definer set search_path = public
as $$
declare
  r             record;
  v_platforms   text[];
  v_primary     text;
  v_plat        text;
  v_new_id      uuid;
  v_new_ids     uuid[];
  v_sib_copies  jsonb;
  v_keep_copies jsonb;
  v_sib_status  text;
  v_moved       real;
  v_total_moved real;
  v_created     integer;
begin
  if not p_dry_run then
    perform set_config('app.split_in_progress', '1', true);
  end if;

  for r in
    select g.*
      from public.games g
     where g.compilation_id is null
       and (select count(distinct btrim(c ->> 'platform'))
              from jsonb_array_elements(coalesce(g.copies, '[]'::jsonb)) c
             where btrim(coalesce(c ->> 'platform', '')) <> '') > 1
     order by g.user_id, g.added_at, g.id
  loop
    -- Distinct platforms in first-copy order, and the primary (most attributed
    -- hours, tie → earliest copy position).
    select array_agg(s.p order by s.ord) into v_platforms
      from (select btrim(c ->> 'platform') as p, min(idx) as ord
              from jsonb_array_elements(coalesce(r.copies, '[]'::jsonb))
                   with ordinality t(c, idx)
             where btrim(coalesce(c ->> 'platform', '')) <> ''
             group by btrim(c ->> 'platform')) s;

    select q.p into v_primary
      from (select s.p, s.ord,
                   coalesce((select sum(e.hours) from public.playtime_events e
                              where e.game_id = r.id
                                and btrim(coalesce(e.platform, '')) = s.p), 0) as hrs
              from (select btrim(c ->> 'platform') as p, min(idx) as ord
                      from jsonb_array_elements(coalesce(r.copies, '[]'::jsonb))
                           with ordinality t(c, idx)
                     where btrim(coalesce(c ->> 'platform', '')) <> ''
                     group by btrim(c ->> 'platform')) s) q
     order by q.hrs desc, q.ord asc
     limit 1;

    v_created := 0;
    v_new_ids := '{}';
    v_total_moved := 0;

    if not p_dry_run then
      foreach v_plat in array v_platforms loop
        continue when v_plat = v_primary;

        select coalesce(jsonb_agg(c), '[]'::jsonb) into v_sib_copies
          from jsonb_array_elements(r.copies) c
         where btrim(coalesce(c ->> 'platform', '')) = v_plat;

        select greatest(coalesce(sum(e.hours), 0), 0) into v_moved
          from public.playtime_events e
         where e.game_id = r.id and btrim(coalesce(e.platform, '')) = v_plat;

        v_sib_status := case when r.status = 'playing' then 'backlog' else r.status end;
        v_new_id := gen_random_uuid();

        insert into public.games
          (id, user_id, rawg_id, title, released, hours, rating, metacritic,
           genres, image, stock_image, original_image, platforms, developers,
           esrb, catalog_id, ongoing, status, finish_tag, added_at, started_at,
           finished_at, played_hours, copies, private, family_id, family_name,
           family_image, family_cover_game_id, family_split, prerequisite_game_id)
        values
          (v_new_id, r.user_id, r.rawg_id, r.title, r.released, r.hours, r.rating,
           r.metacritic, r.genres, r.image, r.stock_image, r.original_image,
           r.platforms, r.developers, r.esrb, r.catalog_id, r.ongoing,
           v_sib_status,
           case when v_sib_status = 'finished' then r.finish_tag end,
           r.added_at,
           case when v_sib_status = 'finished' then r.started_at end,
           case when v_sib_status = 'finished' then r.finished_at end,
           v_moved, v_sib_copies, coalesce(r.private, false), r.family_id,
           r.family_name, r.family_image, r.family_cover_game_id,
           coalesce(r.family_split, false), r.prerequisite_game_id);

        -- Re-parent this platform's attributed sessions to the new instance —
        -- the history moves WITH the platform (nothing is lost or restated).
        update public.playtime_events e
           set game_id = v_new_id
         where e.game_id = r.id and btrim(coalesce(e.platform, '')) = v_plat;

        v_new_ids := v_new_ids || v_new_id;
        v_created := v_created + 1;
        v_total_moved := v_total_moved + v_moved;
      end loop;

      -- The source keeps the primary platform's copies plus any platform-less
      -- ones, and sheds the moved hours (never below zero).
      select coalesce(jsonb_agg(c), '[]'::jsonb) into v_keep_copies
        from jsonb_array_elements(r.copies) c
       where btrim(coalesce(c ->> 'platform', '')) = v_primary
          or btrim(coalesce(c ->> 'platform', '')) = '';

      update public.games g
         set copies = v_keep_copies,
             played_hours = greatest(r.played_hours - v_total_moved, 0)
       where g.id = r.id;

      insert into public.instance_split_events
        (user_id, game_id, game_title, snapshot, new_game_ids)
      values
        (r.user_id, r.id, r.title,
         jsonb_build_object(
           'copies', r.copies,
           'played_hours', r.played_hours,
           'status', r.status,
           'finish_tag', r.finish_tag,
           'price_paid', r.price_paid,
           'reward', r.reward,
           'primary_platform', v_primary),
         v_new_ids);
    end if;

    return query select r.user_id, r.id, r.title, r.status, v_platforms,
                        v_primary, v_total_moved,
                        case when p_dry_run
                             then cardinality(v_platforms) - 1
                             else v_created end;
  end loop;
end;
$$;

-- Admin-only migration tooling — never callable from a client.
revoke execute on function public.split_platform_instances(boolean) from public, anon, authenticated;

-- ============================================================================
-- Pre-orders (2026-07-18; reworked to the Bazaar model same day): games you
-- already BOUGHT that aren't out yet. A pre-order lives in the BAZAAR — like a
-- console library, it's part of your collection from the moment you commit —
-- as a marked backlog row that is LOCKED from starting until release: the
-- card wears a countdown where Buy & Start would be, and the cold-start gate
-- below rejects any attempt to activate it early. Release day just UNLOCKS it
-- in place (the boot sweep clears the marker and notifies) — no board move,
-- no Import Charter, and it's a fresh Bazaar card the moment it's playable.
-- Cancelling a pre-order means you no longer own it: the owner chooses
-- removal, or demotion to the Wishlist as a plain want. The whole lifecycle
-- is captured append-only in preorder_events.
-- ============================================================================

-- preordered_at:         when the pre-order was placed (the marker itself =
--                        the start lock).
-- preorder_expected_on:  the expected release date (a plain date —
--                        storefronts promise days, not instants). Prefilled by
--                        the client from the catalog release date, freely
--                        editable (delays, regional dates, community games).
-- preorder_notified_at:  v1 leftover (the alert-only design's once-only
--                        stamp). The unlock sweep needs no stamp — an
--                        unmarked row can't match twice — but the column
--                        stays (additive discipline); the triggers shed it.
alter table public.games add column if not exists preordered_at timestamptz;
alter table public.games add column if not exists preorder_expected_on date;
alter table public.games add column if not exists preorder_notified_at timestamptz;

-- How close (in days) a dated pre-order must be before the Bazaar's "Coming
-- up" strip surfaces it — the strip's job is "get your coins and slots ready",
-- and a game 234 days out isn't that (issue 2026-07-19). Admin-tunable on the
-- Economy page; pre-orders outside the horizon still pin on the board with
-- their countdown, and dateless orders (nothing to count down to) stay off
-- the strip once a horizon is set. 0 disables the strip entirely.
alter table public.app_config add column if not exists preorder_strip_days integer not null default 30;
alter table public.app_config drop constraint if exists app_config_preorder_strip_days_range;
alter table public.app_config add constraint app_config_preorder_strip_days_range
  check (preorder_strip_days between 0 and 3650);

-- preorder_charter: this pre-order was placed by consuming an Import Charter
-- (the wishlist-import flow, issue fe5f7f54) — the refund provenance for a
-- cancel: a fallen-through order returns the charter (trigger below). SERVER-
-- ONLY: it pays out a charter on cancel, so only import_with_charter may raise
-- it (via the txn-local app.charter_import GUC the shaping trigger checks) —
-- a client write is quietly shed, closing the mark-cancel-refund farm loop.
alter table public.games add column if not exists preorder_charter boolean not null default false;

-- Append-only pre-order history (the capture-everything rule): placed,
-- redated, cancelled, fulfilled — enough to reconstruct anticipation windows,
-- day-one-play streaks, or retroactively reward pre-order discipline. Rows are
-- written ONLY by the trigger below; game_title is snapshotted and the FK is
-- set-null so history survives the game's deletion (the coin_events pattern).
create table if not exists public.preorder_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  game_id     uuid references public.games (id) on delete set null,
  game_title  text,
  action      text not null check (action in ('placed', 'redated', 'cancelled', 'fulfilled')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists preorder_events_user_idx
  on public.preorder_events (user_id, created_at desc, id desc);
create index if not exists preorder_events_game_idx
  on public.preorder_events (game_id);

alter table public.preorder_events enable row level security;
revoke insert, update, delete on public.preorder_events from authenticated, anon;
drop policy if exists "preorder_events_select" on public.preorder_events;
create policy "preorder_events_select" on public.preorder_events
  for select to authenticated using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Keep the marker Bazaar-only, authoritatively. Any transition off the
-- backlog sheds all three pre-order columns (the cancel-to-Wishlist demotion
-- rides this); clearing the marker sheds the satellites too (the release
-- unlock); and pushing the expected date re-arms the release alert so a
-- delayed game announces itself at its new date. BEFORE trigger: only shapes
-- NEW, never writes elsewhere. (v1 shipped hours earlier with a wishlist-only
-- rule — the one-time migration below moves any v1 rows into the Bazaar.)
create or replace function public.preorder_backlog_only()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'backlog' or new.preordered_at is null then
    new.preordered_at := null;
    new.preorder_expected_on := null;
    new.preorder_notified_at := null;
    new.preorder_charter := false;
  elsif tg_op = 'UPDATE'
    and new.preorder_expected_on is distinct from old.preorder_expected_on then
    new.preorder_notified_at := null;
  end if;
  -- The charter-funded flag is server-only provenance (it pays out an Import
  -- Charter on cancel): it may only be RAISED inside import_with_charter,
  -- which announces itself via the txn-local GUC. Any other attempt is shed.
  if new.preorder_charter
    and (tg_op = 'INSERT' or not old.preorder_charter)
    and coalesce(current_setting('app.charter_import', true), '') <> 'on' then
    new.preorder_charter := false;
  end if;
  return new;
end;
$$;

-- The v1 trigger/function pair is superseded — drop by the old names.
drop trigger if exists games_preorder_wishlist_only on public.games;
drop function if exists public.preorder_wishlist_only();
drop trigger if exists games_preorder_backlog_only on public.games;
create trigger games_preorder_backlog_only
  before insert or update of status, preordered_at, preorder_expected_on, preorder_charter
  on public.games
  for each row execute function public.preorder_backlog_only();

-- The append-only lifecycle log. Fires AFTER the shaping trigger above, so:
--   placed:    marker appeared (detail: the expected date)
--   redated:   marker kept, expected date changed (detail: from → to)
--   fulfilled: marker cleared in place — the release unlock (sweep or the
--              owner's "it's arrived" confirm); the card stays in the Bazaar
--   cancelled: the order fell through — demoted to the Wishlist as a want
--              (detail.to_status) or the row deleted outright (detail.removed)
create or replace function public.log_preorder_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- Guard: the account-deletion cascade deletes games AFTER the auth.users
    -- row is gone — inserting a history row for that user would violate the
    -- FK and abort the whole deletion.
    if old.preordered_at is not null
      and exists (select 1 from auth.users u where u.id = old.user_id) then
      insert into public.preorder_events (user_id, game_id, game_title, action, detail)
      values (old.user_id, old.id, old.title, 'cancelled',
              jsonb_build_object('expected_on', old.preorder_expected_on,
                                 'placed_at', old.preordered_at,
                                 'removed', true,
                                 'via_charter', old.preorder_charter));
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.preordered_at is not null then
      insert into public.preorder_events (user_id, game_id, game_title, action, detail)
      values (new.user_id, new.id, new.title, 'placed',
              jsonb_build_object('expected_on', new.preorder_expected_on,
                                 'via_charter', new.preorder_charter));
    end if;
    return new;
  end if;

  if old.preordered_at is null and new.preordered_at is not null then
    insert into public.preorder_events (user_id, game_id, game_title, action, detail)
    values (new.user_id, new.id, new.title, 'placed',
            jsonb_build_object('expected_on', new.preorder_expected_on,
                               'via_charter', new.preorder_charter));
  elsif old.preordered_at is not null and new.preordered_at is null then
    insert into public.preorder_events (user_id, game_id, game_title, action, detail)
    values (new.user_id, new.id, new.title,
            case when new.status = 'backlog' then 'fulfilled' else 'cancelled' end,
            jsonb_build_object('expected_on', old.preorder_expected_on,
                               'placed_at', old.preordered_at,
                               'to_status', new.status,
                               'via_charter', old.preorder_charter));
  elsif old.preordered_at is not null
    and new.preorder_expected_on is distinct from old.preorder_expected_on then
    insert into public.preorder_events (user_id, game_id, game_title, action, detail)
    values (new.user_id, new.id, new.title, 'redated',
            jsonb_build_object('from', old.preorder_expected_on,
                               'to', new.preorder_expected_on));
  end if;
  return new;
end;
$$;

drop trigger if exists games_preorder_audit on public.games;
create trigger games_preorder_audit
  after insert or update of status, preordered_at, preorder_expected_on on public.games
  for each row execute function public.log_preorder_event();

-- A cancelled-by-deletion pre-order still leaves its history row.
drop trigger if exists games_preorder_audit_delete on public.games;
create trigger games_preorder_audit_delete
  after delete on public.games
  for each row execute function public.log_preorder_event();

-- Cancelling a charter-funded pre-order returns the Import Charter (issue
-- fe5f7f54): the charter was spent to move a not-yet-released wishlist game
-- into the Bazaar, so a fallen-through order undoes the spend. Refunds ONLY
-- on the two true cancel dispositions — demotion back to the Wishlist (the
-- exact reverse of the import) or the marked row's deletion — and only when
-- preorder_charter says a charter funded it. A fulfilled pre-order (the game
-- arrived) keeps the charter spent: it did its job. Ditto any other
-- off-backlog exit (e.g. the Move-to-Finished correction): you still own the
-- game, so refunding there would be a free import. Trigger, not RPC, so every
-- cancel path (modal, plain delete, admin) refunds consistently.
-- Fresh Start is safe: its game deletions fire this, but it zeroes charters
-- and wipes the user's coin_events afterwards, absorbing the refund noise.
create or replace function public.refund_preorder_charter()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_coins  integer;
  v_charts integer;
begin
  if old.preordered_at is null or not old.preorder_charter then
    return null;
  end if;
  if tg_op = 'UPDATE'
    and (new.preordered_at is not null or new.status = 'backlog') then
    -- Marker survived (a re-date etc.) or cleared in place (fulfilled).
    return null;
  end if;

  -- Account-deletion cascade guard (see log_preorder_event's DELETE branch).
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return null;
  end if;

  update public.profiles
     set charters = charters + 1
   where id = old.user_id
   returning coins, charters into v_coins, v_charts;
  if not found then
    return null;
  end if;

  -- On delete the game row is gone — the FK insert would dangle, so the
  -- ledger row keeps only the title snapshot (the coin_events pattern).
  perform public.log_coin_event(
    old.user_id, 'charter_refund', 0, 1, v_coins, v_charts,
    case when tg_op = 'DELETE' then null else old.id end, old.title,
    'Pre-order cancelled'
  );
  return null;
end;
$$;

drop trigger if exists games_preorder_charter_refund on public.games;
create trigger games_preorder_charter_refund
  after delete or update of status, preordered_at on public.games
  for each row execute function public.refund_preorder_charter();

-- One-time model migration (idempotent; matches nothing once run): v1 shipped
-- pre-orders as marked WISHLIST rows for a few hours — the Bazaar model moves
-- those same rows, marker intact, into the backlog where pre-orders now live.
-- Touches ONLY wishlist rows carrying a pre-order marker; the status flip is
-- the design change itself, and the shaping trigger keeps the marker since
-- the destination is the backlog. No event fires (marker/date unchanged).
update public.games
   set status = 'backlog'
 where status = 'wishlist' and preordered_at is not null;

-- Release-day unlock. A pre-order already sits in the Bazaar — release day
-- just lifts its start lock: the sweep clears the marker in place (the audit
-- trigger logs 'fulfilled') and sends ONE arrival notification. Idempotent by
-- construction — an unmarked row can never match again. "A date passed" isn't
-- a table event, so the client calls this at boot (the
-- claim_onboarding_vouchers pattern) and mirrors the returned ids locally.
-- Uses the server's current_date (UTC) — at worst the unlock lands a few
-- hours early for western timezones, on release day itself.
-- (Replaces the v1 notify_released_preorders, which only alerted.)
drop function if exists public.notify_released_preorders();
create or replace function public.fulfill_released_preorders()
returns uuid[]
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_moved uuid[] := '{}';
  r record;
begin
  if v_uid is null then return v_moved; end if;
  for r in
    select id, title
      from public.games
     where user_id = v_uid
       and status = 'backlog'
       and preordered_at is not null
       and preorder_expected_on is not null
       and preorder_expected_on <= current_date
     for update
  loop
    update public.games set preordered_at = null where id = r.id;
    insert into public.notifications (user_id, type, title, body, link)
    values (v_uid, 'preorder_released', r.title || ' has arrived!',
            'Your pre-order is out — it''s unlocked in your Bazaar, priced and ready to start.',
            'game:' || r.id);
    v_moved := v_moved || r.id;
  end loop;
  return v_moved;
end;
$$;

revoke execute on function public.fulfill_released_preorders() from public, anon;
grant execute on function public.fulfill_released_preorders() to authenticated;

-- The BEFORE/AFTER trio runs as table triggers only — never client-callable.
revoke execute on function public.preorder_backlog_only() from public, anon, authenticated;
revoke execute on function public.log_preorder_event() from public, anon, authenticated;
revoke execute on function public.refund_preorder_charter() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Market Square Phase 2: community activity, recent reviews, and the weekly
-- spotlight. The Square (which replaced the coin leaderboard) grows from a
-- player directory into a community hub. All three readers are definer RPCs
-- gated the same way: admin-hidden accounts, private profiles, appear-offline
-- players, and anyone who flipped the new "hide_from_square" privacy toggle
-- (profiles.privacy jsonb; absent = shared, matching the agreed default-ON)
-- never appear. Clears are floored at the feature's launch timestamp so
-- activity recorded before the Square existed is never surfaced retroactively
-- to non-friends (the friends-only list_activity_feed is unchanged).
-- ---------------------------------------------------------------------------

-- The community feed reads by time, not by actor — give it its own index.
create index if not exists activity_events_created_idx
  on public.activity_events (created_at desc, id desc);

-- Community clears feed: finishes only (bounty_claimed / co_op_completed) —
-- imports and family events stay friends-only noise. Same row shape as
-- list_activity_feed so the client coercer is shared. Keyset-paginated on
-- created_at. hide_financial_feed strips the coin amount exactly like the
-- friends feed (default: hidden).
drop function if exists public.list_square_activity(timestamptz, integer);
create or replace function public.list_square_activity(
  p_before timestamptz default null,
  p_limit  integer default 30
)
returns table (
  id uuid, actor uuid, actor_name text, actor_avatar text,
  kind text, game_title text, detail jsonb, created_at timestamptz,
  cheer_count bigint, cheered_by_me boolean
)
language sql
security definer set search_path = public
as $$
  select a.id, a.actor, p.display_name, p.avatar_url,
    a.kind, a.game_title,
    case when coalesce((p.privacy->>'hide_financial_feed')::boolean, true)
         then a.detail - 'coins' else a.detail end,
    a.created_at,
    (select count(*) from public.activity_cheers c where c.event_id = a.id),
    exists (select 1 from public.activity_cheers c
             where c.event_id = a.id and c.user_id = auth.uid())
  from public.activity_events a
  join public.profiles p on p.id = a.actor
  where a.kind in ('bounty_claimed', 'co_op_completed')
    -- Launch floor: nothing recorded before the Square shipped goes public.
    and a.created_at >= timestamptz '2026-07-18 00:00:00+00'
    and not p.hidden
    and not coalesce((p.privacy->>'appear_offline')::boolean, false)
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
    and not coalesce((p.privacy->>'hide_from_square')::boolean, false)
    and (p_before is null or a.created_at < p_before)
  order by a.created_at desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
revoke execute on function public.list_square_activity(timestamptz, integer) from public, anon;
grant execute on function public.list_square_activity(timestamptz, integer) to authenticated;

-- Talk of the Bazaar: the newest written reviews across every game, the
-- recency index over the same rows list_game_reviews serves per game (same
-- privacy gates, plus the hidden-account exclusion every community surface
-- applies). Reviews are already community-public on game pages, so this adds
-- no new exposure — hide_from_square therefore does NOT gate it (that toggle
-- covers clears/spotlight, which WOULD be new exposure). No cover images by
-- design: custom cover uploads are friend-gated (player_library), and a
-- community surface must not leak them.
drop function if exists public.list_recent_reviews(timestamptz, integer);
create or replace function public.list_recent_reviews(
  p_before timestamptz default null,
  p_limit  integer default 20
)
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  game_title   text,
  rawg_id      integer,
  catalog_id   uuid,
  review       text,
  score        smallint,
  reviewed_at  timestamptz
)
language sql
security definer set search_path = public
as $$
  select g.user_id, p.display_name, p.avatar_url,
    g.title, g.rawg_id, g.catalog_id,
    g.review, g.review_score, g.reviewed_at
  from public.games g
  join public.profiles p on p.id = g.user_id
  where g.review is not null and length(btrim(g.review)) > 0
    and g.reviewed_at is not null
    and not coalesce(g.private, false)
    and not p.hidden
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
    and (p_before is null or g.reviewed_at < p_before)
  order by g.reviewed_at desc, g.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;
revoke execute on function public.list_recent_reviews(timestamptz, integer) from public, anon;
grant execute on function public.list_recent_reviews(timestamptz, integer) to authenticated;

-- Stall of the Week: the player with the most distinct clears in the trailing
-- 7 days — a rotating celebration, deliberately not a ladder (single row, no
-- rankings below it). Distinct by game title so multi-edition re-clears of one
-- game count once (activity events carry no catalog identity; the title is the
-- snapshot that survives deletes). Ties go to the most recent clear. Counts
-- only what the community feed itself shows (same gates + launch floor), so
-- an opted-out player is never crowned; zero clears this week = zero rows and
-- the client hides the panel.
drop function if exists public.square_spotlight();
create or replace function public.square_spotlight()
returns table (
  user_id      uuid,
  display_name text,
  avatar_url   text,
  title        jsonb,
  clears       bigint,
  last_title   text,
  last_at      timestamptz,
  cosmetics    jsonb
)
language sql
security definer set search_path = public
as $$
  select a.actor, p.display_name, p.avatar_url,
    public.user_title_json(p.id),
    count(distinct coalesce(a.game_title, a.id::text)),
    (array_agg(a.game_title order by a.created_at desc))[1],
    max(a.created_at),
    public.user_cosmetics_json(p.id)
  from public.activity_events a
  join public.profiles p on p.id = a.actor
  where a.kind in ('bounty_claimed', 'co_op_completed')
    and a.created_at >= now() - interval '7 days'
    and a.created_at >= timestamptz '2026-07-18 00:00:00+00'
    and not p.hidden
    and not coalesce((p.privacy->>'appear_offline')::boolean, false)
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
    and not coalesce((p.privacy->>'hide_from_square')::boolean, false)
  group by a.actor, p.id, p.display_name, p.avatar_url
  order by count(distinct coalesce(a.game_title, a.id::text)) desc,
           max(a.created_at) desc
  limit 1;
$$;
revoke execute on function public.square_spotlight() from public, anon;
grant execute on function public.square_spotlight() to authenticated;

-- ---------------------------------------------------------------------------
-- Market Square Phase 3: Hot This Week (trending titles) + Curated Stalls
-- (public-list browsing).
-- ---------------------------------------------------------------------------

-- Hot This Week: anonymous per-title activity counts over the trailing 7 days,
-- straight from the event logs (the audit-everything investment on screen).
-- Titles group by shared catalog identity (rawg id, else catalog id, else the
-- normalised title — mirroring finished_game_stats/catalogKey), and every
-- count is DISTINCT players, so one player's per-platform instances or
-- repeated toggles never inflate a number (community_game_stats' convention:
-- per-game `private` rows excluded, aggregates otherwise anonymous). The
-- cover comes from the shared catalog only — never games.image, which can be
-- a private custom upload (friend-gated elsewhere and must not leak here).
-- Events whose game row was since deleted drop out (identity needs the row).
drop function if exists public.square_trending(integer);
create or replace function public.square_trending(p_limit integer default 12)
returns table (
  rawg_id    integer,
  catalog_id uuid,
  title      text,
  image      text,
  adds       bigint,
  finishes   bigint,
  likes      bigint,
  reviews    bigint
)
language sql
security definer set search_path = public
as $$
  with ev as (
    -- New library entries (from_status null = the initial add).
    select g.rawg_id, g.catalog_id, g.title, e.user_id, 'add' as kind
      from public.game_status_events e
      join public.games g on g.id = e.game_id
     where e.created_at >= now() - interval '7 days'
       and e.from_status is null
       and not coalesce(g.private, false)
    union all
    -- Finishes (a move INTO finished, not a re-save of it).
    select g.rawg_id, g.catalog_id, g.title, e.user_id, 'finish'
      from public.game_status_events e
      join public.games g on g.id = e.game_id
     where e.created_at >= now() - interval '7 days'
       and e.to_status = 'finished'
       and e.from_status is distinct from 'finished'
       and not coalesce(g.private, false)
    union all
    select g.rawg_id, g.catalog_id, g.title, l.user_id, 'like'
      from public.like_events l
      join public.games g on g.id = l.game_id
     where l.created_at >= now() - interval '7 days'
       and l.action = 'liked'
       and not coalesce(g.private, false)
    union all
    select g.rawg_id, g.catalog_id, g.title, r.user_id, 'review'
      from public.review_events r
      join public.games g on g.id = r.game_id
     where r.created_at >= now() - interval '7 days'
       and r.review is not null
       and not coalesce(g.private, false)
  ),
  agg as (
    select coalesce('r:' || ev.rawg_id::text,
                    'c:' || ev.catalog_id::text,
                    't:' || lower(btrim(ev.title)))            as k,
           (array_agg(ev.rawg_id) filter (where ev.rawg_id is not null))[1]       as rawg_id,
           (array_agg(ev.catalog_id) filter (where ev.catalog_id is not null))[1] as catalog_id,
           (array_agg(ev.title))[1]                                               as title,
           count(distinct ev.user_id) filter (where ev.kind = 'add')    as adds,
           count(distinct ev.user_id) filter (where ev.kind = 'finish') as finishes,
           count(distinct ev.user_id) filter (where ev.kind = 'like')   as likes,
           count(distinct ev.user_id) filter (where ev.kind = 'review') as reviews
      from ev
     group by 1
  )
  select a.rawg_id, a.catalog_id, a.title,
    (select c.image from public.catalog_games c
      where (a.rawg_id is not null and c.rawg_id = a.rawg_id)
         or (a.catalog_id is not null and c.id = a.catalog_id)
      limit 1)                                                as image,
    a.adds, a.finishes, a.likes, a.reviews
  from agg a
  -- Finishes weigh double: completing a game is the app's core celebration.
  order by (a.adds + a.finishes * 2 + a.likes + a.reviews) desc, a.title asc
  limit greatest(1, least(coalesce(p_limit, 12), 24));
$$;
revoke execute on function public.square_trending(integer) from public, anon;
grant execute on function public.square_trending(integer) to authenticated;

-- Curated Stalls: recently-updated PUBLIC lists, for browsing (unlisted stays
-- link-only via get_game_list — this surface is public-visibility only). A
-- definer RPC on purpose: the game_lists RLS select policy leaks public lists
-- into own-data queries, so browsing never goes through a bare select. Owner
-- gates match the community surfaces: blocked, admin-hidden and hard-private
-- owners are skipped. Cover strip = the first four item snapshots, which are
-- catalog art by construction (game_list_items.image never stores a custom
-- upload).
drop function if exists public.list_public_game_lists(integer);
create or replace function public.list_public_game_lists(p_limit integer default 20)
returns table (
  id           uuid,
  title        text,
  description  text,
  owner_id     uuid,
  owner_name   text,
  owner_avatar text,
  updated_at   timestamptz,
  item_count   bigint,
  covers       text[]
)
language sql
security definer set search_path = public
as $$
  select l.id, l.title, l.description,
    l.user_id, p.display_name, p.avatar_url, l.updated_at,
    (select count(*) from public.game_list_items i where i.list_id = l.id),
    (select coalesce(array_agg(x.image), '{}')
       from (select i.image from public.game_list_items i
              where i.list_id = l.id and i.image is not null
              order by i.rank, i.created_at
              limit 4) x)
  from public.game_lists l
  join public.profiles p on p.id = l.user_id
  where l.visibility = 'public'
    and not p.blocked
    and not p.hidden
    and not coalesce((p.privacy->>'private_profile')::boolean, false)
    and exists (select 1 from public.game_list_items i where i.list_id = l.id)
  order by l.updated_at desc, l.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
revoke execute on function public.list_public_game_lists(integer) from public, anon;
grant execute on function public.list_public_game_lists(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Sponsorships ("Back a Game"): stake your own coins on a FRIEND's backlog
-- game; the stake pays out on top of their bounty when they finish it, and
-- returns to you if unclaimed at expiry. Zero-sum end to end — a stake is only
-- ever paid out or refunded, never minted or destroyed. Design agreed
-- 2026-07-18: friends-only, bounty-boost only (no fee discount in v1), 60-day
-- default expiry, per-stake and per-pair caps below. Every money movement is
-- a coin_events row and every lifecycle step an append-only sponsorship_events
-- row; all writes are definer RPCs/triggers — the client never touches these
-- tables directly.
-- ---------------------------------------------------------------------------

-- Tunable knobs (admin Economy page).
alter table public.app_config add column if not exists sponsor_max_stake        integer not null default 50;
alter table public.app_config add column if not exists sponsor_monthly_pair_cap integer not null default 100;
alter table public.app_config add column if not exists sponsor_expiry_days      integer not null default 60;

create table if not exists public.sponsorships (
  id          uuid primary key default gen_random_uuid(),
  sponsor     uuid not null references auth.users (id) on delete cascade,
  recipient   uuid not null references auth.users (id) on delete cascade,
  -- set null on game delete: the BEFORE DELETE refund trigger resolves the
  -- stake first, and the resolved row keeps its title snapshot for history.
  game_id     uuid references public.games (id) on delete set null,
  game_title  text not null,
  amount      integer not null check (amount > 0),
  status      text not null default 'active'
              check (status in ('active', 'paid', 'expired', 'refunded')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  resolved_at timestamptz
);
create index if not exists sponsorships_recipient_idx on public.sponsorships (recipient, status);
create index if not exists sponsorships_sponsor_idx   on public.sponsorships (sponsor, status);
create index if not exists sponsorships_game_idx      on public.sponsorships (game_id) where status = 'active';
-- One active stake per sponsor per game (re-backing needs the first to resolve).
create unique index if not exists sponsorships_active_pair_game
  on public.sponsorships (sponsor, game_id) where status = 'active';

-- Append-only lifecycle audit (title snapshots survive every delete).
create table if not exists public.sponsorship_events (
  id             uuid primary key default gen_random_uuid(),
  sponsorship_id uuid references public.sponsorships (id) on delete set null,
  sponsor        uuid references auth.users (id) on delete set null,
  recipient      uuid references auth.users (id) on delete set null,
  action         text not null check (action in ('staked', 'paid', 'expired', 'refunded')),
  game_title     text,
  amount         integer not null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists sponsorship_events_sponsor_idx
  on public.sponsorship_events (sponsor, created_at desc);

alter table public.sponsorships       enable row level security;
alter table public.sponsorship_events enable row level security;
revoke insert, update, delete on public.sponsorships       from authenticated, anon;
revoke insert, update, delete on public.sponsorship_events from authenticated, anon;
-- Participants (and admins) may read their own rows; the app reads via the
-- list RPC below, but the policy keeps direct debugging/exports possible.
drop policy if exists "sponsorships_select" on public.sponsorships;
create policy "sponsorships_select" on public.sponsorships
  for select to authenticated using (
    auth.uid() in (sponsor, recipient)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
drop policy if exists "sponsorship_events_select" on public.sponsorship_events;
create policy "sponsorship_events_select" on public.sponsorship_events
  for select to authenticated using (
    auth.uid() in (sponsor, recipient)
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Place a stake on a friend's backlog game. Guards: accepted friendship, the
-- target is a visible (not private / not hard-private owner) backlog game that
-- isn't a locked pre-order, the amount fits the per-stake cap, and the pair's
-- monthly budget — currently active stakes PLUS stakes paid out this calendar
-- month — has room. The stake escrows immediately (same coins >= guard as
-- apply_purchase).
create or replace function public.sponsor_game(p_game uuid, p_amount integer)
returns table (coins integer, expires_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_game      record;
  v_max       integer;
  v_pair_cap  integer;
  v_days      integer;
  v_used      integer;
  v_new_coins integer;
  v_expires   timestamptz;
  v_id        uuid;
  v_my_name   text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Stake must be at least 1 coin'; end if;

  -- Economy off on either side blocks a new stake: a frozen sponsor can't
  -- spend, and a recipient without the coin economy has no bounty to boost.
  if not public.economy_enabled(v_me) then
    raise exception 'ECONOMY_OFF';
  end if;

  select g.id, g.user_id, g.title, g.status, g.private, g.preordered_at
    into v_game
    from public.games g where g.id = p_game;
  if not found or v_game.user_id = v_me or coalesce(v_game.private, false) then
    raise exception 'Game not available to back';
  end if;
  if not public.economy_enabled(v_game.user_id) then
    raise exception 'RECIPIENT_ECONOMY_OFF';
  end if;
  if v_game.status <> 'backlog' then
    raise exception 'Only a Bazaar (backlog) game can be backed';
  end if;
  if v_game.preordered_at is not null then
    raise exception 'A locked pre-order can''t be backed yet';
  end if;
  -- Friends only, and never a hard-private owner (their Bazaar is unvisitable).
  if not exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester = v_me and f.addressee = v_game.user_id)
         or (f.requester = v_game.user_id and f.addressee = v_me))
  ) then
    raise exception 'You can only back a friend''s game';
  end if;
  if exists (
    select 1 from public.profiles p where p.id = v_game.user_id
      and coalesce((p.privacy->>'private_profile')::boolean, false)
  ) then
    raise exception 'Game not available to back';
  end if;

  select sponsor_max_stake, sponsor_monthly_pair_cap, sponsor_expiry_days
    into v_max, v_pair_cap, v_days from public.app_config where id = 1;
  v_max      := coalesce(v_max, 50);
  v_pair_cap := coalesce(v_pair_cap, 100);
  v_days     := coalesce(v_days, 60);
  if p_amount > v_max then
    raise exception 'The maximum stake is % coins', v_max;
  end if;
  -- Pair budget: what's still escrowed to this friend + what actually paid out
  -- this month (refunds/expiries give the room back).
  select coalesce(sum(s.amount), 0) into v_used
    from public.sponsorships s
   where s.sponsor = v_me and s.recipient = v_game.user_id
     and (s.status = 'active'
       or (s.status = 'paid' and s.resolved_at >= date_trunc('month', now())));
  if v_used + p_amount > v_pair_cap then
    raise exception 'That would pass your % coins/month backing limit with this friend', v_pair_cap;
  end if;

  update public.profiles set coins = profiles.coins - p_amount
   where id = v_me and profiles.coins >= p_amount
   returning profiles.coins into v_new_coins;
  if v_new_coins is null then raise exception 'Not enough coins'; end if;

  v_expires := now() + make_interval(days => v_days);
  insert into public.sponsorships (sponsor, recipient, game_id, game_title, amount, expires_at)
  values (v_me, v_game.user_id, v_game.id, v_game.title, p_amount, v_expires)
  returning id into v_id;
  -- The unique active-pair-game index raises here on a duplicate stake.

  insert into public.sponsorship_events (sponsorship_id, sponsor, recipient, action, game_title, amount)
  values (v_id, v_me, v_game.user_id, 'staked', v_game.title, p_amount);

  perform public.log_coin_event(
    v_me, 'sponsor_stake', -p_amount, 0, v_new_coins, null,
    v_game.id, v_game.title, 'Backed a Friend''s Game',
    jsonb_build_object('recipient', v_game.user_id, 'expires_at', v_expires));

  select display_name into v_my_name from public.profiles where id = v_me;
  insert into public.notifications (user_id, type, title, body, link)
  values (v_game.user_id, 'sponsor_staked', 'Your game got backed!',
          coalesce(v_my_name, 'A friend') || ' staked ' || p_amount || ' coins on '
          || v_game.title || ' — finish it by ' || to_char(v_expires, 'Mon DD') || ' to claim the bonus.',
          'game:' || v_game.id);

  return query select v_new_coins, v_expires;
end;
$$;
revoke execute on function public.sponsor_game(uuid, integer) from public, anon;
grant execute on function public.sponsor_game(uuid, integer) to authenticated;

-- The caller's sponsorships, both directions, with counterpart names resolved.
drop function if exists public.list_my_sponsorships();
create or replace function public.list_my_sponsorships()
returns table (
  id             uuid,
  sponsor        uuid,
  recipient      uuid,
  sponsor_name   text,
  recipient_name text,
  game_id        uuid,
  game_title     text,
  amount         integer,
  status         text,
  created_at     timestamptz,
  expires_at     timestamptz,
  resolved_at    timestamptz
)
language sql
security definer set search_path = public
as $$
  select s.id, s.sponsor, s.recipient,
    sp.display_name, rp.display_name,
    s.game_id, s.game_title, s.amount, s.status,
    s.created_at, s.expires_at, s.resolved_at
  from public.sponsorships s
  left join public.profiles sp on sp.id = s.sponsor
  left join public.profiles rp on rp.id = s.recipient
  where auth.uid() in (s.sponsor, s.recipient)
  order by s.created_at desc, s.id desc
  limit 200;
$$;
revoke execute on function public.list_my_sponsorships() from public, anon;
grant execute on function public.list_my_sponsorships() to authenticated;

-- Settle stakes when a sponsored game's status changes. A genuine finish
-- (finished, not retired) pays every active stake to the finisher on top of
-- their bounty; a Retire It (terminal drop) refunds the sponsors instead — no
-- salvaging someone else's coins. Trigger-based like the Co-op guard so no
-- client path can skip it. Later flipping a retired tag to beaten does NOT
-- resurrect stakes (they resolved at retire time).
create or replace function public.settle_sponsorships_on_finish()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  s            record;
  v_after      integer;
  v_was_paying boolean := old.status = 'finished' and coalesce(old.finish_tag, '') <> 'retired';
  v_pays       boolean := new.status = 'finished' and coalesce(new.finish_tag, '') <> 'retired';
  v_retired    boolean := new.status = 'finished' and new.finish_tag = 'retired';
  v_rec_name   text;
  -- Defense-in-depth toggle race: set_economy_enabled refunds all active
  -- stakes when the recipient turns the economy off, and sponsor_game refuses
  -- new ones — but if a stake still slips through to a finish while the
  -- recipient is off, it refunds instead of paying into a frozen balance.
  v_rec_econ   boolean := public.economy_enabled(new.user_id);
  v_reason     text;
begin
  if (v_pays and not v_was_paying) or v_retired or (v_pays and not v_rec_econ) then
    for s in
      select * from public.sponsorships
       where game_id = new.id and status = 'active'
       for update
    loop
      if v_pays and v_rec_econ then
        update public.profiles set coins = coins + s.amount
         where id = s.recipient returning coins into v_after;
        update public.sponsorships set status = 'paid', resolved_at = now() where id = s.id;
        insert into public.sponsorship_events (sponsorship_id, sponsor, recipient, action, game_title, amount)
        values (s.id, s.sponsor, s.recipient, 'paid', s.game_title, s.amount);
        perform public.log_coin_event(
          s.recipient, 'sponsor_payout', s.amount, 0, v_after, null,
          new.id, s.game_title, 'Sponsorship Bonus',
          jsonb_build_object('sponsor', s.sponsor));
        select display_name into v_rec_name from public.profiles where id = s.recipient;
        insert into public.notifications (user_id, type, title, body, link)
        values
          (s.recipient, 'sponsor_paid', 'Backing claimed!',
           'You claimed the ' || s.amount || '-coin backing on ' || s.game_title
           || ' — on top of your bounty.', 'game:' || new.id),
          (s.sponsor, 'sponsor_paid', 'Your backing paid out',
           coalesce(v_rec_name, 'Your friend') || ' finished ' || s.game_title
           || ' — your ' || s.amount || '-coin backing paid out. Well staked!', 'social');
      else
        -- Retired (the run is over for good) or the recipient has the economy
        -- off — either way, return the sponsor's coins.
        v_reason := case when v_retired then 'retired' else 'recipient_economy_off' end;
        update public.sponsorships set status = 'refunded', resolved_at = now() where id = s.id;
        insert into public.sponsorship_events (sponsorship_id, sponsor, recipient, action, game_title, amount, detail)
        values (s.id, s.sponsor, s.recipient, 'refunded', s.game_title, s.amount,
                jsonb_build_object('reason', v_reason));
        if exists (select 1 from auth.users u where u.id = s.sponsor) then
          update public.profiles set coins = coins + s.amount
           where id = s.sponsor returning coins into v_after;
          perform public.log_coin_event(
            s.sponsor, 'sponsor_refund', s.amount, 0, v_after, null,
            new.id, s.game_title, 'Sponsorship Returned',
            jsonb_build_object('reason', v_reason, 'recipient', s.recipient));
          insert into public.notifications (user_id, type, title, body, link)
          values (s.sponsor, 'sponsor_refund', 'Backing returned',
                  s.game_title
                  || case when v_retired then ' was retired — your '
                          else '''s owner isn''t using the coin economy — your ' end
                  || s.amount || '-coin backing came back to you.', 'social');
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists games_settle_sponsorships on public.games;
create trigger games_settle_sponsorships
  after update of status, finish_tag on public.games
  for each row execute function public.settle_sponsorships_on_finish();

-- A sponsored game leaving the library (delete, Fresh Start wipe, account
-- deletion cascade) refunds its active stakes — the sponsor's coins can never
-- be destroyed. The auth.users guard skips crediting a sponsor who is
-- themselves mid-deletion (their sponsorships cascade away regardless).
create or replace function public.refund_sponsorships_on_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  s       record;
  v_after integer;
begin
  for s in
    select * from public.sponsorships
     where game_id = old.id and status = 'active'
     for update
  loop
    update public.sponsorships set status = 'refunded', resolved_at = now() where id = s.id;
    insert into public.sponsorship_events (sponsorship_id, sponsor, recipient, action, game_title, amount, detail)
    values (s.id, s.sponsor, s.recipient, 'refunded', s.game_title, s.amount,
            jsonb_build_object('reason', 'game_deleted'));
    if exists (select 1 from auth.users u where u.id = s.sponsor) then
      update public.profiles set coins = coins + s.amount
       where id = s.sponsor returning coins into v_after;
      perform public.log_coin_event(
        s.sponsor, 'sponsor_refund', s.amount, 0, v_after, null,
        null, s.game_title, 'Sponsorship Returned',
        jsonb_build_object('reason', 'game_deleted', 'recipient', s.recipient));
      insert into public.notifications (user_id, type, title, body, link)
      values (s.sponsor, 'sponsor_refund', 'Backing returned',
              s.game_title || ' left your friend''s library — your ' || s.amount
              || '-coin backing came back to you.', 'social');
    end if;
  end loop;
  return old;
end;
$$;
drop trigger if exists games_refund_sponsorships on public.games;
create trigger games_refund_sponsorships
  before delete on public.games
  for each row execute function public.refund_sponsorships_on_delete();

-- Expiry boot-sweep ("a date passed" isn't a table event — the
-- fulfill_released_preorders pattern). Any signed-in boot sweeps ALL expired
-- stakes, so an offline sponsor still gets their refund the moment anyone
-- opens the app. Returns how many were swept; the client refreshes when > 0.
create or replace function public.sweep_expired_sponsorships()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  s       record;
  v_after integer;
  v_count integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  for s in
    select * from public.sponsorships
     where status = 'active' and expires_at <= now()
     for update skip locked
  loop
    update public.sponsorships set status = 'expired', resolved_at = now() where id = s.id;
    insert into public.sponsorship_events (sponsorship_id, sponsor, recipient, action, game_title, amount)
    values (s.id, s.sponsor, s.recipient, 'expired', s.game_title, s.amount);
    if exists (select 1 from auth.users u where u.id = s.sponsor) then
      update public.profiles set coins = coins + s.amount
       where id = s.sponsor returning coins into v_after;
      perform public.log_coin_event(
        s.sponsor, 'sponsor_refund', s.amount, 0, v_after, null,
        s.game_id, s.game_title, 'Sponsorship Returned',
        jsonb_build_object('reason', 'expired', 'recipient', s.recipient));
      insert into public.notifications (user_id, type, title, body, link)
      values (s.sponsor, 'sponsor_refund', 'Backing expired',
              'Your ' || s.amount || '-coin backing on ' || s.game_title
              || ' went unclaimed and came back to you.', 'social');
    end if;
    if exists (select 1 from auth.users u where u.id = s.recipient) then
      insert into public.notifications (user_id, type, title, body, link)
      values (s.recipient, 'sponsor_expired', 'A backing expired',
              'The ' || s.amount || '-coin backing on ' || s.game_title
              || ' expired before you finished it.', case when s.game_id is not null then 'game:' || s.game_id end);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.sweep_expired_sponsorships() from public, anon;
grant execute on function public.sweep_expired_sponsorships() to authenticated;

-- Trigger functions are never client-callable.
revoke execute on function public.settle_sponsorships_on_finish() from public, anon, authenticated;
revoke execute on function public.refund_sponsorships_on_delete() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Curio Shop RPCs (tables/seed/read policies live up by the badges section).
-- All coin movement runs through buy_shop_item → log_coin_event; equipping and
-- stock management are definer-only because the tables carry no write grants.
-- ---------------------------------------------------------------------------

-- Stock-change audit: one audit_events row per changed field (the app_config
-- pattern), so price/window/active tweaks are always reconstructable. Purchases
-- need no extra audit — coin_events + shop_purchases are the receipts.
create or replace function public.log_shop_item_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb := to_jsonb(new);
  v_key text;
  v_cols text[] := array[
    'name', 'description', 'price', 'style', 'badge_id', 'tier', 'secret',
    'set_key', 'available_from', 'available_until', 'active', 'sort'
  ];
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (actor_id, entity, entity_id, action, detail)
    values (auth.uid(), 'shop_item', new.id::text, 'create',
            jsonb_build_object('slug', new.slug, 'kind', new.kind,
                               'name', new.name, 'price', new.price));
    return new;
  end if;
  v_old := to_jsonb(old);
  foreach v_key in array v_cols loop
    if v_new -> v_key is distinct from v_old -> v_key then
      insert into public.audit_events
        (actor_id, entity, entity_id, action, field, old_value, new_value)
      values (auth.uid(), 'shop_item', new.id::text, 'update', v_key,
              v_old -> v_key, v_new -> v_key);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists shop_items_log_event on public.shop_items;
create trigger shop_items_log_event
  after insert or update on public.shop_items
  for each row execute function public.log_shop_item_event();

-- Buy an item: availability-gated, balance-guarded, once per user. The receipt
-- is inserted FIRST (the unique pair serializes concurrent double-buys; any
-- later failure rolls it back), then the atomic debit, then the badge grant for
-- title items. Returns the new coin balance.
-- Moderation note: admin_revoke_badge can still strip a purchased title; the
-- un-revoke below only fires on a FRESH purchase (an owner re-buying is refused
-- above it), so a revoked buyer stays revoked until an admin re-grants.
create or replace function public.buy_shop_item(p_item uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_item      public.shop_items%rowtype;
  v_coins     integer;
  v_set_badge uuid;
begin
  -- Economy off: coins are frozen, so the shop is browse-only (owned cosmetics
  -- stay equipped; the client disables Buy).
  if not public.economy_enabled(auth.uid()) then
    raise exception 'ECONOMY_OFF';
  end if;
  -- The shopkeeper's closed-sign: nothing sells while the admin rearranges.
  if not coalesce((select shop_open from public.app_config where id = 1), true) then
    raise exception 'SHOP_CLOSED';
  end if;

  select * into v_item from public.shop_items where id = p_item;
  if not found then
    raise exception 'Unknown item';
  end if;
  if not v_item.active
     or (v_item.available_from  is not null and v_item.available_from  > now())
     or (v_item.available_until is not null and v_item.available_until <= now())
     or (v_item.kind = 'title' and v_item.badge_id is null) then
    raise exception 'This item isn''t available right now';
  end if;

  insert into public.shop_purchases (user_id, item_id, item_slug, item_name, item_kind, price_paid)
  values (auth.uid(), p_item, v_item.slug, v_item.name, v_item.kind, v_item.price)
  on conflict (user_id, item_id) do nothing;
  if not found then
    raise exception 'You already own this item';
  end if;

  update public.profiles
     set coins = coins - v_item.price
   where id = auth.uid() and coins >= v_item.price
   returning coins into v_coins;
  if v_coins is null then
    raise exception 'Not enough coins';
  end if;

  if v_item.kind = 'title' then
    insert into public.user_badges (user_id, badge_id, source)
    values (auth.uid(), v_item.badge_id, 'shop')
    on conflict (user_id, badge_id) do update set revoked_at = null;
  end if;

  -- Set bonus: if this purchase completes the item's collection (every ACTIVE
  -- member owned), grant the set's exclusive reward title. `do nothing` keeps a
  -- moderation revoke sticky, and no notification fires — completing your own
  -- set is your own action (the client toasts the celebration instead).
  if v_item.set_key is not null then
    select badge_id into v_set_badge from public.shop_sets where key = v_item.set_key;
    if v_set_badge is not null and not exists (
      select 1 from public.shop_items si
       where si.set_key = v_item.set_key and si.active
         and not exists (select 1 from public.shop_purchases sp
                          where sp.user_id = auth.uid() and sp.item_id = si.id)
    ) then
      insert into public.user_badges (user_id, badge_id, source)
      values (auth.uid(), v_set_badge, 'shop')
      on conflict (user_id, badge_id) do nothing;
    end if;
  end if;

  perform public.log_coin_event(
    auth.uid(), 'shop_purchase', -v_item.price, 0, v_coins, null, null, null,
    v_item.name, jsonb_build_object('item_slug', v_item.slug, 'item_kind', v_item.kind)
  );

  return v_coins;
end;
$$;

-- Equip (or clear, with p_item null) an owned frame/stall cosmetic. Titles keep
-- going through set_selected_title. Definer because the equipped columns are
-- intentionally outside the client's profiles update grant.
create or replace function public.equip_cosmetic(p_kind text, p_item uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_kind not in ('frame', 'stall', 'coin') then
    raise exception 'Unknown cosmetic kind';
  end if;
  if p_item is not null and not exists (
    select 1
      from public.shop_purchases sp
      join public.shop_items si on si.id = sp.item_id
     where sp.user_id = auth.uid() and sp.item_id = p_item and si.kind = p_kind
  ) then
    raise exception 'You don''t own that item';
  end if;
  if p_kind = 'frame' then
    update public.profiles set equipped_frame_id = p_item where id = auth.uid();
  elsif p_kind = 'stall' then
    update public.profiles set equipped_stall_id = p_item where id = auth.uid();
  else
    update public.profiles set equipped_coin_id = p_item where id = auth.uid();
  end if;
end;
$$;

-- Create or update a shop item (shop.manage). Slug and kind are identity —
-- immutable after creation. Title items create/sync their linked kind-'shop'
-- badge (slug 'shop-' || item slug, matching the seed convention). There is
-- deliberately NO delete: retiring stock is p_active = false, so every past
-- purchase and equip keeps resolving.
-- (Signature grew tier/secret then badge_effect/set_key 2026-07 — drop the old
-- 13- and 15-arg versions so re-runs don't leave ambiguous overloads behind.)
drop function if exists public.admin_save_shop_item(uuid, text, text, text, text, integer, text, text, integer, timestamptz, timestamptz, boolean, integer);
drop function if exists public.admin_save_shop_item(uuid, text, text, text, text, integer, text, text, integer, timestamptz, timestamptz, boolean, integer, text, boolean);
create or replace function public.admin_save_shop_item(
  p_id              uuid,
  p_slug            text,
  p_kind            text,
  p_name            text,
  p_description     text,
  p_price           integer,
  p_style           text,
  p_badge_icon      text,
  p_badge_prestige  integer,
  p_available_from  timestamptz,
  p_available_until timestamptz,
  p_active          boolean,
  p_sort            integer,
  p_tier            text,
  p_secret          boolean,
  p_badge_effect    text,
  p_set_key         text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id     uuid := p_id;
  v_kind   text;
  v_badge  uuid;
  v_slug   text := btrim(coalesce(p_slug, ''));
  v_name   text := btrim(coalesce(p_name, ''));
  v_desc   text := nullif(btrim(coalesce(p_description, '')), '');
  v_style  text := nullif(btrim(coalesce(p_style, '')), '');
  v_tier   text := coalesce(nullif(btrim(coalesce(p_tier, '')), ''), 'standard');
  v_effect text := nullif(btrim(coalesce(p_badge_effect, '')), '');
  v_set    text := nullif(btrim(coalesce(p_set_key, '')), '');
begin
  if not public.has_permission('shop.manage') then
    raise exception 'Not authorized';
  end if;
  if v_tier not in ('standard', 'premium') then
    raise exception 'Unknown tier';
  end if;
  if v_set is not null and not exists (select 1 from public.shop_sets where key = v_set) then
    raise exception 'Unknown collection';
  end if;

  if v_id is null then
    if p_kind not in ('title', 'frame', 'stall', 'coin') then
      raise exception 'Unknown item kind';
    end if;
    if v_slug = '' or v_name = '' then
      raise exception 'Slug and name are required';
    end if;
    if p_kind <> 'title' and v_style is null then
      raise exception 'A visual style is required';
    end if;
    insert into public.shop_items
      (slug, kind, name, description, price, style, tier, secret, set_key,
       available_from, available_until, active, sort)
    values
      (v_slug, p_kind, v_name, v_desc, greatest(0, coalesce(p_price, 0)),
       case when p_kind = 'title' then null else v_style end,
       v_tier, coalesce(p_secret, false), v_set,
       p_available_from, p_available_until, coalesce(p_active, true), coalesce(p_sort, 0))
    returning id, kind into v_id, v_kind;
  else
    if v_name = '' then
      raise exception 'Name is required';
    end if;
    select kind into v_kind from public.shop_items where id = v_id;
    if not found then
      raise exception 'Unknown item';
    end if;
    if v_kind <> 'title' and v_style is null then
      raise exception 'A visual style is required';
    end if;
    update public.shop_items
       set name            = v_name,
           description     = v_desc,
           price           = greatest(0, coalesce(p_price, 0)),
           style           = case when v_kind = 'title' then null else v_style end,
           tier            = v_tier,
           secret          = coalesce(p_secret, false),
           set_key         = v_set,
           available_from  = p_available_from,
           available_until = p_available_until,
           active          = coalesce(p_active, true),
           sort            = coalesce(p_sort, 0)
     where id = v_id;
  end if;

  if v_kind = 'title' then
    select badge_id, slug into v_badge, v_slug from public.shop_items where id = v_id;
    if v_badge is null then
      insert into public.badges (slug, name, description, icon, kind, prestige, effect)
      values ('shop-' || v_slug, v_name, v_desc,
              coalesce(nullif(btrim(coalesce(p_badge_icon, '')), ''), 'award'),
              'shop', greatest(0, coalesce(p_badge_prestige, 3)), v_effect)
      on conflict (slug) do update set name = excluded.name
      returning id into v_badge;
      update public.shop_items set badge_id = v_badge where id = v_id;
    else
      -- Effect follows the icon convention: blank keeps the current value (the
      -- editor sends null unless the admin picks a new one).
      update public.badges
         set name        = v_name,
             description = v_desc,
             icon        = coalesce(nullif(btrim(coalesce(p_badge_icon, '')), ''), icon),
             prestige    = coalesce(p_badge_prestige, prestige),
             effect      = coalesce(v_effect, effect)
       where id = v_badge;
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.buy_shop_item(uuid) from public, anon;
grant  execute on function public.buy_shop_item(uuid) to authenticated;
revoke execute on function public.equip_cosmetic(text, uuid) from public, anon;
grant  execute on function public.equip_cosmetic(text, uuid) to authenticated;
revoke execute on function public.admin_save_shop_item(uuid, text, text, text, text, integer, text, text, integer, timestamptz, timestamptz, boolean, integer, text, boolean, text, text) from public, anon;
grant  execute on function public.admin_save_shop_item(uuid, text, text, text, text, integer, text, text, integer, timestamptz, timestamptz, boolean, integer, text, boolean, text, text) to authenticated;
revoke execute on function public.log_shop_item_event() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Economy mode toggle (the flag column + guard helper live up by the profiles
-- section; every economy RPC consults them). Turning the economy OFF first
-- resolves the caller's active sponsorships in both directions — incoming
-- stakes go back to their sponsors, outgoing stakes come home — because a
-- frozen balance can neither receive a payout nor keep coins escrowed. The
-- flip itself is audited by the profiles_log_event trigger, and a zero-delta
-- ledger marker records the freeze boundary in the money history.
-- ---------------------------------------------------------------------------
create or replace function public.set_economy_enabled(p_on boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_cur     boolean;
  v_coins   integer;
  v_name    text;
  s         record;
  v_after   integer;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_on is null then raise exception 'Invalid value'; end if;

  select economy_enabled, coins, display_name into v_cur, v_coins, v_name
    from public.profiles where id = v_me for update;
  if v_cur is null or v_cur = p_on then
    return; -- unknown profile or no change: idempotent no-op, no event spam
  end if;

  if not p_on then
    -- Incoming: active stakes friends placed on the caller's games go back to
    -- their sponsors (reuses the expiry-sweep shape).
    for s in
      select * from public.sponsorships
       where recipient = v_me and status = 'active'
       for update
    loop
      update public.sponsorships set status = 'refunded', resolved_at = now() where id = s.id;
      insert into public.sponsorship_events (sponsorship_id, sponsor, recipient, action, game_title, amount, detail)
      values (s.id, s.sponsor, s.recipient, 'refunded', s.game_title, s.amount,
              jsonb_build_object('reason', 'recipient_economy_off'));
      if exists (select 1 from auth.users u where u.id = s.sponsor) then
        update public.profiles set coins = coins + s.amount
         where id = s.sponsor returning coins into v_after;
        perform public.log_coin_event(
          s.sponsor, 'sponsor_refund', s.amount, 0, v_after, null,
          s.game_id, s.game_title, 'Sponsorship Returned',
          jsonb_build_object('reason', 'recipient_economy_off', 'recipient', v_me));
        insert into public.notifications (user_id, type, title, body, link)
        values (s.sponsor, 'sponsor_refund', 'Backing returned',
                coalesce(v_name, 'Your friend') || ' turned off their coin economy — your '
                || s.amount || '-coin backing on ' || s.game_title || ' came back to you.',
                'social');
      end if;
    end loop;

    -- Outgoing: the caller's own escrowed stakes come home before the freeze.
    for s in
      select * from public.sponsorships
       where sponsor = v_me and status = 'active'
       for update
    loop
      update public.sponsorships set status = 'refunded', resolved_at = now() where id = s.id;
      insert into public.sponsorship_events (sponsorship_id, sponsor, recipient, action, game_title, amount, detail)
      values (s.id, s.sponsor, s.recipient, 'refunded', s.game_title, s.amount,
              jsonb_build_object('reason', 'sponsor_economy_off'));
      update public.profiles set coins = coins + s.amount
       where id = v_me returning coins into v_coins;
      perform public.log_coin_event(
        v_me, 'sponsor_refund', s.amount, 0, v_coins, null,
        s.game_id, s.game_title, 'Sponsorship Returned',
        jsonb_build_object('reason', 'sponsor_economy_off', 'recipient', s.recipient));
      if exists (select 1 from auth.users u where u.id = s.recipient) then
        insert into public.notifications (user_id, type, title, body, link)
        values (s.recipient, 'sponsor_refund', 'A backing was withdrawn',
                coalesce(v_name, 'Your friend') || ' turned off their coin economy — the '
                || s.amount || '-coin backing on ' || s.game_title || ' was returned to them.',
                'social');
      end if;
    end loop;
  end if;

  update public.profiles set economy_enabled = p_on where id = v_me;

  -- Zero-delta freeze/resume boundary in the ledger (visible once back on).
  perform public.log_coin_event(
    v_me, case when p_on then 'economy_resume' else 'economy_pause' end,
    0, 0, v_coins, null, null, null,
    case when p_on then 'Economy resumed' else 'Economy paused' end
  );
end;
$$;
revoke execute on function public.set_economy_enabled(boolean) from public, anon;
grant  execute on function public.set_economy_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Data repair (2026-07-19): re-seat cards stranded out of the Co-op lane.
-- The first-cut v2 games_sync_co_op (deployed ~2.5h on 2026-07-18, before the
-- 453c537 lane-return fix) dropped a pacted card into Focus when it left the
-- Completionist/Rotation lane instead of returning it to the Co-op lane, and
-- nothing re-heals an already-stranded row (the fixed trigger only runs on the
-- next lane write). This mirrors the trigger's own SET predicate exactly, so a
-- healed row never matches again (idempotent) and any future strand from an
-- unforeseen path is swept on the next apply. Only co_op is written; the
-- games_sync_co_op trigger doesn't fire (co_op isn't in its column list) and
-- couldn't disagree if it did.
-- ---------------------------------------------------------------------------
update public.games g
   set co_op = true
 where g.status = 'playing'
   and not g.in_rotation
   and not g.completionist
   and not coalesce(g.resumed, false)
   and not g.co_op
   and g.slot_id is null
   and exists (
     select 1 from public.co_op_pacts cp
      where cp.status in ('pending', 'active')
        and g.id in (cp.inviter_game, cp.invitee_game)
   );
