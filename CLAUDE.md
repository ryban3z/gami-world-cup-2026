# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: app built through the knockout re-allocation

The **landing page**, the entire **pre-tournament app**, the **in-tournament scoring stack**, and the **knockout re-allocation + wildcard** are built and deployed (Vercel auto-deploys from `main`). Done:
- Supabase schema + RLS, seeded teams + **8 bonus categories**, shared-password gate, and **display-name + password auth** (synthetic email, no real email — `lib/identity.ts`) (Plan 1 — `docs/superpowers/plans/2026-06-02-pre-tournament-foundation.md`).
- The **snake-draft engine + draft-night dashboard** (Plan 2) and **bonus predictions + kickoff lock** (Plan 3).
- An **`/admin` control panel** (`app/(app)/admin/`) that drives every phase transition — open/close registration, start draft, auto-pick, lock predictions — each behind a two-step confirm. Admins reach it via a "⚙ Admin" link on `/home`; non-admins are redirected away. It also hosts the results tools: manual refresh (30s cooldown), per-match override (penalties-aware, `0025`), and bonus-category resolution.
- **Scoring + results ingestion** (`docs/superpowers/plans/2026-06-06-scoring-ingestion.md`): pure engine in `lib/scoring.ts`, ingest/recalc pipeline in `lib/pipeline.ts` (service-role client), football-data.org mapper in `lib/footballData.ts`, daily Vercel Cron → `/api/cron/ingest` (`CRON_SECRET` bearer auth; the route is exempted from the gate in `middleware.ts`).
- The **live dashboard** (`docs/superpowers/plans/2026-06-07-live-dashboard.md`): `/leaderboard` + home summary + match strip (`lib/leaderboardView.ts`), and gated **manager profile pages** (`/managers/[id]`).
- The **knockout re-allocation + wildcard** (`docs/superpowers/plans/2026-06-23-knockout-realloc.md`, migration `0030`): the `knockout_realloc` phase. Managers submit a blind one-team swap (drop one + ranked top-3 wishlist of unowned R32 free agents) and/or a one-time wildcard (re-answer one bonus category); the admin opens the window (snapshots reverse-standings order) and resolves it (auto-allocates worst-placed-first, materializes `phase='knockout'` ownership, locks). Player UI at `app/(app)/knockout/`, pick-order math in `lib/knockoutView.ts`, RPCs + repurposed `swap_nominations` in `0030`.

**Still to build (optional): the in-tournament bonus mini-games** sketched in the spec. The go-live runbook is in `README.md`. See `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md` and the `docs/superpowers/plans/` files.

Setup for the core app lives in `README.md` (env vars, applying migrations, seeding teams). The data model is single-tenant by design — a second group is a separate deploy (branding + site password come from env).

Commands:
- `npm run dev` — local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — Next.js ESLint
- `npm test` — Vitest unit tests (countdown, config, gate, identity, draft + draftView, predictions, adminView, scoring, footballData, leaderboardView, managerProfileView, knockoutView). Note: `npm run lint` can hang on an interactive ESLint setup; prefer `npx tsc --noEmit` + `npm run build` to verify.
- Deploy: Vercel (import the GitHub repo, or `npx vercel --prod`)

The canonical, authoritative design lives in `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md`. **Read it before doing any work** — it contains the full feature set, the finalized Postgres data model (as DDL), scoring values, and the list of open questions. The landing page has its own spec + plan under `docs/superpowers/specs/` and `docs/superpowers/plans/`. When a design decision changes, update the relevant spec; treat it as the source of truth over any summary here.

## What this is

A private, mobile-friendly web app for ~8 friends to run a World Cup 2026 betting pool: snake-draft teams, submit bonus predictions, accumulate points as the tournament progresses, with a one-time wildcard and a knockout-stage team re-allocation.

## Planned stack

