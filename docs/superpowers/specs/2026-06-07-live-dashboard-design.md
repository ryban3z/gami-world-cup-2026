# Live Tournament Dashboard — Design

**Date:** 2026-06-07
**Status:** Approved, ready for implementation plan
**Canonical master spec:** `docs/superpowers/specs/2026-05-28-world-cup-pool-design.md`

## Goal

A read-only, mobile-first dashboard that lets the ~8 managers follow the pool
once the tournament is underway: a ranked leaderboard with tap-to-expand score
breakdowns, each manager's own team statuses, and a compact recent/upcoming
match strip. It reads the derived data the scoring + ingestion subsystem already
produces (`scores`, `team_standings`, `matches`) — **no changes to scoring or
ingestion**, purely additive.

## Scope

**In v1:**
- Ranked leaderboard (managers by total points, with group/knockout/bonus split).
- Tap-to-expand per-manager breakdown: which teams earned what, plus an aggregate
  bonus line.
- "My teams" status panel (each of the viewer's teams: furthest stage / eliminated
  / champion).
- Match strip: last few finished results + next few upcoming kickoffs.
- Surfaced two ways: a compact summary card on `/home` **and** a full
  `/leaderboard` route.

**Explicitly deferred (logged to the minor-fixes backlog):**
- Per-pick bonus breakdown ("which bonus picks hit"). Bonus categories (winner,
  golden boot, awards, etc.) almost all resolve at tournament's end, so for the
  group stage and most knockouts there's nothing to show. The leaderboard total
  already includes bonus the moment it resolves (`breakdown.bonus` +
  `total_points` are computed by the existing engine); only the cosmetic per-pick
  detail is deferred. When awards land we add a `bonus_hits` array to the
  breakdown jsonb + a per-pick view.

## Architecture

Mirrors the existing app: gated server components fetch already-computed data via
`Promise.all`, pure tested view helpers shape it, presentational components render
it. No new mutations or RPCs — the only DB change is read access.

### Data access — `supabase/migrations/0016_dashboard_rls.sql`

`scores`, `team_standings`, and `matches` currently have RLS **enabled but no
SELECT policy**, so clients can't read them. Add a world-readable-to-authenticated
SELECT policy to each — they're non-sensitive, shared-by-design derived/public
data:

```sql
create policy "read scores"         on scores         for select to authenticated using (true);
create policy "read team standings" on team_standings for select to authenticated using (true);
create policy "read matches"        on matches        for select to authenticated using (true);
```

(Add to the README apply sequence as step 17.)

### Inputs (all already readable after the migration)

- `scores` — `user_id, total_points, breakdown` where `breakdown` is
  `{ group:int, knockout:int, bonus:int, by_team:[{team:uuid, phase:'group'|'knockout', points:int}] }`.
  **Note:** `by_team[].team` is a team **UUID**, resolved to name/flag in the view.
- `profiles` — `id, display_name` (already world-readable).
- `team_standings` — `team_id, furthest_stage, is_eliminated, is_champion`.
  `furthest_stage` / stage enum: `'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third_place' | 'final'`.
- `matches` — `id, stage, group_letter, home_team_id, away_team_id, kickoff_at,
  home_score, away_score, winner_team_id, status` (`status`:
  `'scheduled' | 'live' | 'final'`).
- `teams` — `id, name, flag_url` (already readable).
- `draft_state()` RPC — provides the viewer's `my_team_ids`, the full `board`
  (`{id, name, flag_url, …}`), `rosters`, `phase`, `is_admin`.
- `game_config` — `current_phase` via `draft_state()`.

## Pure view layer — `lib/leaderboardView.ts` (+ `lib/leaderboardView.test.ts`)

No IO. Structural "lite" input types decouple `lib/` from component types (same
pattern as `lib/managerProfileView.ts`).

### Types

```ts
export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";

interface ScoreLite {
  user_id: string;
  total_points: number;
  breakdown: {
    group: number;
    knockout: number;
    bonus: number;
    by_team: { team: string; phase: "group" | "knockout"; points: number }[];
  };
}
interface ProfileLite { id: string; display_name: string; }
interface TeamLite { id: string; name: string; flag_url: string | null; }
interface StandingLite { team_id: string; furthest_stage: Stage; is_eliminated: boolean; is_champion: boolean; }
interface MatchLite {
  id: string; stage: Stage; group_letter: string | null;
  home_team_id: string | null; away_team_id: string | null;
  kickoff_at: string | null; home_score: number | null; away_score: number | null;
  winner_team_id: string | null; status: "scheduled" | "live" | "final";
}

export interface LeaderTeamPoints { name: string; flagUrl: string | null; phase: "group" | "knockout"; points: number; }
export interface LeaderRow {
  rank: number;          // ties share a rank: 1, 2, 2, 4
  userId: string;
  displayName: string;
  isSelf: boolean;
  total: number;
  group: number;
  knockout: number;
  bonus: number;
  byTeam: LeaderTeamPoints[];   // sorted points desc
}

export interface MyTeamStatus {
  name: string;
  flagUrl: string | null;
  stageLabel: string;    // "Group", "Round of 16", "Quarter-final", … "Champion", "Eliminated"
  isEliminated: boolean;
  isChampion: boolean;
}

export interface MatchStripItem {
  id: string;
  stageLabel: string;        // "Group A", "Round of 32", …
  homeName: string; homeFlag: string | null;
  awayName: string; awayFlag: string | null;
  kickoffAt: string | null;
  homeScore: number | null; awayScore: number | null;
  status: "scheduled" | "live" | "final";
}
```

### Functions

