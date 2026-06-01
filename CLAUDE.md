# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status: landing page shipped; core app not yet built

The **landing page** (Gami World Cup '26 info hub) is built and deployable — a Next.js 14 + TypeScript + Tailwind app scaffolded at the repo root. The core pool app (auth, draft, scoring, admin) is **not built yet** and remains in design.

Commands:
- `npm run dev` — local dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run lint` — Next.js ESLint
- `npm test` — Vitest unit tests (currently the countdown logic)
- Deploy: Vercel (import the GitHub repo, or `npx vercel --prod`)

The canonical, authoritative design lives in `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md`. **Read it before doing any work** — it contains the full feature set, the finalized Postgres data model (as DDL), scoring values, and the list of open questions. The landing page has its own spec + plan under `docs/superpowers/specs/` and `docs/superpowers/plans/`. When a design decision changes, update the relevant spec; treat it as the source of truth over any summary here.

## What this is

A private, mobile-friendly web app for ~8 friends to run a World Cup 2026 betting pool: snake-draft teams, submit bonus predictions, accumulate points as the tournament progresses, with a one-time wildcard and a knockout-stage team re-allocation.

## Planned stack

- **Next.js 14 (App Router) + TypeScript**, deployed on **Vercel**
- **Supabase** — Postgres (all persistent state) + Auth (sessions). Auth sits behind a single shared site-password gate; there are no per-user invite codes.
- **Vercel Cron** → a Next.js API route that fetches results from **API-Football (RapidAPI free tier)** and triggers score recalculation. Note: the free tier's ability to serve live WC 2026 data is **unverified** and is the project's main technical risk — validate before relying on the cron path.

## Architecture concepts that span multiple parts of the system

These are the non-obvious invariants the whole app is built around. Preserve them:

- **`game_config` is a single-row state machine.** `current_phase` (`registration → draft → group_locked → knockout_realloc → knockout_locked → complete`) gates nearly everything: what's editable, what's visible, and which UI is shown. Phase transitions are admin-triggered, not date-driven.

- **Visibility follows phase.** A player sees only their own picks/predictions while a submission phase is open; rows become visible to everyone once the phase that produced them locks. Knockout swap nominations go blind again during `knockout_realloc`. This is enforced with Supabase **Row Level Security keyed off `game_config.current_phase`** — not in application code alone.

- **`team_ownership` carries a `phase` (`group` / `knockout`).** The same table holds both the group-stage draft and the knockout re-allocation (a second row per team). This is what keeps group-stage scoring stable when teams are re-shuffled for the knockouts.

- **Scoring is split by ownership phase.** Qualifying out of the group rewards the `phase='group'` owner; the knockout run rewards the `phase='knockout'` owner. This split is what makes the blind-swap mechanic fair — respect it in any scoring code.

- **`scores` and `team_standings` are derived data.** They must be fully rebuildable from `team_ownership` + `matches` + `bonus_predictions`. Recalculation **recomputes from scratch (idempotent); never increment.**

- **The wildcard is a replacement, not a separate entity.** It's modeled as a new `bonus_predictions` row with the old one marked inactive and linked via `superseded_by`. One use per player (`profiles.wildcard_used_at`).

- **External IDs are the integration seam.** `teams.external_id` and `matches.external_id` map API-Football's IDs to internal UUIDs; results ingestion reconciles on these.

## Knockout re-allocation

Chosen mechanic is **Option B (blind swap)** — players nominate one owned team to swap, matched blind. **Option A (fresh snake re-draft)** is the documented fallback and needs no schema change. The blind-swap pairing rules are intentionally still loose and meant to be refined during play.

## Conventions

- Spec/design docs live under `docs/superpowers/specs/` named `YYYY-MM-DD-<topic>-design.md`.
- The app must be **mobile-first** — it's used primarily on phones. Design and build for small screens first, don't retrofit.
