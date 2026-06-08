# World Cup 2026 Private Betting Pool — Design Spec

**Date:** 2026-05-28  
**Status:** In Progress (data model and remaining sections TBD)

---

## Overview

A private, password-protected web app for ~8 friends to run a World Cup 2026 betting pool. Players draft teams in a snake draft, make upfront bonus predictions, and accumulate points as the tournament progresses. A wildcard lets each player swap one bonus pick after the group stage.

---

## Core Features

### Access & Registration
- Site is gated behind a single shared password (env `SITE_PASSWORD`), handed out privately to friends. No per-user invite codes. Passing the gate sets a signed httpOnly cookie (`GATE_TOKEN`); middleware enforces it on all routes except the public landing page (`/`) and `/gate`.
- The password gate is a thin check in front of the registration/login pages — it just unlocks the ability to create an account, it is not the auth mechanism itself.
- **Identity = display name + password, no email** (decided 2026-06-02). Friends register/log in with a unique display name + a personal password. A deterministic synthetic email (`<slug>@gami-pool.com`, derived from the name in `lib/identity.ts`) is fed to Supabase Auth so it can key on email and login can reconstruct the address; this synthetic address never receives mail. Forgotten passwords are reset by the admin (no email-based reset). The shared gate keeps strangers out; the per-user account is what attributes draft picks / predictions / scores to each player.
- Supabase Auth handles authentication and sessions once past the gate. "Confirm email" is disabled (no SMTP needed).

### Visibility Rules
Picks and predictions are hidden from other players while a submission phase is open, then revealed when that phase locks:
- **During `draft` / `registration`:** a player sees only their own draft picks and bonus predictions.
- **At `group_locked`:** all group-stage draft picks become visible to everyone (the draft is done — nothing left to hide there). Bonus predictions stay hidden — they lock separately at kickoff (see below), which can be later than draft completion.
- **At the kickoff lock (`predictions_locked_at` set):** everyone's bonus predictions become visible.
- **During `knockout_realloc`:** re-allocation nominations/swaps are hidden again (blind), so players can't react to each other's moves.
- **At `knockout_locked`:** knockout ownership becomes visible to everyone.

These are enforced with Supabase Row Level Security: a row is readable by its owner always, and by everyone once the gate that produced it has locked — usually `game_config.current_phase` advancing past the producing phase, but bonus predictions reveal on the dedicated `predictions_locked_at` timestamp (decoupled because the prediction window spans the draft and locks at kickoff, independent of the draft phase).

### Snake Draft
- Admin opens the draft after everyone has registered
- Each player picks 3 teams in snake order (async — players have a time window per turn)
- Draft is async: a player checks the site when it's their turn (no notifications in v1)
- Each team can only be drafted by one player
- 48 teams in WC 2026

#### Implementation design (Plan 2 — decided 2026-06-03)

The draft engine lives in **Postgres `security definer` functions** called via RPC from Next.js server actions, so every rule (one owner per team, exactly 3 per player, turn order, the reveal) holds atomically and can't be raced or bypassed from the client:

- **`start_draft()`** — *admin only.* Snapshots the registered players (`profiles`), randomises them into `game_config.draft_order`, sets `current_phase = 'draft'`, points `draft_current_user_id` at the first picker, sets `draft_turn_started_at = now()`, and closes registration (`registration_open = false`).
- **`make_pick(team_id)`** — *current-turn player only* (`auth.uid() = draft_current_user_id`). Validates the team is still available (no `team_ownership` row for it at `phase='group'`), inserts the pick (`team_ownership`, `phase='group'`, with `pick_order`/`snake_round`), then advances `draft_current_user_id` to the next player in **snake order** (round 1: `draft_order` forward; round 2: reverse; round 3: forward). When the final pick lands (players × `teams_per_player`), it sets `current_phase = 'group_locked'` — the **auto-reveal**.
- **`admin_autopick()`** — *admin only.* Assigns a **random available** team to whoever's turn it currently is (same advance/reveal logic). Used to unstick a stalled turn **after the admin has nudged** the player — there is **no automatic timeout expiry**; `draft_pick_window_secs` (48h) is only an advisory the admin uses to decide when to nudge/auto-pick.
- **`draft_state()`** — *authenticated read.* Returns phase, whose turn it is (id + display name), pick progress (e.g. 7 of 24), and the **board**: all 48 teams with a `taken` boolean but **no owner revealed** while `current_phase = 'draft'`; plus the caller's own picks (always visible to them). Once `current_phase = 'group_locked'`, it returns **full rosters** (everyone's picks). `team_ownership` itself stays unreadable directly during the draft — this RPC is the only window, so blind-during / reveal-after is enforced in the database, not just the UI.