- **Next.js 14 (App Router) + TypeScript**, deployed on **Vercel**
- **Supabase** — Postgres (all persistent state) + Auth (sessions). Auth sits behind a single shared site-password gate; there are no per-user invite codes.
- **Vercel Cron** → a Next.js API route (`/api/cron/ingest`) that ingests results and triggers idempotent score recalculation. Results source resolved 2026-06-02: seed teams/matches from **openfootball/worldcup.json**, final scores from **football-data.org** (free tier), with admin manual override (`matches.is_manual_override`) as the backstop. *(API-Football's free tier was rejected — it returns no WC 2026 data.)*

## Architecture concepts that span multiple parts of the system

These are the non-obvious invariants the whole app is built around. Preserve them:

- **`game_config` is a single-row state machine.** `current_phase` (`registration → draft → group_locked → knockout_realloc → knockout_locked → complete`) gates nearly everything: what's editable, what's visible, and which UI is shown. Phase transitions are admin-triggered, not date-driven.

- **Visibility follows phase.** A player sees only their own picks/predictions while a submission phase is open; rows become visible to everyone once the phase that produced them locks. Knockout swap nominations go blind again during `knockout_realloc`. This is enforced with Supabase **Row Level Security keyed off `game_config.current_phase`** — not in application code alone.

- **`team_ownership` carries a `phase` (`group` / `knockout`).** The same table holds both the group-stage draft and the knockout re-allocation (a second row per team). This is what keeps group-stage scoring stable when teams are re-shuffled for the knockouts.

- **Scoring is split by ownership phase.** Qualifying out of the group rewards the `phase='group'` owner; the knockout run rewards the `phase='knockout'` owner. This split is what keeps the post-group team swap fair — respect it in any scoring code.

- **Group qualification is credited on mathematical clinch, not just R32 appearance.** `deriveGroupQualified` (`lib/scoring.ts`) marks a team `qualified` once it's guaranteed a top-2 group finish, so the qualify reward + a `team_standings.qualified` flag (→ green "Qualified" badge on the dashboard + roster cards) land mid-group-stage. It decides this by **enumerating every completion of the group's remaining games** (3^n, n ≤ 6) and checking ≤1 other team can ever finish at-or-above the team — a per-rival "can they catch me?" bound is wrong because two rivals who still play each other can't both win. The 8 best-3rd-placed qualifiers are credited later via the `furthest_stage ≥ r32` path. Assumes the full group fixture list exists as `scheduled` rows (the seed guarantees this). Migration `0029`.

- **The score breakdown splits group points into `group_qualify` + `group_win`** (`ScoreBreakdown` in `lib/scoring.ts`); `group` stays as their sum for back-compat. Surfaced as the Qualify/Wins cells on the manager profile and the expandable leaderboard rows. Older stored `scores.breakdown` rows lack the two fields until the next recalc — view code defaults them to 0.

- **`scores` and `team_standings` are derived data.** They must be fully rebuildable from `team_ownership` + `matches` + `bonus_predictions`. Recalculation **recomputes from scratch (idempotent); never increment.**

- **The wildcard is a replacement, not a separate entity.** It's modeled as a new `bonus_predictions` row with the old one marked inactive and linked via `superseded_by`. One use per player (`profiles.wildcard_used_at`).

- **External IDs are the integration seam.** `teams.external_id` and `matches.external_id` map the results feed's (football-data.org) IDs to internal UUIDs; results ingestion reconciles on these.

## Knockout re-allocation

Chosen mechanic is **free-agent pickup** (decided 2026-06-03): after the group stage each manager may make **one optional team swap** — drop one owned team and claim one unowned team that advanced to the Round of 32. No manager-to-manager trading. Scoring follows the ownership-phase split (the pickup earns knockout points only; group-qualify points stay with the group-phase owner). **Option A (fresh snake re-draft)** remains the documented fallback and needs no schema change. The **allocation order is resolved (2026-06-10): reverse-standings priority** — worst-placed on the leaderboard picks first, tiebroken by reverse snake-draft order (later original draft slot picks first); standings are snapshotted from `scores.total_points` when the admin opens `knockout_realloc` and stay fixed for the whole window. The **allocation mechanic is built (migration `0030`): blind ranked preferences, auto-resolved** — each manager privately submits the team they'll drop plus a **ranked top-3 wishlist** of unowned R32 teams (empty wishlist = no swap; the drop is always explicit, never inferred); once the admin resolves the window the system walks managers worst-placed-first and awards each their top still-available pick (the drop only executes if a claim succeeds, single pass). It repurposes the `swap_nominations` table (drop + per-rank pick rows) and snapshots the order into `game_config.knockout_order`. `resolve_knockout_realloc()` **materializes `phase='knockout'` ownership for every manager's final roster** (kept teams + any claim; dropped teams left unowned) and is the only path to `knockout_locked` — so `lib/scoring.ts` treats the knockout owner map as authoritative once any knockout row exists (a dropped team's ladder points then go to no one), falling back to the group owner only before resolve. The same window hosts the **wildcard** (`use_wildcard` RPC): a one-time re-answer of one whole bonus category, modeled as a `superseded_by` replacement (`profiles.wildcard_used_at`). Player UI: `app/(app)/knockout/`; pick-order math + tests: `lib/knockoutView.ts`. (This supersedes the earlier Option B blind-swap mechanic; **Option A (fresh snake re-draft)** remains the documented pivot.)

## Conventions

- Spec/design docs live under `docs/superpowers/specs/` named `YYYY-MM-DD-<topic>-design.md`; plans under `docs/superpowers/plans/`.
- The app must be **mobile-first** — it's used primarily on phones. Design and build for small screens first, don't retrofit. Interactive elements use shared `lib/ui.ts` helpers (`pressable`, `focusRing`, `pressableLink`) so taps get `active:` feedback (hover does nothing on touch) and a keyboard focus ring.
- **Phase changes are mutations, never direct table writes.** They go through `security definer` RPCs (`start_draft`, `admin_autopick`, `lock_predictions`, `set_registration_open`, `make_pick`, `save_bonus_category`) wrapped by server actions in `app/(app)/<route>/actions.ts`. Admin RPCs self-guard on `profiles.is_admin`; direct client writes stay denied by RLS.
- **Pure view logic → `lib/*View.ts` + colocated Vitest test** (e.g. `draftView`, `adminView`); presentational components stay untested and are verified via `npm run build`.
- **The assistant has no Supabase DB credentials.** Migrations/seeds are delivered as `.sql` files in `supabase/migrations/` and `supabase/seed/` (numbered in a single shared apply sequence, listed in `README.md`); the **user** runs them in the Supabase SQL editor.
