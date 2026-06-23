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
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- User slots: a user may read their own grants; only admins may grant/revoke.
drop policy if exists "user_slots_select" on public.user_slots;
create policy "user_slots_select" on public.user_slots
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "user_slots_admin_write" on public.user_slots;
create policy "user_slots_admin_write" on public.user_slots
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

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
                  check (status in ('submitted', 'planned', 'in_progress', 'awaiting_feedback', 'done', 'declined')),
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

-- Migration for boards created before the 'awaiting_feedback' status existed
-- (dev complete, waiting on the requester to sign off). Safe to re-run.
alter table public.feature_requests drop constraint if exists feature_requests_status_check;
alter table public.feature_requests add constraint feature_requests_status_check
  check (status in ('submitted', 'planned', 'in_progress', 'awaiting_feedback', 'done', 'declined'));

-- Tags (free-form labels like 'mobile', 'quality of life') and a triage priority.
-- Tags are a plain text[]; the app normalizes them to lowercase. Priority defaults
-- to 'medium' and can be raised/lowered on create or edit.
alter table public.feature_requests add column if not exists tags text[] not null default '{}'::text[];
alter table public.feature_requests add column if not exists priority text not null default 'medium';
alter table public.feature_requests drop constraint if exists feature_requests_priority_check;
alter table public.feature_requests add constraint feature_requests_priority_check
  check (priority in ('low', 'medium', 'high'));

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