**Visibility rule:** during the draft you see only your own picks plus which teams are **taken** (board shows them greyed/disabled, owner hidden); at `group_locked` all rosters are revealed to everyone.

**UI — `/draft`** (gated, mobile-first, gold theme): status line ("It's YOUR turn — pick a team" / "Waiting on {name}…" + progress); a board of the 48 teams grouped A–L with flags (taken = greyed "taken", available = tappable only on your turn → confirm → `make_pick`); your roster; and **admin-only controls on the same page** — "Start draft" (during registration) and "Auto-pick for current player" (during the draft). After `group_locked`, the board shows everyone's rosters.

**Testing:** TDD a pure TS snake-order helper (`whose-turn-at-pick-N`); verify the SQL functions by simulating a full draft and asserting every player ends with 3 teams and the auto-reveal fires.

### Bonus Predictions (submitted upfront, before tournament starts)
- Each player submits their picks before the tournament locks: up to **2 picks** for most categories (the two must differ; partial entries allowed — blanks just score nothing), but **1 pick** for the three single-answer team-pick categories (Tournament Winner, Runner-Up, Wooden Spoon — see migration `0015`)
- Bonus categories (the 5 seeded in `bonus_categories`):
  - Golden Boot — Top Scorer
  - Golden Ball — Best Player
  - Golden Glove — Best Goalkeeper
  - Best Young Player
  - Tournament Winner
- **Wildcard:** After the group stage ends, each player may swap one of their bonus picks (one-time use)

#### Implementation design (Plan 3 — decided 2026-06-03)

Scope is **submission + kickoff lock only** — scoring resolution (admin marking correct answers, awarding `bonus_correct_pts`) and the post-group wildcard are later plans. Blind-during / reveal-after is enforced in the database, mirroring the snake draft.

- **Window state on `game_config`:** `predictions_open boolean default false` (submission window) and `predictions_locked_at timestamptz` (set on lock; also the reveal trigger).
- **Opens with the draft:** `start_draft()` also sets `predictions_open = true`, so opening the draft opens the prediction window (players fill them in while the draft runs). *(Adds one line to the existing function via a new migration that `create or replace`s it.)*
- **`lock_predictions()`** — *admin only.* Sets `predictions_open = false` and `predictions_locked_at = now()` — the kickoff lock + reveal.
- **`submit_bonus_pick(category_id, slot, value)`** — *authenticated `security definer`.* Requires `predictions_open = true`; validates `slot in (1,2)` and an active category; upserts the caller's active `bonus_predictions` row (keyed by the existing `uq_active_bonus_pick` unique index). Direct client writes stay denied (deny-by-default), so the open-window rule can't be bypassed.
- **Visibility (RLS on `bonus_predictions`):** a `select` policy allowing rows where `user_id = auth.uid()` **OR** `game_config.predictions_locked_at is not null` — own picks always; everyone's once locked. `bonus_categories` is already readable; the page reads picks directly under RLS (no read RPC needed — unlike the draft, nothing is hidden beyond ownership).

**Input format:** **team-pick** categories use a **team dropdown** (from the 48 seeded `teams`); the rest are **free text** (no player roster is seeded — the admin judges matches at scoring time). The team-pick set is keyed in `PredictionForm` by `TEAM_PICK_KEYS` (`tournament_winner`, `runner_up`, `wooden_spoon`); see the bonus-categories list below for the current split.

