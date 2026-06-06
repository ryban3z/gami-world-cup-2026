# Scoring + Results Ingestion — Design Spec

**Date:** 2026-06-06
**Status:** Approved for planning
**Master spec:** `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md` (this elaborates the "Scoring" + "Automated Score Updates" sections and resolves several of its open questions).

## Goal

Keep the derived `scores` and `team_standings` tables correct throughout the tournament by
ingesting match results from football-data.org and recomputing scores idempotently — plus the
admin tools to correct bad data and resolve the free-text bonus categories. The
leaderboard/live-dashboard **UI is a separate follow-on spec**; this one ends at "`scores` is
always correct," exposing nothing new to players directly.

## Scope

In scope (one cohesive pipeline): **A** bootstrap/seed, **B** ingestion, **C** scoring recalc,
**D** admin override + bonus resolution. Out of scope: the leaderboard UI, the knockout
re-allocation *mechanic* (its scoring is supported here; the swap UI/RPC is a later subsystem),
and in-tournament bonus games.

**No new tables are required** — `matches`, `team_standings`, `scores`, `scoring_rules`,
`scoring_config` already exist (migration `0001`). The only schema change is one convenience
column (`game_config.last_results_sync_at`). This subsystem is mostly data (seed) + code + two
small admin RPCs + env + a cron entry.

## Confirmed external API facts (spiked 2026-06-06)

football-data.org, free tier, token in env (`FOOTBALL_DATA_TOKEN`), sent as header
`X-Auth-Token`. **Rate limit: 10 requests/minute** (`X-Requests-Available-Minute` /
`X-RequestCounter-Reset: 60` headers). Our pipeline needs only **1–2 calls per run**, far
under the limit.

- Competition **`WC`** (id `2000`), current season id **`2398`**, 2026-06-11 → 2026-07-19.
- `GET /v4/competitions/WC/matches` → **104 fixtures**, `resultSet.count: 104`.
- `GET /v4/competitions/WC/teams` → **48 teams**, each with `id`, `name`, `tla` (e.g. `MEX`), `crest`.
- Stage values: `GROUP_STAGE`(72), `LAST_32`(16), `LAST_16`(8), `QUARTER_FINALS`(4),
  `SEMI_FINALS`(2), `THIRD_PLACE`(1), `FINAL`(1).
- Group matches carry both teams; **knockout fixtures have null teams until rounds resolve**
  (the cron fills them in over time).
- Match status values: `TIMED`/`SCHEDULED` → scheduled, `IN_PLAY`/`PAUSED` → live,
  `FINISHED` → final. Scores at `score.fullTime.{home,away}`, plus `score.winner`
  (`HOME_TEAM`/`AWAY_TEAM`/`DRAW`) and `score.duration` (`REGULAR`/`PENALTY_SHOOTOUT`/…).

### Stage + status mappings

```
GROUP_STAGE     -> group        TIMED / SCHEDULED      -> scheduled
LAST_32         -> r32          IN_PLAY / PAUSED       -> live
LAST_16         -> r16          FINISHED               -> final
QUARTER_FINALS  -> qf
SEMI_FINALS     -> sf
THIRD_PLACE     -> third_place
FINAL           -> final
```

## Final scoring values (rebalanced 2026-06-06)

Team-picking is the centrepiece; bonus is complementary; the knockout ladder is flattened so
the title is best-but-not-a-jackpot. Delivered as a seed that **updates** the values seeded in
`0001` (tunable until kickoff).

`scoring_config`:
- `group_qualify_pts` = **5** (team reaches R32 → `phase='group'` owner)
- `bonus_correct_pts` = **4** (per correct pick; max one scoring pick per category)
- `champion_pts` = **6** (additive on top of `final` → knockout owner)

`scoring_rules` (knockout ladder, furthest stage reached → knockout owner):