alter table public.game_submissions enable row level security;
-- A user may read their own submissions; admins may read all (the admin queue
-- also goes through the security-definer RPC below).
drop policy if exists "game_submissions_select" on public.game_submissions;
create policy "game_submissions_select" on public.game_submissions
  for select to authenticated using (
    auth.uid() = submitter
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
-- A user may file their own submission (kind/fields validated by the form +
-- approve RPC). Status moves only via the RPCs, which run as security-definer.
drop policy if exists "game_submissions_insert_own" on public.game_submissions;
create policy "game_submissions_insert_own" on public.game_submissions
  for insert to authenticated with check (auth.uid() = submitter);

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
  v_t boolean; v_i boolean; v_p boolean; v_g boolean; v_r boolean; v_h boolean;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
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
  v_g := not v_partial or 'genres'    = any(p_fields);
  v_r := not v_partial or 'released'  = any(p_fields);
  v_h := not v_partial or 'hours'     = any(p_fields);
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
    insert into public.catalog_games (created_by) values (s.submitter)
    returning id into v_catalog;
  end if;

  -- Write the accepted fields onto the master record (others keep their value).
  update public.catalog_games set
    title     = case when v_t then s.title     else title     end,
    image     = case when v_i then s.image     else image     end,
    platforms = case when v_p then s.platforms else platforms end,
    genres    = case when v_g then s.genres    else genres    end,
    released  = case when v_r then s.released   else released  end,
    hours     = case when v_h then s.hours     else hours     end,
    updated_at = now()
  where id = v_catalog;

  -- Cascade the accepted fields to every existing copy (match by rawg_id or the
  -- catalog link). Personal data is never touched — played hours, copies, status,
  -- coins, and progress notes are left as-is. A user's custom cover survives: only
  -- stock_image is reset to the new art (so "restore default" lands on it), and
  -- image is updated only when they hadn't customized it.
  update public.games g set
    catalog_id  = c.id,
    title       = case when v_t then c.title     else g.title     end,
    platforms   = case when v_p then c.platforms else g.platforms end,
    genres      = case when v_g then c.genres    else g.genres    end,
    released    = case when v_r then c.released   else g.released  end,
    hours       = case when v_h then c.hours     else g.hours     end,
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
  update public.profiles set coins = coins + v_reward where id = s.submitter
    returning coins into v_new_coins;

  -- Log the contribution reward to the submitter's ledger (only when it pays).
  if v_reward > 0 then
    perform public.log_coin_event(
      s.submitter, 'submission_reward', v_reward, 0, v_new_coins, null,
      null, null, null
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
      array['title', 'image', 'platforms', 'genres', 'released', 'hours']
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
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
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
  released        date,
  hours           real,
  before          jsonb,
  current         jsonb,
  status          text,
  reviewer        uuid,
  reviewer_name   text,
  reviewed_at     timestamptz,
  review_note     text,
  reward          integer,
  approved_fields text[],
  created_at      timestamptz
)
language sql
security definer set search_path = public
as $$
  select
    s.id, s.submitter, p.display_name, s.kind, s.catalog_id, s.rawg_id,
    s.title, s.image, s.platforms, s.genres, s.released, s.hours, s.before,
    (
      select to_jsonb(c) from public.catalog_games c
      where c.id = s.catalog_id
         or (s.rawg_id is not null and c.rawg_id = s.rawg_id)
      limit 1
    ) as current,
    s.status, s.reviewer, rp.display_name, s.reviewed_at, s.review_note,
    s.reward, s.approved_fields,
    s.created_at
  from public.game_submissions s
  join public.profiles p on p.id = s.submitter
  left join public.profiles rp on rp.id = s.reviewer
  -- Hidden accounts (test/bot) are kept out of the queue entirely, like they are
  -- on the leaderboard. Un-hide the account to bring their submissions back.
  where not p.hidden
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
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
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin);
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
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "feature_requests_delete" on public.feature_requests;
create policy "feature_requests_delete" on public.feature_requests
  for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
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
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "feature_comments_delete" on public.feature_comments;
create policy "feature_comments_delete" on public.feature_comments
  for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
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
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
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
  v_coins integer;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
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
drop function if exists public.log_coin_event(uuid, text, integer, integer, integer, integer, uuid, text, text);
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
  p_detail        jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.coin_events (
    user_id, kind, coin_delta, charter_delta,
    coin_balance_after, charter_balance_after,
    game_id, game_title, label, detail
  ) values (
    p_user, p_kind, coalesce(p_coin_delta, 0), coalesce(p_charter_delta, 0),
    p_coin_after, p_charter_after,
    p_game, p_game_title, p_label, coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;

-- Lifetime gain/loss summary for the caller's own ledger: positive and negative
-- coin (and charter) movements summed separately, so the UI can show total
-- earned vs. spent at a glance. Security definer + an explicit auth.uid() filter,
-- so it only ever totals the caller's own rows.
create or replace function public.ledger_totals()
returns table (coins_in bigint, coins_out bigint, charters_in bigint, charters_out bigint)
language sql
security definer set search_path = public
as $$
  select
    coalesce( sum(coin_delta)    filter (where coin_delta    > 0), 0),
    coalesce(-sum(coin_delta)    filter (where coin_delta    < 0), 0),
    coalesce( sum(charter_delta) filter (where charter_delta > 0), 0),
    coalesce(-sum(charter_delta) filter (where charter_delta < 0), 0)
  from public.coin_events
  where user_id = auth.uid();
$$;

revoke execute on function public.ledger_totals() from public, anon;

-- ---------------------------------------------------------------------------
-- Buy a game: deduct coins + flip status, atomically.
-- Price/reward are computed in the app (single source of truth in pricing.ts)
-- and passed in. Returns the new coin balance.
-- ---------------------------------------------------------------------------

-- Returns the new coin balance plus the slot the game was placed in (null = a
-- general slot). Dropped first because the return type changed from integer.
drop function if exists public.apply_purchase(uuid, integer);
create or replace function public.apply_purchase(p_game uuid, p_price integer)
returns table (coins integer, slot_id uuid)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_new_coins integer;
  v_general   integer;
  v_gen_used  integer;
  v_hours     real;
  v_family    uuid;
  v_slot      uuid;
  v_shared    boolean := false;
  v_title     text;
begin
  -- The game must be in the backlog; grab its length + family for slot matching.
  select hours, family_id, title into v_hours, v_family, v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'backlog';
  if not found then
    raise exception 'Game not available to buy';
  end if;

  -- A linked edition shares its family's slot: if a sibling edition is already
  -- playing, reuse its slot and skip the capacity check entirely.
  if v_family is not null then
    select g.slot_id into v_slot
      from public.games g
     where g.user_id = auth.uid() and g.family_id = v_family
       and g.status = 'playing' and g.id <> p_game
     limit 1;
    if found then v_shared := true; end if;
  end if;

  if not v_shared then
    -- Prefer an open *matching targeted* slot (reserves general slots for games
    -- that don't fit a specialized slot). A slot is open if no playing game holds
    -- it. Unknown-length games only fit an unbounded slot.
    select us.id into v_slot
      from public.user_slots us
      join public.slot_definitions d on d.id = us.definition_id
     where us.user_id = auth.uid()
       and d.active
       and (d.min_hours is null or (v_hours is not null and v_hours >= d.min_hours))
       and (d.max_hours is null or (v_hours is not null and v_hours <= d.max_hours))
       and not exists (
         select 1 from public.games g
          where g.slot_id = us.id and g.status = 'playing'
       )
     order by d.created_at
     limit 1;

    -- No targeted slot: fall back to a general slot if one is free. A family
    -- counts once however many of its editions occupy a general slot.
    if v_slot is null then
      select general_slots into v_general from public.profiles where id = auth.uid();
      select count(distinct coalesce(family_id, id)) into v_gen_used
        from public.games
       where user_id = auth.uid() and status = 'playing' and slot_id is null;
      if v_gen_used >= coalesce(v_general, 2) then
        raise exception 'No open Now Playing slot';
      end if;
    end if;
  end if;

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
  v_replay  boolean;
  v_award   integer;
  v_coins   integer;
  v_title   text;
begin
  select family_id, title into v_family, v_title
    from public.games
   where id = p_game and user_id = auth.uid() and status = 'playing';
  if not found then
    raise exception 'Game not available to finish';
  end if;

  -- Replay if another edition in the same family is already finished.
  v_replay := v_family is not null and exists (
    select 1 from public.games g
     where g.user_id = auth.uid() and g.family_id = v_family
       and g.id <> p_game and g.status = 'finished'
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

-- Log play time on a game you're currently playing: add the hours, atomically.
-- Logging time no longer pays coins (the whole payout is the finish bounty in
-- apply_finish); we still record the hours for stats and return the unchanged
-- balance + total played so the client can update in place. The `coins` OUT
-- column is kept for backward compatibility with the client RPC shape.
-- p_platform added (defaulted) so a session can be attributed to the platform you
-- played on; the old 2-arg version is dropped so the signature change is clean.
drop function if exists public.log_playtime(uuid, real);
create or replace function public.log_playtime(p_game uuid, p_hours real, p_platform text default null)
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

  -- Hand the chosen platform to the playtime trigger via a transaction-local GUC,
  -- so the event records where the session was played (multi-platform games).
  if p_platform is not null and btrim(p_platform) <> '' then
    perform set_config('app.play_platform', p_platform, true);
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
  v_hours    real;
  v_family   uuid;
  v_unit     uuid;   -- this game's occupant key: its family, or itself
  v_general  integer;
  v_gen_used integer;
  v_fits     boolean;
begin
  select hours, family_id into v_hours, v_family
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
    -- Moving into a targeted slot: must own it, it must be active, the game must
    -- fit its hour range, and it must not already hold a different unit's game.
    select (d.active
            and (d.min_hours is null or (v_hours is not null and v_hours >= d.min_hours))
            and (d.max_hours is null or (v_hours is not null and v_hours <= d.max_hours)))
      into v_fits
      from public.user_slots us
      join public.slot_definitions d on d.id = us.definition_id
     where us.id = p_slot and us.user_id = auth.uid();
    if v_fits is null then
      raise exception 'Slot not found';
    end if;
    if not v_fits then
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
-- (public) anon key call these. Lock them to signed-in users only.
revoke execute on function public.apply_purchase(uuid, integer)         from public;
revoke execute on function public.apply_finish(uuid, integer, integer)  from public;
revoke execute on function public.leaderboard()                         from public;

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
create or replace function public.admin_list_users()
returns table (
  id             uuid,
  email          text,
  display_name   text,
  avatar_url     text,
  coins          integer,
  general_slots  integer,
  is_admin       boolean,
  blocked        boolean,
  blocked_reason text,
  hidden         boolean,
  created_at     timestamptz,
  games_count    bigint,
  last_seen_at   timestamptz,
  activity       text,
  badges         jsonb
)
language sql
security definer set search_path = public
as $$
  select
    p.id, u.email, p.display_name, p.avatar_url, p.coins, p.general_slots,
    p.is_admin, p.blocked, p.blocked_reason, p.hidden, p.created_at,
    (select count(*) from public.games g where g.user_id = p.id) as games_count,
    -- Honour appear-offline here too, for consistency with the leaderboard.
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.last_seen_at end                          as last_seen_at,
    case when coalesce((p.privacy->>'appear_offline')::boolean, false)
         then null else p.activity end                              as activity,
    public.user_badges_json(p.id)                                   as badges
  from public.profiles p
  left join auth.users u on u.id = p.id
  where exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
  order by p.created_at asc;
$$;

-- Edit a user's admin-managed fields in one call. Re-checks the caller is an
-- admin and guards against an admin demoting or blocking themselves (so the last
-- admin can't accidentally lock the door from the inside).
-- Dropped first because adding p_hidden changes the signature (otherwise the old
-- 7-arg overload would linger alongside the new one).
drop function if exists public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text);
create or replace function public.admin_update_user(
  p_user           uuid,
  p_display_name   text,
  p_coins          integer,
  p_general_slots  integer,
  p_is_admin       boolean,
  p_blocked        boolean,
  p_blocked_reason text,
  p_hidden         boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_old integer;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
    raise exception 'Not authorized';
  end if;
  if p_coins < 0 then
    raise exception 'Coins must be 0 or more';
  end if;
  if p_general_slots < 0 or p_general_slots > 99 then
    raise exception 'Slots must be between 0 and 99';
  end if;
  if p_user = auth.uid() and (not p_is_admin or p_blocked) then
    raise exception 'You cannot remove your own admin or block yourself';
  end if;

  select coins into v_old from public.profiles where id = p_user;

  update public.profiles
     set display_name   = coalesce(nullif(btrim(p_display_name), ''), display_name),
         coins          = p_coins,
         general_slots  = p_general_slots,
         is_admin       = p_is_admin,
         blocked        = p_blocked,
         blocked_reason = nullif(btrim(p_blocked_reason), ''),
         hidden         = p_hidden
   where id = p_user;

  if not found then
    raise exception 'User not found';
  end if;

  -- Record an admin coin grant/deduction on the target user's ledger.
  if p_coins is distinct from v_old then
    perform public.log_coin_event(
      p_user, 'admin_adjust', p_coins - coalesce(v_old, 0), 0,
      p_coins, null, null, null, 'Admin balance change'
    );
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
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
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
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
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
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
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
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
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
  select * from public.games where user_id = p_user order by added_at desc;
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
  priority      text
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
    r.priority
  from public.feature_requests r
  left join public.profiles p     on p.id = r.user_id
  left join public.feature_votes v on v.request_id = r.id
  group by r.id, p.display_name
  order by count(v.user_id) desc, r.created_at desc;
$$;

-- Edit a request's title/description/kind/tags/priority. Security definer so the
-- owner can edit their own row even though the table's UPDATE policy is admin-only
-- (status moves stay admin-only); admins may edit any. Deliberately never touches
-- status. Dropped first because adding params changes the signature.
drop function if exists public.edit_feature_request(uuid, text, text);
drop function if exists public.edit_feature_request(uuid, text, text, text);
create or replace function public.edit_feature_request(
  p_id uuid, p_title text, p_description text, p_kind text,
  p_tags text[], p_priority text
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
  update public.feature_requests
     set title = p_title,
         description = nullif(btrim(p_description), ''),
         kind = p_kind,
         tags = coalesce(p_tags, '{}'::text[]),
         priority = p_priority,
         updated_at = now(),
         edited_at = now()
   where id = p_id
     and (user_id = auth.uid()
          or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
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

  v_new_status := case when p_approve then 'done' else 'in_progress' end;
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
begin
  if new.played_hours is distinct from old.played_hours then
    -- Attribute the session to a platform: the one log_playtime passed (via a
    -- transaction-local GUC), else auto-detected when the game is owned on exactly
    -- one platform. Null when ambiguous (multi-platform, no choice given).
    v_platform := nullif(current_setting('app.play_platform', true), '');
    if v_platform is null
       and jsonb_typeof(new.copies) = 'array'
       and jsonb_array_length(new.copies) = 1 then
      v_platform := new.copies -> 0 ->> 'platform';
    end if;
    insert into public.playtime_events
      (user_id, game_id, game_title, hours, played_after, platform, genres, developers, game_hours)
    values (new.user_id, new.id, new.title, new.played_hours - old.played_hours, new.played_hours,
            v_platform, new.genres, new.developers, new.hours);
  end if;
  return new;
end;
$$;

drop trigger if exists games_log_playtime on public.games;
create trigger games_log_playtime
  after update of played_hours on public.games
  for each row execute function public.log_playtime_event();

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
    insert into public.game_status_events
      (user_id, game_id, game_title, from_status, to_status, genres, developers, platforms, game_hours)
    values (old.user_id, null, old.title, old.status, 'deleted',
            old.genres, old.developers, old.platforms, old.hours);
    return old;
  end if;
end;
$$;

drop trigger if exists games_log_status on public.games;
create trigger games_log_status
  after insert or update or delete on public.games
  for each row execute function public.log_game_status_event();

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

-- DML on the views for signed-in users; the base-table RLS (via security_invoker)
-- still governs which rows. issue_events stays read-only like its base table
-- (writes there come only from the triggers above).
grant select, insert, update, delete on public.issues            to authenticated;
grant select, insert, update, delete on public.issue_votes       to authenticated;
grant select, insert, update, delete on public.issue_comments    to authenticated;
grant select, insert, update, delete on public.issue_attachments to authenticated;
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
    'price_formula', 'bounty_formula'
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
                  'reaction', 'comment_edited', 'comment_deleted'));

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
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin) then
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
revoke execute on function public.apply_purchase(uuid, integer)         from public, anon;
revoke execute on function public.apply_finish(uuid, integer, integer)  from public, anon;
revoke execute on function public.apply_shelve(uuid)            from public, anon;
revoke execute on function public.move_game_to_slot(uuid, uuid) from public, anon;
revoke execute on function public.link_games(uuid, uuid)        from public, anon;
revoke execute on function public.unlink_game(uuid)             from public, anon;
revoke execute on function public.log_playtime(uuid, real, text) from public, anon;
revoke execute on function public.leaderboard()                 from public, anon;
revoke execute on function public.player_library(uuid)          from public, anon;
revoke execute on function public.view_profile(uuid)            from public, anon;
revoke execute on function public.admin_set_coins(integer)      from public, anon;
revoke execute on function public.admin_list_users()            from public, anon;
revoke execute on function public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean) from public, anon;
revoke execute on function public.admin_delete_user(uuid)       from public, anon;
revoke execute on function public.admin_user_stats(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.list_feature_requests()       from public, anon;
revoke execute on function public.edit_feature_request(uuid, text, text, text, text[], text) from public, anon;
revoke execute on function public.respond_feature_request(uuid, boolean) from public, anon;
revoke execute on function public.list_request_comments(uuid)   from public, anon;
revoke execute on function public.admin_grant_badge(uuid, uuid)  from public, anon;
revoke execute on function public.admin_revoke_badge(uuid, uuid) from public, anon;
revoke execute on function public.set_selected_title(uuid)       from public, anon;
revoke execute on function public.approve_game_submission(uuid, text, text[]) from public, anon;
revoke execute on function public.reject_game_submission(uuid, text)  from public, anon;
revoke execute on function public.list_game_submissions()       from public, anon;
revoke execute on function public.pending_submission_count()    from public, anon;
revoke execute on function public.ledger_totals()               from public, anon;
revoke execute on function public.buy_charter()                 from public, anon;
revoke execute on function public.sell_charter()                from public, anon;
revoke execute on function public.import_with_charter(uuid)     from public, anon;

grant execute on function public.apply_purchase(uuid, integer)         to authenticated;
grant execute on function public.apply_finish(uuid, integer, integer)  to authenticated;
grant execute on function public.apply_shelve(uuid)            to authenticated;
grant execute on function public.move_game_to_slot(uuid, uuid) to authenticated;
grant execute on function public.link_games(uuid, uuid)        to authenticated;
grant execute on function public.unlink_game(uuid)             to authenticated;
grant execute on function public.log_playtime(uuid, real, text) to authenticated;
grant execute on function public.leaderboard()                 to authenticated;
grant execute on function public.player_library(uuid)          to authenticated;
grant execute on function public.view_profile(uuid)            to authenticated;
grant execute on function public.admin_set_coins(integer)      to authenticated;
grant execute on function public.admin_list_users()            to authenticated;
grant execute on function public.admin_update_user(uuid, text, integer, integer, boolean, boolean, text, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid)       to authenticated;
grant execute on function public.admin_user_stats(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.list_feature_requests()       to authenticated;
grant execute on function public.edit_feature_request(uuid, text, text, text, text[], text) to authenticated;
grant execute on function public.respond_feature_request(uuid, boolean) to authenticated;
grant execute on function public.list_request_comments(uuid)   to authenticated;
grant execute on function public.admin_grant_badge(uuid, uuid)  to authenticated;
grant execute on function public.admin_revoke_badge(uuid, uuid) to authenticated;
grant execute on function public.set_selected_title(uuid)       to authenticated;
grant execute on function public.approve_game_submission(uuid, text, text[]) to authenticated;
grant execute on function public.reject_game_submission(uuid, text)  to authenticated;
grant execute on function public.list_game_submissions()       to authenticated;
grant execute on function public.pending_submission_count()    to authenticated;
grant execute on function public.ledger_totals()               to authenticated;
grant execute on function public.buy_charter()                 to authenticated;
grant execute on function public.sell_charter()                to authenticated;
grant execute on function public.import_with_charter(uuid)     to authenticated;