**UI — `/predictions`** (gated, mobile-first, gold theme): one card per category with its 2 inputs and a single **Save** action; a status line ("Predictions open — locked at kickoff" / "Locked — everyone's picks below"); **admin-only "Lock predictions (kickoff)"** button on the same page. After lock, a read-only reveal of all players' picks grouped by category. The home page links to `/predictions` once the window is open; `/predictions` is gated behind auth in middleware (like `/draft`).

**Testing:** TDD a small pure TS validation helper (non-empty + two-distinct-picks); a SQL simulation asserting writes are blocked when the window is closed and that reveal flips on `lock_predictions()`.

### Multi-Phase Picks
1. **Pre-tournament:** Snake draft + bonus predictions submitted, then locked at tournament kickoff (June 11, 2026)
2. **Group stage:** Teams play, scores accumulate
3. **Post-group stage (`knockout_realloc`):** Wildcard window opens (swap one bonus pick); knockout team re-allocation opens — each manager may make one optional free-agent team swap (see below)
4. **Knockout rounds (`knockout_locked`):** Ongoing scoring as teams advance

### Knockout Re-allocation
With 8 players × 3 teams, 24 of the 48 teams are drafted; once the group stage ends (16 of 48 teams eliminated), roughly a third of the drafted teams drop out, so ownership can be refreshed for the knockouts. Modeled with the same `team_ownership` table (a second row per team at `phase = 'knockout'`).