**`buildLeaderboard(scores, profiles, teams, selfUserId): LeaderRow[]`**
- Build a `Map<userId, displayName>` and `Map<teamId, TeamLite>`.
- One row per profile (managers with no `scores` row yet score 0 across the board).
- `byTeam`: map each `breakdown.by_team` entry's `team` UUID to name/flag, sorted
  by `points` desc.
- Sort rows by `total` desc; tie-break alphabetically by `displayName`.
- Assign `rank` with **standard competition ranking** (ties share a rank, the next
  rank skips: 1, 2, 2, 4). `isSelf = userId === selfUserId`.

**`buildMyTeams(myTeamIds, board, standings): MyTeamStatus[]`**
- For each owned team id: resolve name/flag from `board`; look up its
  `team_standings` row (default: Group, not eliminated, not champion if absent).
- `stageLabel`: champion → "Champion"; else eliminated → "Eliminated"; else
  `STAGE_LABELS[furthest_stage]`.
- Order: champion first, then still-alive by deepest stage, then eliminated last.

**`buildMatchStrip(matches, teams, opts = { recent: 5, upcoming: 5 }): { recent: MatchStripItem[]; upcoming: MatchStripItem[] }`**
- `recent`: `status === 'final'`, sorted by `kickoff_at` desc, take `recent`.
- `upcoming`: `status !== 'final'`, sorted by `kickoff_at` asc, take `upcoming`.
- Resolve team ids → name/flag (null team → "TBD"); `stageLabel` from
  `STAGE_LABELS` (+ group letter for group stage, e.g. "Group A").

**`STAGE_LABELS: Record<Stage, string>`** — shared map:
`group→"Group"`, `r32→"Round of 32"`, `r16→"Round of 16"`, `qf→"Quarter-final"`,
`sf→"Semi-final"`, `third_place→"Third-place play-off"`, `final→"Final"`.

## Components (presentational; verified via `npm run build`)

- **`components/leaderboard/LeaderboardTable.tsx`** (`"use client"`) — ranked list;
  tapping a row toggles a detail panel showing the group/knockout/bonus split and
  the per-team points (`byTeam`). The viewer's own row is highlighted. When
  `phase === "complete"`, the rank-1 row shows a 🏆. Uses `pressable`/`focusRing`
  from `lib/ui.ts`.
- **`components/leaderboard/LeaderboardSummary.tsx`** — compact top-3 card for
  `/home` (rank, name, total), with a "Full leaderboard →" link.
- **`components/leaderboard/MyTeamsPanel.tsx`** — the viewer's teams with status
  badges.
- **`components/leaderboard/MatchStrip.tsx`** — "Recent results" + "Next up"
  sections.
- **`app/(app)/leaderboard/page.tsx`** — gated route (redirect to `/login` if no
  user; `force-dynamic`). Assembles `LeaderboardTable` + `MyTeamsPanel` +
  `MatchStrip` from the inputs above.
- **`app/(app)/home/page.tsx`** — add `LeaderboardSummary` + link, rendered only
  when the tournament is underway (see gating).
- **`middleware.ts`** — add `/leaderboard` to the authenticated route list.

## Phase gating

The dashboard shows only once the tournament is underway — `phase` ∈
`{ group_locked, knockout_realloc, knockout_locked, complete }` (predictions lock
at kickoff → `group_locked`, which is when scores first exist). Before that:
- `/home` renders exactly as today (draft board / rosters / registration list).
- `/leaderboard` shows "The tournament hasn't kicked off yet — check back after
  the group stage begins."

## Freshness

All pages are `export const dynamic = "force-dynamic"` (consistent with `/home`,
`/predictions`, `/admin`) — data is fresh on each load. Scores change at most once
daily (cron) or when an admin hits "Refresh results now", so no client-side
polling or websockets.

## Error / empty handling

- No `scores` row for a manager yet → they appear at 0 (handled by iterating
  `profiles`, not `scores`).
- Missing team standing → treated as Group / alive.
- Null teams in knockout fixtures (not yet resolved) → "TBD" in the match strip.
- Empty match strip sections render a quiet "Nothing yet." line.

## Testing

- **`lib/leaderboardView.test.ts`** — ranking order, standard-competition tie
  handling (1,2,2,4), `isSelf` flag, team-UUID → name/flag resolution, `byTeam`
  sort, managers with no score row defaulting to 0, `buildMyTeams` status/label
  mapping + ordering (champion/alive/eliminated), `buildMatchStrip` recent vs
  upcoming selection + counts + TBD handling.
- Components are presentational → verified via `npm run build`.
- No changes to `scoring.ts` / `scoring.test.ts` / the ingestion pipeline.

## Files

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0016_dashboard_rls.sql` | create | SELECT policies on scores / team_standings / matches |
| `lib/leaderboardView.ts` | create | pure view builders + `STAGE_LABELS` |
| `lib/leaderboardView.test.ts` | create | unit tests for the builders |
| `components/leaderboard/LeaderboardTable.tsx` | create | ranked list + tap-to-expand breakdown (client) |
| `components/leaderboard/LeaderboardSummary.tsx` | create | top-3 card for /home |
| `components/leaderboard/MyTeamsPanel.tsx` | create | viewer's team statuses |
| `components/leaderboard/MatchStrip.tsx` | create | recent + upcoming fixtures |
| `app/(app)/leaderboard/page.tsx` | create | gated full dashboard route |
| `app/(app)/home/page.tsx` | modify | add summary card + link (phase-gated) |
| `middleware.ts` | modify | add `/leaderboard` to authed routes |
| `README.md` | modify | add migration 0016 to apply sequence |

## Out of scope

Per-pick bonus breakdown (deferred), live websocket updates, historical
score-over-time charts, head-to-head comparison views, the knockout re-allocation
UI (its own future subsystem — but the leaderboard already credits knockout points
to whoever owns a team via `breakdown.by_team[].phase`, so it stays correct
through that transition).
