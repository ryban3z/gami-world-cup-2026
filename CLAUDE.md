# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: full pre-tournament app built; scoring/ingestion is next

The **landing page** and the entire **pre-tournament app** are built and deployed (Vercel auto-deploys from `main`). Done:
- Supabase schema + RLS, seeded teams + **8 bonus categories**, shared-password gate, and **display-name + password auth** (synthetic email, no real email — `lib/identity.ts`) (Plan 1 — `docs/superpowers/plans/2026-06-02-pre-tournament-foundation.md`).
- The **snake-draft engine + draft-night dashboard** (Plan 2) and **bonus predictions + kickoff lock** (Plan 3).
- An **`/admin` control panel** (`app/(app)/admin/`) that drives every phase transition — open/close registration, start draft, auto-pick, lock predictions — each behind a two-step confirm. Admins reach it via a "⚙ Admin" link on `/home`; non-admins are redirected away.

**Still to build: scoring + results ingestion** (the next major subsystem), then the **live-tournament dashboard** that depends on it, then the **knockout re-allocation**. The go-live runbook is in `README.md`. See `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md` and the `docs/superpowers/plans/` files.

Setup for the core app lives in `README.md` (env vars, applying migrations, seeding teams). The data model is single-tenant by design — a second group is a separate deploy (branding + site password come from env).

Commands:
- `npm run dev` — local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — Next.js ESLint
- `npm test` — Vitest unit tests (countdown, config, gate, identity, draft + draftView, predictions, adminView). Note: `npm run lint` can hang on an interactive ESLint setup; prefer `npx tsc --noEmit` + `npm run build` to verify.
- Deploy: Vercel (import the GitHub repo, or `npx vercel --prod`)

The canonical, authoritative design lives in `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md`. **Read it before doing any work** — it contains the full feature set, the finalized Postgres data model (as DDL), scoring values, and the list of open questions. The landing page has its own spec + plan under `docs/superpowers/specs/` and `docs/superpowers/plans/`. When a design decision changes, update the relevant spec; treat it as the source of truth over any summary here.

## What this is

A private, mobile-friendly web app for ~8 friends to run a World Cup 2026 betting pool: snake-draft teams, submit bonus predictions, accumulate points as the tournament progresses, with a one-time wildcard and a knockout-stage team re-allocation.

## Planned stack

- **Next.js 14 (App Router) + TypeScript**, deployed on **Vercel**
- **Supabase** — Postgres (all persistent state) + Auth (sessions). Auth sits behind a single shared site-password gate; there are no per-user invite codes.
- **Vercel Cron** → a Next.js API route that ingests results and triggers idempotent score recalculation (**not yet built**). Results source resolved 2026-06-02: seed teams/matches from **openfootball/worldcup.json**, final scores from **football-data.org** (free tier), with admin manual override (`matches.is_manual_override`) as the backstop. *(API-Football's free tier was rejected — it returns no WC 2026 data.)*

## Architecture concepts that span multiple parts of the system

These are the non-obvious invariants the whole app is built around. Preserve them:

- **`game_config` is a single-row state machine.** `current_phase` (`registration → draft → group_locked → knockout_realloc → knockout_locked → complete`) gates nearly everything: what's editable, what's visible, and which UI is shown. Phase transitions are admin-triggered, not date-driven.

- **Visibility follows phase.** A player sees only their own picks/predictions while a submission phase is open; rows become visible to everyone once the phase that produced them locks. Knockout swap nominations go blind again during `knockout_realloc`. This is enforced with Supabase **Row Level Security keyed off `game_config.current_phase`** — not in application code alone.

- **`team_ownership` carries a `phase` (`group` / `knockout`).** The same table holds both the group-stage draft and the knockout re-allocation (a second row per team). This is what keeps group-stage scoring stable when teams are re-shuffled for the knockouts.

- **Scoring is split by ownership phase.** Qualifying out of the group rewards the `phase='group'` owner; the knockout run rewards the `phase='knockout'` owner. This split is what keeps the post-group team swap fair — respect it in any scoring code.

- **`scores` and `team_standings` are derived data.** They must be fully rebuildable from `team_ownership` + `matches` + `bonus_predictions`. Recalculation **recomputes from scratch (idempotent); never increment.**

- **The wildcard is a replacement, not a separate entity.** It's modeled as a new `bonus_predictions` row with the old one marked inactive and linked via `superseded_by`. One use per player (`profiles.wildcard_used_at`).

- **External IDs are the integration seam.** `teams.external_id` and `matches.external_id` map the results feed's (football-data.org) IDs to internal UUIDs; results ingestion reconciles on these.

## Knockout re-allocation

Chosen mechanic is **free-agent pickup** (decided 2026-06-03): after the group stage each manager may make **one optional team swap** — drop one owned team and claim one unowned team that advanced to the Round of 32. No manager-to-manager trading. Scoring follows the ownership-phase split (the pickup earns knockout points only; group-qualify points stay with the group-phase owner). **Option A (fresh snake re-draft)** remains the documented fallback and needs no schema change. The **allocation order under contention is intentionally left open** (reverse-standings priority or a mini-game), to settle during play. (This supersedes the earlier Option B blind-swap mechanic.)

## Conventions

- Spec/design docs live under `docs/superpowers/specs/` named `YYYY-MM-DD-<topic>-design.md`; plans under `docs/superpowers/plans/`.
- The app must be **mobile-first** — it's used primarily on phones. Design and build for small screens first, don't retrofit. Interactive elements use shared `lib/ui.ts` helpers (`pressable`, `focusRing`, `pressableLink`) so taps get `active:` feedback (hover does nothing on touch) and a keyboard focus ring.
- **Phase changes are mutations, never direct table writes.** They go through `security definer` RPCs (`start_draft`, `admin_autopick`, `lock_predictions`, `set_registration_open`, `make_pick`, `save_bonus_category`) wrapped by server actions in `app/(app)/<route>/actions.ts`. Admin RPCs self-guard on `profiles.is_admin`; direct client writes stay denied by RLS.
- **Pure view logic → `lib/*View.ts` + colocated Vitest test** (e.g. `draftView`, `adminView`); presentational components stay untested and are verified via `npm run build`.
- **The assistant has no Supabase DB credentials.** Migrations/seeds are delivered as `.sql` files in `supabase/migrations/` and `supabase/seed/` (numbered in a single shared apply sequence, listed in `README.md`); the **user** runs them in the Supabase SQL editor.
