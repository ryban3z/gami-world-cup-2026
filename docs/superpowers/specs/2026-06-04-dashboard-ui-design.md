# Dashboard UI — Draft Night & Live Tournament

**Date:** 2026-06-04
**Status:** Design approved (brainstorm), pending implementation plan(s)
**Related:** `2026-05-28-world-cup-pool-design.md` (canonical spec). This document details the **home/dashboard UI** for two phases that the canonical spec left undefined: the live draft and the live tournament.

---

## Goal

Define what `/home` (the dashboard) looks like in its two most important live states:

1. **During the draft** (`current_phase = 'draft'`) — make draft night feel like an event.
2. **Live tournament** (`group_locked` and beyond, scores updating daily) — answer "where do I rank?" the instant the app opens.

The dashboard is already the single landing surface (home = dashboard). This spec adds the draft-night framing and the entire live-tournament view. The registration-phase view (player list) is unchanged.

---

## Part 1 — Draft-night dashboard (`phase = 'draft'`)

The team-selection grid (`DraftBoard`) is unchanged. We wrap **three new framing sections** around it. All three are derivable **entirely from the existing `draft_state()` RPC** — no backend changes required.

### 1a. "On the clock" turn banner (replaces the bare status line)

- **Your turn:** a large, unmissable gold banner — `⏰ You're on the clock` — with round context underneath: `Pick 11 of 24 · Round 2 · pick your 2nd team`.
- **Waiting:** a quieter bordered banner — `Waiting on Tomek…` + the same pick/round line.
- Round math (client-side): `players = order_names.length`; `teams_per_player = picks_total / players`; `round = floor(picks_made / players) + 1`. "Pick your Nth team" uses `round`.

### 1b. Draft order rail (snake visualization)

- A horizontal wrap of name pills showing the **snake order** for the current round: who has gone (faded), who is up (solid gold), who is next (gold outline, `▸`), who is still to come.
- Reflects snake direction — odd rounds reverse — so players watch the order turn around at the ends.
- Data: `order_names` + `current_user_name` + `picks_made` (to compute position within the snake).

### 1c. "My picks" slots

- Three slots above the board showing **your roster filling up** (`1 / 3`): filled slots show flag + team name; empty slots show a placeholder, with the next slot highlighted as "pick now" on your turn.
- Data: `my_team_ids` mapped against `board` (for flag/name).

### Draft visibility — BLIND (confirmed)

The draft stays **blind during picking**: the board shows teams as `taken` vs `available`, and your own picks as `yours`, but **never reveals who took which team until the draft completes**. The full owner reveal (and the existing `Rosters` view) appears only once `phase` advances to `group_locked`. This preserves the end-of-draft reveal as a surprise — an intentional product choice over a live open draft.

---

## Part 2 — Live-tournament dashboard (`group_locked` → `complete`)

Leaderboard-first. One continuous mobile scroll, in this fixed order:

### 2a. Header
- Pool name + lightweight context line (`Group Stage · Matchday 2`).
- The viewer's **rank and total points pulled out large** (e.g. `3rd · 28 pts`) — the "where am I" glance before any scrolling.

### 2b. 🏆 Standings (the hero)
- **Compact** ranked rows, one per manager: `rank · name · movement arrow · total points`. The viewer's row is highlighted gold.
- **Movement arrow** (`▲2` / `▼1` / `—`) shows change in rank **since the previous day**. Requires a daily rank snapshot (see Data dependencies).
- **Tap a row to expand** that manager's 3 teams + points breakdown (group-qualify points, per-team tournament points, bonus points). Compact-by-default keeps all 8 managers on one screen; detail is one tap away.

### 2c. ⚽ My teams
- The viewer's 3 teams, each: flag, name, **status badge** (`Through` green / `Out` red / none if still alive), group + position (`Group C · 1st · 6 pts`) or next fixture (`next: vs 🇸🇳 Sat`), and **points that team has earned the viewer** (`+12`).
- Reflects the ownership-phase split: during knockouts a team picked up as a free agent shows its knockout points to its new owner; group-qualify points stay with the group-phase owner (per canonical spec).

### 2d. 📅 Today's matches
- The day's fixtures with live/final scores and kickoff times.
- **HARD REQUIREMENT — local timezone:** kickoff times MUST render in **each viewer's local timezone**. Store kickoffs as UTC (`timestamptz` in `matches`); format to local time **client-side** (or via the request's locale), never server-side with a fixed zone — otherwise everyone sees Vercel's timezone.
- This section requires the full fixture list to be ingested (not just results). Accepted scope cost.

### 2e. 🎯 Bonus picks
- A link/button into the existing `/predictions` reveal (everyone's locked predictions).

---

## Data dependencies & sequencing

The two parts have very different prerequisites — they should become **separate implementation plans**:

- **Draft-night dashboard (Part 1) — buildable now.** Pure frontend off the existing `draft_state()` RPC. No migrations, no scoring. Can ship before the draft on ~Fri 5 Jun.
- **Live-tournament dashboard (Part 2) — depends on scoring + ingestion.** It is a *consumer* of derived data that does not exist yet:
  - `matches` populated with fixtures **and** results (football-data.org feed — the project's flagged technical risk; validate first).
  - `scores` and `team_standings` recalculated (idempotent, split by ownership phase) — the scoring system.
  - **Daily rank snapshot** for the movement arrows: persist each manager's rank once per day (e.g. a `standings_history` row or a snapshot column) so today's arrow can compare against yesterday. New, small requirement introduced by this design.

  Part 2 should be planned **after** (or alongside the tail of) the scoring/ingestion build, since it renders that system's output.

---

## Out of scope (this spec)

- The scoring engine and results ingestion themselves (separate spec/plan — the next major build).
- Knockout free-agent pickup UI, wildcard bonus-pick swap UI, in-tournament bonus games (future, per canonical spec).
- Open/live draft (explicitly rejected — draft stays blind).
