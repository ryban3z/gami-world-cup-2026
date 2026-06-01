# World Cup 2026 Private Betting Pool — Design Spec

**Date:** 2026-05-28  
**Status:** In Progress (data model and remaining sections TBD)

---

## Overview

A private, password-protected web app for ~8 friends to run a World Cup 2026 betting pool. Players draft teams in a snake draft, make upfront bonus predictions, and accumulate points as the tournament progresses. A wildcard lets each player swap one bonus pick after the group stage.

---

## Core Features

### Access & Registration
- Site is gated behind a single shared password (set as an env var / stored in `game_config`), handed out privately to friends. No per-user invite codes.
- The password gate is a thin check in front of the registration/login pages — it just unlocks the ability to create an account, it is not the auth mechanism itself.
- Each user registers with: unique display name + email/password
- Supabase Auth handles authentication and sessions once past the gate

### Visibility Rules
Picks and predictions are hidden from other players while a submission phase is open, then revealed when that phase locks:
- **During `draft` / `registration`:** a player sees only their own draft picks and bonus predictions.
- **At `group_locked`:** all group-stage draft picks and bonus predictions become visible to everyone (group stage is now playing — nothing left to hide).
- **During `knockout_realloc`:** re-allocation nominations/swaps are hidden again (blind), so players can't react to each other's moves.
- **At `knockout_locked`:** knockout ownership becomes visible to everyone.

These are enforced with Supabase Row Level Security: a row is readable by its owner always, and by everyone once `game_config.current_phase` has advanced past the phase that produced it.

### Snake Draft
- Admin opens the draft after everyone has registered
- Each player picks 3 teams in snake order (async — players have a time window per turn)
- Draft is async: a player is notified (or checks the site) when it's their turn; if they don't pick within the window the turn auto-advances
- Each team can only be drafted by one player
- 48 teams in WC 2026

### Bonus Predictions (submitted upfront, before tournament starts)
- Each player submits 2 picks per bonus category before the tournament locks
- Bonus categories (TBD — to be confirmed, examples):
  - Top scorer (Golden Boot)
  - Best player (Golden Ball)
  - Best goalkeeper (Golden Glove)
  - Others TBD
- **Wildcard:** After the group stage ends, each player may swap one of their bonus picks (one-time use)

### Multi-Phase Picks
1. **Pre-tournament:** Snake draft + bonus predictions submitted, then locked at tournament kickoff (June 11, 2026)
2. **Group stage:** Teams play, scores accumulate
3. **Post-group stage (`knockout_realloc`):** Wildcard window opens; knockout team re-allocation opens (mechanic still being explored — see below)
4. **Knockout rounds (`knockout_locked`):** Ongoing scoring as teams advance

### Knockout Re-allocation
With 8 players × 3 teams, 24 of the 48 teams are drafted; once the group stage ends (16 of 48 teams eliminated), roughly a third of the drafted teams drop out, so ownership is re-shuffled for the knockouts. Both candidate mechanics are supported by the same `team_ownership` table (a second row per team with `phase = 'knockout'`).