| stage | points |
|---|---|
| `r32` | 0 |
| `r16` | 6 |
| `qf` | 10 |
| `sf` | 14 |
| `final` | 18 |
| (champion total) | 18 + 6 = **24** |

`third_place` carries no rule row (its two teams already earned `sf` points).

## Resolved master-spec open questions

- **Free-text bonus matching:** normalize both sides (trim, casefold, strip accents +
  punctuation) before comparing; the admin sets each answer by typing it or one-tapping a
  distinct submitted value. (Resolves the ⚠️ scoring-build note.)
- **Free-agent re-allocation order under contention:** **reverse-standings priority**
  (worst-placed manager picks first). (Resolves the last "Knockout Re-allocation" TBD. The
  swap *mechanic* remains a later subsystem; this scoring engine already honours the
  group/knockout ownership split it produces.)

---

## A. Bootstrap / seed (one-time)

A generator script `scripts/generate-matches-seed.mjs` (mirrors `scripts/generate-teams-seed.mjs`)
calls the API once for teams + once for matches and emits **`supabase/seed/0012_seed_matches.sql`**,
committed to the repo. The assistant runs the generator (token in env); the user applies the
generated SQL in the Supabase SQL editor (assistant has no DB write credentials).

The generated `0012_seed_matches.sql` does, in order:

1. **Map teams → `external_id`.** For all 48: `update teams set external_id = '<fd id>' where
   name = '<our name>';`. The script matches API team → our team by exact name, applying this
   override table for the 5 known naming diffs:

   | our `teams.name` | football-data `name` |
   |---|---|
   | Bosnia & Herzegovina | Bosnia-Herzegovina |
   | Cape Verde | Cape Verde Islands |
   | Czech Republic | Czechia |
   | DR Congo | Congo DR |
   | USA | United States |

   The script **fails loudly** if any of the 48 API teams cannot be matched to exactly one of
   our rows (so a future data drift can't silently mis-map).

2. **Insert the 104 fixtures.** `insert into matches (external_id, stage, group_letter,
   home_team_id, away_team_id, kickoff_at, status) values (...)` — teams resolved via
   `(select id from teams where external_id = '<fd id>')` (runs after step 1, so `external_id`
   is populated). Knockout fixtures with null API teams seed `home_team_id`/`away_team_id` =
   `null`, `status = 'scheduled'`. `group_letter` from the API `group` (`GROUP_A` → `A`), null
   for knockouts. Idempotent: `on conflict (external_id) do update` so re-applying is safe.

## B. Ingestion

`app/api/cron/ingest/route.ts` — a `GET` route, server-only, that runs the full pipeline:

1. **Auth:** require header `Authorization: Bearer <CRON_SECRET>`; 401 otherwise. (Vercel Cron
   sends this; the admin "Refresh now" button calls the pipeline via a server action instead,
   guarded by `is_admin` — it does not need the secret.)
2. **Fetch:** `GET /v4/competitions/WC/matches` (1 call) via `lib/footballData.ts`.
3. **Upsert `matches`** by `external_id` using the service-role client:
   - Update `status`, `home_score`/`away_score` (from `score.fullTime`), `winner_team_id`
     (from `score.winner` → resolve via `external_id`), `kickoff_at`, and **fill
     `home_team_id`/`away_team_id`** for knockout fixtures as the API populates them.
   - **Skip score/status writes on rows where `is_manual_override = true`** — the admin's
     correction wins over the feed. (Team-fill on knockout rows still applies.)
4. **Derive + write `team_standings`** (see C).
5. **Recalc + write `scores`** (see C).
6. Set `game_config.last_results_sync_at = now()`.

Cadence: **Vercel Hobby = once daily** via `vercel.json` cron. Match-day freshness comes from
the admin **Refresh now** button (and optionally a free external pinger hitting the same route
with the secret — not built in v1).

`lib/footballData.ts` (thin IO): `fetchWcMatches(token)` → returns the raw API match array;
`mapApiMatch(apiMatch)` → internal shape `{ externalId, stage, groupLetter, homeExternalId,
awayExternalId, kickoffAt, status, homeScore, awayScore, winner }` (pure, unit-tested against a
saved fixture).

## C. Scoring recalc (idempotent, from scratch)

All computation is **pure TypeScript** in `lib/scoring.ts` (unit-tested). The route / server
actions invoke it with the service-role client to read inputs and write the two derived tables.
Rationale for TS over a Postgres function: accent-normalization and the ownership-phase logic
are far easier to test and iterate in TS; this is a trusted backend recompute of *derived*
data, distinct from the RLS-guarded user mutations (draft/predictions) that remain RPCs.

### Standings derivation — `deriveStandings(matches)`

For each team, from the current `matches` rows:
- **`furthest_stage`** = the highest stage in which the team appears as `home_team_id` or
  `away_team_id` in any fixture, **excluding `third_place`** (a `third_place` appearance never
  ranks above `sf`). Stage rank: `group < r32 < r16 < qf < sf < final`.
- **`is_champion`** = the team is `winner_team_id` of the `final` fixture (status `final`).
- **`is_eliminated`** = appeared in a knockout fixture that is `final` (played) and did not win
  it, or never reached `r32`. (Used by the future UI; not required for points.)
- Writes one `team_standings` row per team (upsert by `team_id`).

**Group-qualify signal:** a team "reached R32" iff it appears in any `r32` fixture (i.e.
`furthest_stage >= r32`). This surfaces after the group stage resolves and the R32 bracket is
drawn — matching the master spec's "reaches Round of 32" wording; we do **not** compute live
group tables.

### Score computation — `computeScores(input)`

Inputs: `team_ownership` (both phases), `team_standings`, `bonus_predictions` (active),
`bonus_categories` (with `resolved_answer` + a team-pick flag), `scoring_rules`,
`scoring_config`. Output: one `scores` row per profile, fully rebuilt:

- **Group qualify (+`group_qualify_pts`)** per team that reached R32 → its **`phase='group'`
  owner** (undrafted team → no one).
- **Knockout ladder** per team by `furthest_stage` via `scoring_rules`, plus `champion_pts` if
  `is_champion` → the team's **knockout owner**, defined as the `phase='knockout'` ownership
  row if one exists, **else the `phase='group'` owner** ("do nothing = keep your teams"; makes
  scoring correct before the re-allocation subsystem exists and after).
- **Bonus (+`bonus_correct_pts`)** per category where the user has a correct active pick, **max
  one scoring pick per category per user**. Matching:
  - team-pick categories (`tournament_winner`, `runner_up`, `wooden_spoon`): direct equality of
    `pick_value` vs `resolved_answer`.
  - free-text categories: `normalizeAnswer(pick_value) === normalizeAnswer(resolved_answer)`.
  - a null/blank `resolved_answer` scores nothing for that category.
- Writes `scores.total_points` and `scores.breakdown` jsonb
  (`{ group, knockout, bonus, by_team: [{ team, phase, points }] }`). **Never increments** —
  every run recomputes from scratch, so re-runs and corrections converge.

Helpers (pure, tested): `normalizeAnswer(s)` (trim → lowercase → strip diacritics via
`String.prototype.normalize("NFD")` + remove combining marks → strip punctuation → collapse
whitespace); `stageRank(stage)`; `knockoutOwner(teamId, ownership)`.

## D. Admin (added to `/admin`)

Following the project convention (security-definer RPCs self-guarded on `is_admin`, wrapped by
server actions; recompute after each mutation):

- **Refresh results now** — server action (admin-guarded) that runs the same ingest pipeline.
- **Match override** — `admin_override_match(p_match_id, p_home_score, p_away_score,
  p_status)` RPC: sets scores, derives `winner_team_id`, sets `status` and
  `is_manual_override = true`. Server action calls it then recalcs. UI: a list of fixtures with
  an inline score/status editor.
- **Bonus resolution** — `admin_resolve_category(p_category_id, p_answer)` RPC: sets
  `bonus_categories.resolved_answer`. Server action calls it then recalcs. UI: per category,
  a text input pre-populated with one-tap chips of the **distinct submitted `pick_value`s** for
  that category (so the admin can match real submissions or type a canonical answer).

A small migration `0013_admin_results.sql` adds these two RPCs and the
`game_config.last_results_sync_at timestamptz` column (shown in `/admin` as "last synced").

## Security & configuration

- New env: **`FOOTBALL_DATA_TOKEN`** (server-only) and **`CRON_SECRET`** (server-only). Add
  both to `.env.local.example` and document in `README.md`; set them in Vercel project env.
- `SUPABASE_SECRET_KEY` (already present) is used only server-side (cron route + admin server
  actions) for the service-role client; never shipped to the browser.
- `vercel.json` registers the daily cron: `{ "crons": [{ "path": "/api/cron/ingest",
  "schedule": "0 6 * * *" }] }` (06:00 UTC daily; tunable). Vercel injects the cron request;
  the route still enforces the `CRON_SECRET` bearer check.
- Derived tables (`matches`, `team_standings`, `scores`) stay deny-by-default to clients (no
  write policies); all writes happen via the service-role server context or the admin RPCs.

## Testing

- **`lib/scoring.test.ts`** — `deriveStandings`: group-qualify via R32 appearance, ladder
  stage selection, `third_place` not above `sf`, champion flag, elimination. `computeScores`:
  group→group-owner, knockout→knockout-owner with default-to-group-owner fallback, undrafted
  qualifier scores no one, bonus normalization (accents/case/punctuation), one-scoring-pick-per-
  category cap, team-pick vs free-text matching, breakdown totals. `normalizeAnswer` edge cases.
- **`lib/footballData.test.ts`** — `mapApiMatch` over a saved API JSON fixture: stage mapping,
  status mapping, score + winner extraction, null knockout teams.
- **`0013_admin_results.sql`** — a SQL simulation asserting the RPCs are admin-guarded (a
  non-admin call is rejected) and that override sets `is_manual_override`.
- Route + server actions verified via `npx tsc --noEmit` + `npm run build` (IO not unit-tested).
- `npm run lint` is avoided (hangs).

## Apply order (README additions)

```
13. supabase/seed/0012_seed_matches.sql      — teams.external_id mapping + 104 fixtures.
14. supabase/migrations/0013_admin_results.sql — admin override/resolve RPCs + last_results_sync_at.
15. supabase/seed/0014_scoring_tune.sql       — rebalanced scoring_config / scoring_rules values.
```

(Items 11–12 are the manager-profile `0010`/`0011` from the prior spec.)

## Files

**Create**
- `scripts/generate-matches-seed.mjs` — API → `0012_seed_matches.sql` generator.
- `supabase/seed/0012_seed_matches.sql` — generated: `external_id` mapping + fixtures.
- `supabase/migrations/0013_admin_results.sql` — `admin_override_match`,
  `admin_resolve_category`, `game_config.last_results_sync_at`.
- `supabase/seed/0014_scoring_tune.sql` — rebalanced scoring values.
- `lib/footballData.ts` (+ `lib/footballData.test.ts`) — API client + mapping.
- `lib/scoring.ts` (+ `lib/scoring.test.ts`) — pure standings + score computation.
- `app/api/cron/ingest/route.ts` — the pipeline endpoint.
- `vercel.json` — daily cron registration.

**Modify**
- `app/(app)/admin/page.tsx` + `app/(app)/admin/actions.ts` — refresh button, match override,
  bonus resolution UI + server actions.
- `.env.local.example` — `FOOTBALL_DATA_TOKEN`, `CRON_SECRET`.
- `README.md` — env vars + apply order (items 13–15).
- `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md` — mark the two resolved open
  questions (free-text matching; re-allocation order = reverse-standings priority).
