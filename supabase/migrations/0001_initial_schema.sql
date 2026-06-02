-- ============================================================
-- Initial schema for the World Cup 2026 pool.
-- Canonical source: docs/superpowers/specs/2026-05-28-world-cup-pool-design.md
-- ============================================================

-- ============ ENUMS ============
create type game_phase as enum (
  'registration',     -- accounts being created, draft not open
  'draft',            -- group-stage snake draft in progress
  'group_locked',     -- draft + bonus predictions locked; group stage playing
  'knockout_realloc', -- re-allocation window (re-draft or blind swap) + wildcard
  'knockout_locked',  -- knockout ownership locked; knockouts playing
  'complete'
);
create type match_stage   as enum ('group','r32','r16','qf','sf','third_place','final');
create type match_status  as enum ('scheduled','live','final');
create type owner_phase    as enum ('group','knockout');
create type acquired_via  as enum ('draft','swap');

-- ============ PROFILES (extends Supabase auth.users) ============
create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null unique,
  is_admin         boolean not null default false,
  wildcard_used_at timestamptz,                 -- one-time bonus swap, post group stage
  created_at       timestamptz not null default now()
);

-- ============ TEAMS ============
create table teams (
  id           uuid primary key default gen_random_uuid(),
  external_id  text unique,                     -- API-Football team id (ingestion mapping)
  name         text not null,
  fifa_code    text,                            -- e.g. 'ARG'
  group_letter text,                            -- 'A'..'L' (12 groups in WC 2026)
  flag_url     text
);

-- ============ GAME CONFIG (single row) ============
create table game_config (
  id                     int primary key default 1 check (id = 1),
  current_phase          game_phase not null default 'registration',
  site_password_hash     text,                  -- shared access gate
  draft_order            uuid[] not null default '{}',   -- profile ids, snake base order
  draft_current_user_id  uuid references profiles(id),
  draft_turn_started_at  timestamptz,           -- for lazy auto-advance on read
  draft_pick_window_secs int not null default 172800,  -- 48h (group spans time zones; tunable)
  teams_per_player       int not null default 3,
  tournament_kickoff_at  timestamptz default '2026-06-11T00:00:00Z',
  updated_at             timestamptz not null default now()
);

-- ============ TEAM OWNERSHIP (group draft + knockout re-allocation) ============
create table team_ownership (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id),
  team_id       uuid not null references teams(id),
  phase         owner_phase not null,
  pick_order    int,                             -- overall draft pick # (null for swaps)
  snake_round   int,
  acquired_via  acquired_via not null default 'draft',
  created_at    timestamptz not null default now(),
  unique (team_id, phase)                        -- one owner per team per phase
);

-- ============ KNOCKOUT SWAP NOMINATIONS (Option B — experimental) ============
create table swap_nominations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id),
  team_id      uuid not null references teams(id),  -- team offered up
  status       text not null default 'pending',     -- pending | matched | withdrawn
  matched_with uuid references swap_nominations(id),
  created_at   timestamptz not null default now()
);

-- ============ BONUS CATEGORIES ============
create table bonus_categories (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,          -- 'golden_boot'
  name            text not null,                 -- 'Top Scorer (Golden Boot)'
  is_active       boolean not null default true,
  resolved_answer text                           -- set by admin when category resolves
);

-- ============ BONUS PREDICTIONS (wildcard = replacement, with audit) ============
create table bonus_predictions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id),
  category_id   uuid not null references bonus_categories(id),
  pick_slot     int not null check (pick_slot in (1,2)),
  pick_value    text not null,                   -- player/team name
  is_active     boolean not null default true,
  superseded_by uuid references bonus_predictions(id),  -- wildcard audit trail
  created_at    timestamptz not null default now()
);
create unique index uq_active_bonus_pick
  on bonus_predictions (user_id, category_id, pick_slot) where is_active;

-- ============ MATCHES / FIXTURES ============
create table matches (
  id                 uuid primary key default gen_random_uuid(),
  external_id        text unique,                -- API-Football fixture id
  stage              match_stage not null,
  group_letter       text,
  home_team_id       uuid references teams(id),
  away_team_id       uuid references teams(id),
  kickoff_at         timestamptz,                -- drives match-day cron frequency
  home_score         int,
  away_score         int,
  winner_team_id     uuid references teams(id),
  status             match_status not null default 'scheduled',
  is_manual_override boolean not null default false,  -- admin corrected API data
  updated_at         timestamptz not null default now()
);

-- ============ TEAM STANDINGS (DERIVED from matches by recalc job) ============
create table team_standings (
  team_id        uuid primary key references teams(id),
  furthest_stage match_stage not null default 'group',
  is_eliminated  boolean not null default false,
  is_champion    boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- ============ SCORING CONFIG (all values tunable before kickoff) ============
-- Knockout ladder: points credited to the phase='knockout' owner by furthest stage reached.
create table scoring_rules (
  stage  match_stage primary key,
  points int not null
);
insert into scoring_rules (stage, points) values
  ('r32', 0),   -- eliminated in R32
  ('r16', 4),
  ('qf',  8),
  ('sf', 14),
  ('final', 22);
-- (third_place playoff carries no separate points in the draft scheme)

create table scoring_config (
  id                int primary key default 1 check (id = 1),
  group_qualify_pts int not null default 5,   -- team reaches R32 → phase='group' owner
  bonus_correct_pts int not null default 8,   -- each correct bonus pick
  champion_pts      int not null default 12   -- additive bonus on top of 'final' → knockout owner
);
insert into scoring_config (id) values (1);

-- ============ SCORES (DERIVED, rebuildable, idempotent recalc) ============
create table scores (
  user_id      uuid primary key references profiles(id),
  breakdown    jsonb not null default '{}',   -- {group:n, knockout:n, bonus:n, by_team:[...]}
  total_points int not null default 0,
  updated_at   timestamptz not null default now()
);

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
-- display_name is passed at signUp via options.data.display_name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