- **Chosen — Option B (blind swap):** each player nominates one team they own to put up for swap; nominations are matched blind (neither side sees the other's pick until the window locks). Exact matching/pairing rules to be refined during play (`swap_nominations` table holds the state).
- **Fallback — Option A (fresh snake draft):** all surviving teams go back into a pool and are re-drafted in snake order. Kept as a pivot option if blind-swap matching proves clunky in practice; requires no schema change.

Group-stage scoring is unaffected either way — it is always attributed to whoever owned the team during `phase = 'group'`.

### Scoring
- Points-based (not winner-takes-all). All values below are a **draft starting point** — tunable via the scoring config tables before kickoff.
- Points are split by ownership phase so the blind swap stays fair: qualifying out of the group rewards the **group-stage owner**; the knockout run rewards the **knockout owner**.

**Group-stage reward → group-stage owner (per team):**
| Achievement | Points |
|---|---|
| Qualifies out of group (reaches Round of 32) | 5 |

**Knockout reward → knockout owner (per team, by furthest stage reached):**
| Furthest stage reached | Points |
|---|---|
| Eliminated in Round of 32 | 0 |
| Reached Round of 16 | 4 |
| Reached Quarter-final | 8 |
| Reached Semi-final | 14 |
| Reached Final (runner-up) | 22 |
| Champion (additive bonus on top of Final) | +12 → 34 total |

**Bonus predictions:** 2 picks per category, **8 points** per correct pick (a player can score on at most one pick per category). Resolved manually by the admin (`bonus_categories.resolved_answer`).

**Bonus categories (draft list):**
1. Golden Boot — Top Scorer
2. Golden Ball — Best Player
3. Golden Glove — Best Goalkeeper
4. Best Young Player
5. Tournament Winner (which team lifts the trophy)

### Automated Score Updates
- A **Vercel Cron Job** runs daily (more frequently on match days) calling a Next.js API route
- The API route fetches live results from **API-Football** (via RapidAPI — free tier)
- Score recalculation runs automatically after results are ingested
- Admin can manually override incorrect results via the admin panel

### Admin Panel (`/admin`, organiser-only)
- Monitor current game phase and draft state
- Manually override match results if API data is wrong
- Lock/unlock game phases (draft, bonus predictions, wildcard window, knockout picks)
- View all players' picks

---

## Architecture

**Stack:** Next.js 14 (App Router) + TypeScript, Supabase (Postgres + Auth), deployed on Vercel.

### Three Tiers

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js / React | All UI — leaderboard, draft, predictions, admin |
| Backend | Next.js Server Actions + API routes | Game logic: draft turns, score calc, phase transitions, cron endpoint |
| Database | Supabase Postgres | All persistent state |
| Auth | Supabase Auth | User registration, sessions (behind shared-password gate) |
| Cron | Vercel Cron Jobs | Daily results fetch → score recalculation |
| Results API | API-Football (RapidAPI) | World Cup 2026 match results |

### Key Flows

1. User enters shared site password → registers with display name → Supabase Auth account created
2. Admin opens draft → players pick teams in async snake order
3. Tournament starts (June 11, 2026) → draft locks, bonus predictions lock
4. Cron job fetches results daily → scores auto-recalculate
5. Group stage ends → wildcard window opens, knockout picks open
6. Leaderboard updates throughout the tournament

---

## Data Model

Supabase Postgres. Design principles:
- **`scores` and `team_standings` are derived data** — fully rebuildable from `team_ownership` + `matches` + `bonus_predictions`. Recalculation recomputes from scratch (idempotent), never increments.
- **`team_ownership` carries a `phase`** (`group` / `knockout`) so the same table handles both the group-stage draft and the knockout re-allocation, and group-stage scoring is never disturbed by re-shuffles.
- **The wildcard is modeled as a replacement** on `bonus_predictions` (audit trail via `superseded_by`), not a separate table.

```sql
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
  draft_pick_window_secs int not null default 86400,
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
```

---

## Open Questions / TBD

- [x] ~~Exact points breakdown per round~~ — draft values set (see Scoring); seeded into `scoring_rules` + `scoring_config`, tunable before kickoff
- [x] ~~Bonus prediction categories~~ — draft list of 5 set (see Scoring); seed into `bonus_categories`
- [x] ~~Knockout re-allocation mechanic~~ — **Option B (blind swap)** chosen; Option A (fresh snake draft) kept as fallback. Blind-swap pairing rules still to refine during play.
- [ ] Draft time window value for `draft_pick_window_secs` (default 24h)
- [ ] Notification mechanism for draft turns (email? just check the site?)
- [ ] Confirm API-Football free tier actually returns WC 2026 fixtures/results (validate before building the cron path)
- [x] ~~Data model finalisation~~ — drafted (see Data Model); revisit only after the knockout mechanic is chosen
- [x] ~~Access mechanism~~ — single shared site password, no invite codes
- [x] ~~Visibility rules~~ — hidden until each submission phase locks (see Visibility Rules)
- [ ] UI design / mockups (planned for next session)