**Chosen — free-agent pickup (decided 2026-06-03):** each manager may make **one optional team swap** — drop one team they own and claim **one unowned team that advanced to the Round of 32**. No trading between managers (a manager who's happy keeps all three teams into the knockouts; doing nothing is valid).

- **Allocation order under contention — TBD:** when two+ managers want the same free agent, the tie-break is deliberately left open. Leading candidates: reverse-standings priority (worst-placed manager picks first, NBA-lottery style) or a one-off mini-game. To be settled during play.
- **Scoring follows the ownership-phase split (unchanged):** the picked-up team earns its **knockout-ladder points** for the new `phase = 'knockout'` owner; the **+5 group-qualify reward stays with the group-phase owner** (or no one, if the team was undrafted). Group-stage scoring is never disturbed — it is always attributed to whoever owned the team during `phase = 'group'`.

**Fallback — Option A (fresh snake re-draft):** all surviving teams go back into a pool and are re-drafted in snake order. Kept as a pivot option; requires no schema change.

*(Superseded: the earlier **Option B blind swap** — managers trading nominated teams matched blind — is dropped in favour of the free-agent pickup. The `swap_nominations` table can be repurposed for drop/claim state or removed when this is built.)*

### In-tournament Bonus Games (future — not yet designed)
Admin-created, **time-limited** mini side-bets launched *during* the tournament for fun and variety — separate from the upfront bonus predictions. Light, optional, and recurring (e.g. a question tied to a given match day).

**Recommended v1 shape (when built):** the admin posts a question + a set of multiple-choice options + a deadline + a point value; players tap one option; picks stay **blind until the deadline** (consistent with the app's visibility model), then the admin marks the winning option and scoring is **automatic and idempotent** (derived/rebuildable, like all `scores`). A free-text / admin-graded variant is a possible later extension.

Exact games, format, and point values are **TBD** — captured here as a direction, not a committed design. Likely its own future plan, after the pre-tournament critical path and group-stage scoring are in.

### Scoring
- Points-based (not winner-takes-all). Values **rebalanced 2026-06-06** (`supabase/seed/0014_scoring_tune.sql`): team-picking is the centrepiece, bonus is complementary, and the knockout ladder is flattened so one lucky deep run no longer dominates. Tunable via the scoring config tables before kickoff. Rationale + full breakdown: `docs/superpowers/specs/2026-06-06-scoring-ingestion-design.md`.
- Points are split by ownership phase so the blind swap stays fair: qualifying out of the group rewards the **group-stage owner**; the knockout run rewards the **knockout owner**.

**Group-stage reward → group-stage owner (per team):**
| Achievement | Points |
|---|---|
| Qualifies out of group (reaches Round of 32) | 5 |

**Knockout reward → knockout owner (per team, by furthest stage reached):**
| Furthest stage reached | Points |
|---|---|
| Eliminated in Round of 32 | 0 |
| Reached Round of 16 | 6 |
| Reached Quarter-final | 10 |
| Reached Semi-final | 14 |
| Reached Final (runner-up) | 18 |
| Champion (additive bonus on top of Final) | +6 → 24 total |

**Bonus predictions: 4 points** per correct pick (a player can score on at most one pick per category). Resolved manually by the admin (`bonus_categories.resolved_answer`). Most categories allow **2 guesses**; the three single-answer team-pick categories (Tournament Winner, Runner-Up, Wooden Spoon) allow **1 guess** — see migration `0015` and the note below.

> **⚠️ Scoring-build note (free-text matching):** the 5 free-text categories store whatever the player typed, so scoring **cannot** do a naïve string equality against `resolved_answer` (case, accents, "Mbappé" vs "Mbappe", "K. Mbappé" vs "Kylian Mbappé" all differ). The scoring build must **normalise before comparing** (trim, casefold, strip accents/punctuation) and/or have the admin resolve each free-text category by **picking from the distinct submitted values** rather than typing a canonical answer — so the answer always matches at least the intended submissions. Team-pick categories are safe (dropdown values come from seeded `teams`). Decide the exact matching strategy when building scoring.

**Bonus categories (current list — 8, updated 2026-06-04):** *team-pick = dropdown, else free text.*
1. Golden Boot — Top Scorer *(free text)*
2. Golden Ball — Best Player *(free text)*
3. Golden Glove — Best Goalkeeper *(free text)*
4. Best Young Player *(free text)*
5. Tournament Winner *(team pick)*
6. Runner-Up — Losing Finalist *(team pick)* — added 2026-06-04
7. Most Assists — Playmaker *(free text)* — added 2026-06-04
8. Wooden Spoon — Worst Team *(team pick)* — added 2026-06-04

### Results Data Source (validated 2026-06-02)

The project's #1 technical risk — "can we actually fetch WC 2026 data on a free tier?" — is **retired**. A wide search plus live probing of no-key endpoints confirmed multiple working sources:

| Source | Key? | What it gives | Verdict |
|---|---|---|---|
| **openfootball/worldcup.json** | none | Full 2026 schedule: teams, groups, dates, venues (public domain raw JSON). Manual/community-committed — **no live scores.** | **Seed source** for `teams` + `matches`. Proven live. |
| **football-data.org** (free tier) | free token (email, no card) | Matches + scores + standings. WC is in the permanently-free tier; scores delayed (not real-time) but final. ~10 req/min. | **Primary results feed.** Verify 2026 fixtures populated when building cron. |
| **worldcup26.ir** | none | Teams + games with score/`finished`/`time_elapsed` fields; *claims* real-time. | **NOT RECOMMENDED.** Opaque data source (never says how scores are sourced), single hobbyist monetized via crypto wallets, `.ir` hosting → availability + silent-bad-data risk for the feed that decides the pool. Low security risk (server-side GET only), but disqualified when better options exist. |
| **API-Football** (api-sports/RapidAPI free) | key | All endpoints, but free plan **blocks season 2026**. | **REJECTED.** Spike run 2026-06-02 returned: *"Free plans do not have access to this season, try from 2022 to 2024."* Paid Pro (~€19/mo) would work; not worth it given free alternatives. |

Our needs are modest (48 teams, 104 fixtures, **final** results + knockout progression, polled a few times/day for ~8 users), so delayed-but-reliable beats real-time. This split removes the dependency on API-Football's uncertain free-season access.

**Not on the critical path:** registration + draft + bonus predictions must lock by June 11; results ingestion follows during the group stage.

### Automated Score Updates
- A **Vercel Cron Job** runs daily (more frequently on match days) calling a Next.js API route
- The API route fetches results from the **primary results feed (football-data.org)**; `matches.external_id` maps the feed's fixture id to internal UUIDs (reconcile on this)
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

### Deployment model — multi-group (decided 2026-06-02)

To run the game for a second group of friends, deploy a **separate instance** (own Vercel project + own Supabase project, own URL/password) rather than building multi-tenancy into the schema. The schema stays **single-tenant**; full data isolation comes for free from separate databases. Implication for the build: pool **branding** (pool name, trophy name, etc.) and the **shared site password** must come from **env/config**, never hardcoded, so a fork rebrands without code changes.

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

-- ============ KNOCKOUT SWAP NOMINATIONS (legacy — Option B blind swap, now superseded) ============
-- Superseded by the free-agent pickup mechanic (see Knockout Re-allocation).
-- Currently unused; repurpose for drop/claim state or drop when that's built.
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
-- Effective values shown (rebalanced 2026-06-06 by supabase/seed/0014_scoring_tune.sql).
-- Migration 0001 originally seeded r16=4, qf=8, final=22; 0014 overwrites them.
insert into scoring_rules (stage, points) values
  ('r32', 0),   -- eliminated in R32
  ('r16', 6),
  ('qf', 10),
  ('sf', 14),
  ('final', 18);
-- (third_place playoff carries no separate points in the draft scheme)

create table scoring_config (
  id                int primary key default 1 check (id = 1),
  group_qualify_pts int not null default 5,   -- team reaches R32 → phase='group' owner
  bonus_correct_pts int not null default 4,   -- each correct bonus pick (0014: was 8)
  champion_pts      int not null default 6    -- additive bonus on top of 'final' → knockout owner (0014: was 12)
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

- [x] ~~Exact points breakdown per round~~ — values set, then **rebalanced 2026-06-06** (`0014_scoring_tune.sql`; see Scoring) for a flatter ladder + complementary bonus; seeded into `scoring_rules` + `scoring_config`, tunable before kickoff
- [x] ~~Bonus prediction categories~~ — **8 categories** live (5 free-text + 3 team-pick; expanded from 5 on 2026-06-04 — see Scoring); seeded into `bonus_categories`
- [x] ~~Free-text bonus scoring — matching strategy~~ — **RESOLVED 2026-06-06:** normalise both sides (trim, casefold, strip accents/punctuation) before comparing; the admin resolves each category by typing or one-tapping a distinct submitted value. See `docs/superpowers/specs/2026-06-06-scoring-ingestion-design.md`.
- [x] ~~Knockout re-allocation mechanic~~ — **Free-agent pickup** chosen (2026-06-03): one optional swap — drop one team + claim one unowned R32 team. Supersedes the earlier Option B blind swap; Option A (fresh snake draft) kept as fallback. **Allocation order under contention — RESOLVED 2026-06-06: reverse-standings priority** (worst-placed manager picks first).
- [ ] In-tournament bonus games — exact games, answer format (recommended: multiple-choice, blind-until-deadline, auto-scored), and point values TBD. See *In-tournament Bonus Games*.
- [x] ~~Draft time window value for `draft_pick_window_secs`~~ — **48h** (172800s), chosen because the group spans time zones; auto-advance cap, not expected pace. Mitigate deadline risk by opening the draft early. Tunable in `game_config`.
- [x] ~~Notification mechanism for draft turns~~ — **none for v1**: players check the site, admin nudges via group chat. Email/push is post-launch polish.
- [x] ~~Confirm API-Football free tier actually returns WC 2026 fixtures/results~~ — **RESOLVED 2026-06-02: API-Football free does NOT (season 2026 is paid-only).** Pivoted to openfootball (seed) + football-data.org (results) + admin manual override (backstop) — see Results Data Source section.
- [x] ~~Data model finalisation~~ — drafted (see Data Model); revisit only after the knockout mechanic is chosen
- [x] ~~Access mechanism~~ — single shared site password, no invite codes
- [x] ~~Visibility rules~~ — hidden until each submission phase locks (see Visibility Rules)
- [ ] UI design / mockups (planned for next session)
