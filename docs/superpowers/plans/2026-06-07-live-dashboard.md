# Live Tournament Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only live dashboard — ranked leaderboard with tap-to-expand score breakdowns, the viewer's team statuses, and a recent/upcoming match strip — surfaced as a summary card on `/home` and a full `/leaderboard` route.

**Architecture:** Purely additive over the existing scoring/ingestion data. One RLS migration opens read access to `scores` / `team_standings` / `matches`; pure tested view builders in `lib/leaderboardView.ts` shape the data; presentational components render it; gated server components (`/leaderboard`, `/home`) fetch via `Promise.all` and gate on game phase. No changes to scoring, ingestion, or any mutation path.

**Tech Stack:** Next.js 14 App Router (server + client components), TypeScript, Tailwind, Supabase (Postgres + RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-live-dashboard-design.md`

**Conventions to follow (from CLAUDE.md):**
- Mobile-first; interactive elements use `pressable` / `focusRing` / `pressableLink` from `lib/ui.ts`.
- Pure view logic → `lib/*View.ts` with a colocated Vitest test; presentational components stay untested and are verified via `npm run build`.
- Don't run `npm run lint` (it can hang). Verify with `npx tsc --noEmit` + `npm run build` + `npm test`.
- The **user** applies SQL files in the Supabase SQL editor; the assistant never has DB credentials.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Do not push unless the user asks.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0016_dashboard_rls.sql` | create | SELECT policies on scores / team_standings / matches |
| `lib/leaderboardView.ts` | create | pure view builders + `STAGE_LABELS` + types |
| `lib/leaderboardView.test.ts` | create | unit tests for the three builders |
| `components/leaderboard/LeaderboardTable.tsx` | create | ranked list + tap-to-expand breakdown (client) |
| `components/leaderboard/MyTeamsPanel.tsx` | create | viewer's team statuses |
| `components/leaderboard/MatchStrip.tsx` | create | recent + upcoming fixtures |
| `components/leaderboard/LeaderboardSummary.tsx` | create | top-3 card for /home |
| `app/(app)/leaderboard/page.tsx` | create | gated full dashboard route |
| `middleware.ts` | modify | add `/leaderboard` to authed routes |
| `app/(app)/home/page.tsx` | modify | add summary card (phase-gated) |
| `README.md` | modify | add migration 0016 to apply sequence |

---

## Task 1: RLS read policies migration

**Files:**
- Create: `supabase/migrations/0016_dashboard_rls.sql`

The derived tables `scores`, `team_standings`, and `matches` have RLS enabled but no SELECT policy, so the dashboard can't read them. Add world-readable-to-authenticated policies (non-sensitive shared data). This SQL is applied by the **user**; there is no automated test.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0016_dashboard_rls.sql`:

```sql
-- ============================================================
-- Live dashboard read access (2026-06-07).
-- scores / team_standings / matches have RLS enabled but no SELECT policy,
-- so clients can't read them. These are non-sensitive, shared-by-design
-- derived/public tables — make them readable by any authenticated player.
-- Writes stay locked down (no insert/update/delete policy; the ingestion
-- pipeline writes via the service-role key, which bypasses RLS).
-- Idempotent — safe to re-run.
-- Canonical design: docs/superpowers/specs/2026-06-07-live-dashboard-design.md
-- ============================================================

drop policy if exists "read scores"          on scores;
drop policy if exists "read team standings"  on team_standings;
drop policy if exists "read matches"         on matches;

create policy "read scores"         on scores         for select to authenticated using (true);
create policy "read team standings" on team_standings for select to authenticated using (true);
create policy "read matches"        on matches        for select to authenticated using (true);
```

- [ ] **Step 2: Verify it parses (visual check)**

There is no local Postgres. Confirm the file uses the same `create policy … for select to authenticated using (true)` shape as existing policies in `supabase/migrations/0002_rls_policies.sql` and `0006_predictions.sql`. The user will apply it in the Supabase SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_dashboard_rls.sql
git commit -m "feat: RLS read policies for dashboard (scores/standings/matches)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: View layer — types, STAGE_LABELS, and `buildLeaderboard`

**Files:**
- Create: `lib/leaderboardView.ts`
- Test: `lib/leaderboardView.test.ts`

This task lays down the whole type scaffold + label maps for the file (used by all three builders), then implements `buildLeaderboard`.

- [ ] **Step 1: Write the failing test**

Create `lib/leaderboardView.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLeaderboard } from "@/lib/leaderboardView";

const teams = [
  { id: "t1", name: "Argentina", flag_url: "ar.png" },
  { id: "t2", name: "Japan", flag_url: "jp.png" },
  { id: "t3", name: "USA", flag_url: null },
];
const profiles = [
  { id: "u1", display_name: "Ada" },
  { id: "u2", display_name: "Bob" },
  { id: "u3", display_name: "Cy" },
];

function score(user_id: string, total: number, by_team: any[] = [], extra = {}) {
  return {
    user_id,
    total_points: total,
    breakdown: { group: 0, knockout: 0, bonus: 0, by_team, ...extra },
  };
}

describe("buildLeaderboard", () => {
  it("ranks by total desc and flags self", () => {
    const rows = buildLeaderboard(
      [score("u1", 10), score("u2", 25), score("u3", 5)],
      profiles,
      teams,
      "u3",
    );
    expect(rows.map((r) => r.displayName)).toEqual(["Bob", "Ada", "Cy"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.find((r) => r.displayName === "Cy")!.isSelf).toBe(true);
    expect(rows.find((r) => r.displayName === "Ada")!.isSelf).toBe(false);
  });

  it("uses standard competition ranking for ties (1,2,2,4) with alpha tie-break", () => {
    const rows = buildLeaderboard(
      [score("u1", 10), score("u2", 10), score("u3", 3)],
      profiles,
      teams,
      "u1",
    );
    // Ada and Bob both 10 → ranks 1 and 1 (alpha order Ada, Bob), Cy → rank 3.
    expect(rows.map((r) => [r.displayName, r.rank])).toEqual([
      ["Ada", 1],
      ["Bob", 1],
      ["Cy", 3],
    ]);
  });

  it("defaults managers with no score row to 0 across the board", () => {
    const rows = buildLeaderboard([score("u2", 7)], profiles, teams, "u1");
    const ada = rows.find((r) => r.displayName === "Ada")!;
    expect(ada.total).toBe(0);
    expect(ada.group).toBe(0);
    expect(ada.byTeam).toEqual([]);
  });

  it("resolves by_team UUIDs to name/flag and sorts by points desc", () => {
    const rows = buildLeaderboard(
      [
        score("u1", 13, [
          { team: "t1", phase: "group", points: 5 },
          { team: "t2", phase: "knockout", points: 8 },
        ]),
      ],
      profiles,
      teams,
      "u1",
    );
    const ada = rows.find((r) => r.displayName === "Ada")!;
    expect(ada.byTeam).toEqual([
      { name: "Japan", flagUrl: "jp.png", phase: "knockout", points: 8 },
      { name: "Argentina", flagUrl: "ar.png", phase: "group", points: 5 },
    ]);
  });

  it("copies group/knockout/bonus split from the breakdown", () => {
    const rows = buildLeaderboard(
      [score("u1", 12, [], { group: 5, knockout: 4, bonus: 3 })],
      profiles,
      teams,
      "u1",
    );
    const ada = rows.find((r) => r.displayName === "Ada")!;
    expect([ada.group, ada.knockout, ada.bonus]).toEqual([5, 4, 3]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- leaderboardView`
Expected: FAIL — `buildLeaderboard` is not defined / module not found.

- [ ] **Step 3: Create the file with types, labels, and `buildLeaderboard`**

Create `lib/leaderboardView.ts`:

```ts
// Pure view-layer helpers for the live dashboard. No IO. Shapes already-fetched
// scores / standings / matches into render-ready view models. Structural "lite"
// input types decouple lib/ from component types (same pattern as managerProfileView.ts).

export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "third_place" | "final";

export const STAGE_LABELS: Record<Stage, string> = {
  group: "Group",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  third_place: "Third-place play-off",
  final: "Final",
};

// How deep each stage is — used to order "my teams" by how far they've gone.
const STAGE_DEPTH: Record<Stage, number> = {
  group: 0, r32: 1, r16: 2, qf: 3, sf: 4, third_place: 4, final: 5,
};

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
interface StandingLite {
  team_id: string; furthest_stage: Stage; is_eliminated: boolean; is_champion: boolean;
}
interface MatchLite {
  id: string; stage: Stage; group_letter: string | null;
  home_team_id: string | null; away_team_id: string | null;
  kickoff_at: string | null; home_score: number | null; away_score: number | null;
  winner_team_id: string | null; status: "scheduled" | "live" | "final";
}

export interface LeaderTeamPoints {
  name: string; flagUrl: string | null; phase: "group" | "knockout"; points: number;
}
export interface LeaderRow {
  rank: number; userId: string; displayName: string; isSelf: boolean;
  total: number; group: number; knockout: number; bonus: number;
  byTeam: LeaderTeamPoints[];
}
export interface MyTeamStatus {
  name: string; flagUrl: string | null; stageLabel: string;
  isEliminated: boolean; isChampion: boolean;
}
export interface MatchStripItem {
  id: string; stageLabel: string;
  homeName: string; homeFlag: string | null;
  awayName: string; awayFlag: string | null;
  kickoffAt: string | null; homeScore: number | null; awayScore: number | null;
  status: "scheduled" | "live" | "final";
}

function emptyBreakdown(): ScoreLite["breakdown"] {
  return { group: 0, knockout: 0, bonus: 0, by_team: [] };
}

// Ranked leaderboard. One row per profile (managers with no score row score 0).
// by_team UUIDs are resolved to name/flag and sorted by points desc. Rows are
// sorted by total desc with an alphabetical tie-break, then assigned standard
// competition ranking (ties share a rank, the next rank skips: 1, 2, 2, 4).
export function buildLeaderboard(
  scores: ScoreLite[],
  profiles: ProfileLite[],
  teams: TeamLite[],
  selfUserId: string,
): LeaderRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const scoreByUser = new Map(scores.map((s) => [s.user_id, s]));

  const rows = profiles.map((p) => {
    const s = scoreByUser.get(p.id);
    const b = s?.breakdown ?? emptyBreakdown();
    const byTeam: LeaderTeamPoints[] = b.by_team
      .map((bt) => {
        const t = teamById.get(bt.team);
        return {
          name: t?.name ?? "—",
          flagUrl: t?.flag_url ?? null,
          phase: bt.phase,
          points: bt.points,
        };
      })
      .sort((a, b2) => b2.points - a.points);
    return {
      userId: p.id,
      displayName: p.display_name,
      isSelf: p.id === selfUserId,
      total: s?.total_points ?? 0,
      group: b.group,
      knockout: b.knockout,
      bonus: b.bonus,
      byTeam,
    };
  });

  rows.sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName));

  let lastTotal: number | null = null;
  let lastRank = 0;
  return rows.map((r, i) => {
    const rank = lastTotal !== null && r.total === lastTotal ? lastRank : i + 1;
    lastTotal = r.total;
    lastRank = rank;
    return { rank, ...r };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- leaderboardView`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/leaderboardView.ts lib/leaderboardView.test.ts
git commit -m "feat: buildLeaderboard view helper + types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: View layer — `buildMyTeams`

**Files:**
- Modify: `lib/leaderboardView.ts` (append a function)
- Test: `lib/leaderboardView.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `lib/leaderboardView.test.ts`:

```ts
import { buildMyTeams } from "@/lib/leaderboardView";

describe("buildMyTeams", () => {
  const board = [
    { id: "t1", name: "Argentina", flag_url: "ar.png" },
    { id: "t2", name: "Japan", flag_url: "jp.png" },
    { id: "t3", name: "USA", flag_url: null },
    { id: "t4", name: "Brazil", flag_url: "br.png" },
  ];

  it("labels champion / eliminated / furthest stage", () => {
    const out = buildMyTeams(
      ["t1", "t2", "t3"],
      board,
      [
        { team_id: "t1", furthest_stage: "final", is_eliminated: false, is_champion: true },
        { team_id: "t2", furthest_stage: "r16", is_eliminated: true, is_champion: false },
        { team_id: "t3", furthest_stage: "qf", is_eliminated: false, is_champion: false },
      ],
    );
    const byName = Object.fromEntries(out.map((t) => [t.name, t.stageLabel]));
    expect(byName).toEqual({ Argentina: "Champion", USA: "Quarter-final", Japan: "Eliminated" });
  });

  it("orders champion first, then alive (deepest first), eliminated last", () => {
    const out = buildMyTeams(
      ["t2", "t3", "t1", "t4"],
      board,
      [
        { team_id: "t1", furthest_stage: "final", is_eliminated: false, is_champion: true },
        { team_id: "t2", furthest_stage: "group", is_eliminated: true, is_champion: false },
        { team_id: "t3", furthest_stage: "qf", is_eliminated: false, is_champion: false },
        { team_id: "t4", furthest_stage: "r16", is_eliminated: false, is_champion: false },
      ],
    );
    expect(out.map((t) => t.name)).toEqual(["Argentina", "USA", "Brazil", "Japan"]);
  });

  it("defaults a team with no standing row to Group / alive", () => {
    const out = buildMyTeams(["t3"], board, []);
    expect(out[0]).toEqual({
      name: "USA", flagUrl: null, stageLabel: "Group", isEliminated: false, isChampion: false,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- leaderboardView`
Expected: FAIL — `buildMyTeams` is not exported.

- [ ] **Step 3: Append the implementation**

Append to `lib/leaderboardView.ts`:

```ts
// The viewer's teams joined with their standings, labelled and ordered for the
// "My teams" panel. Champion first, then still-alive teams (deepest stage
// first), eliminated teams last; alphabetical within a tier.
export function buildMyTeams(
  myTeamIds: string[],
  board: TeamLite[],
  standings: StandingLite[],
): MyTeamStatus[] {
  const teamById = new Map(board.map((t) => [t.id, t]));
  const standingById = new Map(standings.map((s) => [s.team_id, s]));

  const enriched = myTeamIds.map((id) => {
    const t = teamById.get(id);
    const s = standingById.get(id);
    const stage: Stage = s?.furthest_stage ?? "group";
    const isChampion = s?.is_champion ?? false;
    const isEliminated = s?.is_eliminated ?? false;
    const stageLabel = isChampion
      ? "Champion"
      : isEliminated
        ? "Eliminated"
        : STAGE_LABELS[stage];
    const status: MyTeamStatus = {
      name: t?.name ?? "—",
      flagUrl: t?.flag_url ?? null,
      stageLabel,
      isEliminated,
      isChampion,
    };
    // bucket: champion(0) < alive(1) < eliminated(2)
    const bucket = isChampion ? 0 : isEliminated ? 2 : 1;
    return { status, bucket, depth: STAGE_DEPTH[stage] };
  });

  enriched.sort(
    (a, b) =>
      a.bucket - b.bucket ||
      b.depth - a.depth ||
      a.status.name.localeCompare(b.status.name),
  );
  return enriched.map((e) => e.status);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- leaderboardView`
Expected: PASS (all `buildLeaderboard` + `buildMyTeams` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/leaderboardView.ts lib/leaderboardView.test.ts
git commit -m "feat: buildMyTeams view helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: View layer — `buildMatchStrip`

**Files:**
- Modify: `lib/leaderboardView.ts` (append a function)
- Test: `lib/leaderboardView.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `lib/leaderboardView.test.ts`:

```ts
import { buildMatchStrip } from "@/lib/leaderboardView";

describe("buildMatchStrip", () => {
  const teams = [
    { id: "t1", name: "Argentina", flag_url: "ar.png" },
    { id: "t2", name: "Japan", flag_url: "jp.png" },
  ];
  function match(id: string, status: string, kickoff: string, extra = {}) {
    return {
      id, stage: "group", group_letter: "A",
      home_team_id: "t1", away_team_id: "t2",
      kickoff_at: kickoff, home_score: null, away_score: null,
      winner_team_id: null, status, ...extra,
    } as any;
  }

  it("splits finished (recent, newest first) from upcoming (soonest first)", () => {
    const { recent, upcoming } = buildMatchStrip(
      [
        match("m1", "final", "2026-06-11T18:00:00Z", { home_score: 2, away_score: 1 }),
        match("m2", "final", "2026-06-12T18:00:00Z", { home_score: 0, away_score: 0 }),
        match("m3", "scheduled", "2026-06-13T18:00:00Z"),
        match("m4", "scheduled", "2026-06-14T18:00:00Z"),
      ],
      teams,
    );
    expect(recent.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(upcoming.map((m) => m.id)).toEqual(["m3", "m4"]);
    expect(recent[1]).toMatchObject({ homeName: "Argentina", awayName: "Japan", homeScore: 2, awayScore: 1, stageLabel: "Group A" });
  });

  it("honours recent/upcoming counts", () => {
    const ms = [
      match("a", "final", "2026-06-01T00:00:00Z"),
      match("b", "final", "2026-06-02T00:00:00Z"),
      match("c", "final", "2026-06-03T00:00:00Z"),
      match("d", "scheduled", "2026-06-10T00:00:00Z"),
      match("e", "scheduled", "2026-06-11T00:00:00Z"),
    ];
    const { recent, upcoming } = buildMatchStrip(ms, teams, { recent: 2, upcoming: 1 });
    expect(recent.map((m) => m.id)).toEqual(["c", "b"]);
    expect(upcoming.map((m) => m.id)).toEqual(["d"]);
  });

  it("shows TBD for unresolved knockout teams and uses the stage label", () => {
    const { upcoming } = buildMatchStrip(
      [match("k", "scheduled", "2026-07-01T00:00:00Z", { stage: "r16", group_letter: null, home_team_id: null, away_team_id: "t2" })],
      teams,
    );
    expect(upcoming[0]).toMatchObject({ homeName: "TBD", awayName: "Japan", stageLabel: "Round of 16" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- leaderboardView`
Expected: FAIL — `buildMatchStrip` is not exported.

- [ ] **Step 3: Append the implementation**

Append to `lib/leaderboardView.ts`:

```ts
// Compact match strip: the most recent finished results and the next upcoming
// fixtures. Team UUIDs resolve to name/flag (null → "TBD"); group-stage fixtures
// get a "Group X" label, others the stage label.
export function buildMatchStrip(
  matches: MatchLite[],
  teams: TeamLite[],
  opts: { recent?: number; upcoming?: number } = {},
): { recent: MatchStripItem[]; upcoming: MatchStripItem[] } {
  const recentN = opts.recent ?? 5;
  const upcomingN = opts.upcoming ?? 5;
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const ms = (s: string | null) => (s ? new Date(s).getTime() : 0);

  const toItem = (m: MatchLite): MatchStripItem => {
    const home = m.home_team_id ? teamById.get(m.home_team_id) : undefined;
    const away = m.away_team_id ? teamById.get(m.away_team_id) : undefined;
    const stageLabel =
      m.stage === "group" && m.group_letter ? `Group ${m.group_letter}` : STAGE_LABELS[m.stage];
    return {
      id: m.id,
      stageLabel,
      homeName: home?.name ?? "TBD",
      homeFlag: home?.flag_url ?? null,
      awayName: away?.name ?? "TBD",
      awayFlag: away?.flag_url ?? null,
      kickoffAt: m.kickoff_at,
      homeScore: m.home_score,
      awayScore: m.away_score,
      status: m.status,
    };
  };

  const recent = matches
    .filter((m) => m.status === "final")
    .sort((a, b) => ms(b.kickoff_at) - ms(a.kickoff_at))
    .slice(0, recentN)
    .map(toItem);

  const upcoming = matches
    .filter((m) => m.status !== "final")
    .sort((a, b) => ms(a.kickoff_at) - ms(b.kickoff_at))
    .slice(0, upcomingN)
    .map(toItem);

  return { recent, upcoming };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- leaderboardView`
Expected: PASS (all three builders' tests).

- [ ] **Step 5: Commit**

```bash
git add lib/leaderboardView.ts lib/leaderboardView.test.ts
git commit -m "feat: buildMatchStrip view helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `LeaderboardTable` component (client, tap-to-expand)

**Files:**
- Create: `components/leaderboard/LeaderboardTable.tsx`

Presentational client component — no unit test; verified via build in Task 9/10.

- [ ] **Step 1: Create the component**

Create `components/leaderboard/LeaderboardTable.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { LeaderRow } from "@/lib/leaderboardView";
import { pressable, focusRing } from "@/lib/ui";

// Ranked leaderboard. Tapping a row toggles its score breakdown (group/knockout/
// bonus totals + per-team points). The viewer's own row is gold-bordered; the
// leader gets a 🏆 once the tournament is complete.
export default function LeaderboardTable({
  rows,
  complete,
}: {
  rows: LeaderRow[];
  complete: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-bodytext">No scores yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const open = openId === r.userId;
        return (
          <li
            key={r.userId}
            className={`rounded-xl border bg-panel ${r.isSelf ? "border-gold" : "border-glow"}`}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.userId)}
              aria-expanded={open}
              className={`flex w-full items-center gap-3 p-4 text-left ${pressable} ${focusRing}`}
            >
              <span className="w-6 text-center text-sm font-bold text-caption">{r.rank}</span>
              <span className="flex-1 font-bold text-white">
                {complete && r.rank === 1 ? "🏆 " : ""}
                {r.displayName}
                {r.isSelf && <span className="ml-1 text-xs text-caption">(you)</span>}
              </span>
              <span className="text-lg font-bold text-gold">{r.total}</span>
              <span className="text-caption">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
              <div className="border-t border-glow px-4 py-3 text-sm">
                <div className="mb-2 flex gap-4 text-caption">
                  <span>Group <strong className="text-white">{r.group}</strong></span>
                  <span>Knockout <strong className="text-white">{r.knockout}</strong></span>
                  <span>Bonus <strong className="text-white">{r.bonus}</strong></span>
                </div>
                {r.byTeam.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {r.byTeam.map((t, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {t.flagUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.flagUrl} alt="" className="h-4 w-6 rounded-sm object-cover" />
                        )}
                        <span className="flex-1 text-white">{t.name}</span>
                        <span className="text-xs text-caption">{t.phase === "group" ? "group" : "KO"}</span>
                        <span className="font-bold text-gold">+{t.points}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-caption">No team points yet.</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `pressable` + `focusRing` exist in `lib/ui.ts` and the `LeaderRow` import resolves.)

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/LeaderboardTable.tsx
git commit -m "feat: LeaderboardTable component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `MyTeamsPanel` + `MatchStrip` components

**Files:**
- Create: `components/leaderboard/MyTeamsPanel.tsx`
- Create: `components/leaderboard/MatchStrip.tsx`

Presentational; verified via build.

- [ ] **Step 1: Create `MyTeamsPanel`**

Create `components/leaderboard/MyTeamsPanel.tsx`:

```tsx
import type { MyTeamStatus } from "@/lib/leaderboardView";

// The viewer's teams with a status badge: gold for champion, red for eliminated,
// neutral for still-alive (showing the furthest stage reached).
export default function MyTeamsPanel({ teams }: { teams: MyTeamStatus[] }) {
  if (teams.length === 0) return null;
  return (
    <section className="rounded-xl border border-glow bg-panel p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-caption">My teams</h2>
      <ul className="flex flex-col gap-2">
        {teams.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {t.flagUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={t.flagUrl} alt="" className="h-4 w-6 rounded-sm object-cover" />
            )}
            <span className="flex-1 text-white">{t.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                t.isChampion
                  ? "bg-gold text-navy"
                  : t.isEliminated
                    ? "border border-red-400/50 text-red-300"
                    : "border border-glow text-caption"
              }`}
            >
              {t.stageLabel}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Create `MatchStrip`**

Create `components/leaderboard/MatchStrip.tsx`:

```tsx
import type { MatchStripItem } from "@/lib/leaderboardView";

function MatchRow({ m }: { m: MatchStripItem }) {
  const done = m.status === "final";
  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <span className="w-20 shrink-0 text-xs text-caption">{m.stageLabel}</span>
      <span className="flex flex-1 items-center justify-end gap-1 text-white">
        <span className="truncate">{m.homeName}</span>
        {m.homeFlag && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={m.homeFlag} alt="" className="h-3 w-5 rounded-sm object-cover" />
        )}
      </span>
      <span className="shrink-0 font-bold text-gold">
        {done ? `${m.homeScore}–${m.awayScore}` : "v"}
      </span>
      <span className="flex flex-1 items-center gap-1 text-white">
        {m.awayFlag && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={m.awayFlag} alt="" className="h-3 w-5 rounded-sm object-cover" />
        )}
        <span className="truncate">{m.awayName}</span>
      </span>
    </li>
  );
}

// Two stacked cards: most recent finished results, then the next upcoming fixtures.
export default function MatchStrip({
  recent,
  upcoming,
}: {
  recent: MatchStripItem[];
  upcoming: MatchStripItem[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-glow bg-panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Recent results</h2>
        {recent.length > 0 ? (
          <ul className="flex flex-col">{recent.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        ) : (
          <p className="text-sm text-caption">Nothing yet.</p>
        )}
      </div>
      <div className="rounded-xl border border-glow bg-panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Next up</h2>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col">{upcoming.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        ) : (
          <p className="text-sm text-caption">Nothing scheduled.</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/leaderboard/MyTeamsPanel.tsx components/leaderboard/MatchStrip.tsx
git commit -m "feat: MyTeamsPanel + MatchStrip components

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `LeaderboardSummary` component (home card)

**Files:**
- Create: `components/leaderboard/LeaderboardSummary.tsx`

- [ ] **Step 1: Create the component**

Create `components/leaderboard/LeaderboardSummary.tsx`:

```tsx
import type { LeaderRow } from "@/lib/leaderboardView";
import { pressableLink } from "@/lib/ui";

// Compact top-3 leaderboard card for /home, linking to the full /leaderboard.
export default function LeaderboardSummary({ rows }: { rows: LeaderRow[] }) {
  const top = rows.slice(0, 3);
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold">Leaderboard</h2>
      {top.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {top.map((r) => (
            <li key={r.userId} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-center font-bold text-caption">{r.rank}</span>
              <span className={`flex-1 ${r.isSelf ? "font-bold text-white" : "text-bodytext"}`}>
                {r.displayName}
                {r.isSelf && <span className="ml-1 text-xs text-caption">(you)</span>}
              </span>
              <span className="font-bold text-gold">{r.total}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-caption">No scores yet.</p>
      )}
      <a href="/leaderboard" className={`mt-3 inline-block text-sm text-gold underline ${pressableLink}`}>
        Full leaderboard →
      </a>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `pressableLink` exists in `lib/ui.ts`.)

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/LeaderboardSummary.tsx
git commit -m "feat: LeaderboardSummary home card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `/leaderboard` route + middleware

**Files:**
- Create: `app/(app)/leaderboard/page.tsx`
- Modify: `middleware.ts` (add `/leaderboard` to `needsAuth`)

- [ ] **Step 1: Add `/leaderboard` to the auth gate**

In `middleware.ts`, the `needsAuth` expression currently reads:

```ts
  const needsAuth =
    pathname.startsWith("/home") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/predictions") ||
    pathname.startsWith("/managers") ||
    pathname.startsWith("/admin");
```

Add a `/leaderboard` line:

```ts
  const needsAuth =
    pathname.startsWith("/home") ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/predictions") ||
    pathname.startsWith("/managers") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/admin");
```

- [ ] **Step 2: Create the route**

Create `app/(app)/leaderboard/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { pressableLink } from "@/lib/ui";
import type { DraftState } from "@/components/draft/DraftStatus";
import { buildLeaderboard, buildMyTeams, buildMatchStrip } from "@/lib/leaderboardView";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import MyTeamsPanel from "@/components/leaderboard/MyTeamsPanel";
import MatchStrip from "@/components/leaderboard/MatchStrip";

export const dynamic = "force-dynamic"; // always reflect live scores

// Phases where scores exist (predictions lock at kickoff → group_locked).
const LIVE_PHASES = new Set([
  "group_locked",
  "knockout_realloc",
  "knockout_locked",
  "complete",
]);

export default async function LeaderboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: draft } = await supabase.rpc("draft_state");
  const state = (draft as DraftState | null) ?? null;
  const phase = state?.phase ?? "registration";

  if (!LIVE_PHASES.has(phase)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 lg:max-w-3xl">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>← Home</a>
        </header>
        <p className="text-bodytext">
          The tournament hasn&apos;t kicked off yet — check back after the group stage begins.
        </p>
      </main>
    );
  }

  const [
    { data: scores },
    { data: profiles },
    { data: standings },
    { data: matches },
    { data: teams },
  ] = await Promise.all([
    supabase.from("scores").select("user_id, total_points, breakdown"),
    supabase.from("profiles").select("id, display_name"),
    supabase.from("team_standings").select("team_id, furthest_stage, is_eliminated, is_champion"),
    supabase
      .from("matches")
      .select(
        "id, stage, group_letter, home_team_id, away_team_id, kickoff_at, home_score, away_score, winner_team_id, status",
      ),
    supabase.from("teams").select("id, name, flag_url"),
  ]);

  const rows = buildLeaderboard(scores ?? [], profiles ?? [], teams ?? [], user.id);
  const myTeams = buildMyTeams(state?.my_team_ids ?? [], state?.board ?? [], standings ?? []);
  const strip = buildMatchStrip(matches ?? [], teams ?? []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6 pb-20 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{branding.poolName} — Leaderboard</h1>
        <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>← Home</a>
      </header>
      <LeaderboardTable rows={rows} complete={phase === "complete"} />
      <MyTeamsPanel teams={myTeams} />
      <MatchStrip recent={strip.recent} upcoming={strip.upcoming} />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/leaderboard` appears in the route list as `ƒ` (dynamic).

- [ ] **Step 4: Commit**

```bash
git add app/(app)/leaderboard/page.tsx middleware.ts
git commit -m "feat: /leaderboard route + auth gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Home summary integration

**Files:**
- Modify: `app/(app)/home/page.tsx`

Add the top-3 summary card to `/home`, shown only once the tournament is underway. `/home` already computes `revealed = phase !== "registration" && phase !== "draft"`, which is exactly the live-phase set — reuse it.

- [ ] **Step 1: Add imports**

In `app/(app)/home/page.tsx`, after the existing component imports (e.g. after the `MyPicks` import), add:

```ts
import LeaderboardSummary from "@/components/leaderboard/LeaderboardSummary";
import { buildLeaderboard } from "@/lib/leaderboardView";
```

- [ ] **Step 2: Fetch scores + teams in the existing Promise.all**

The current fetch is:

```ts
  const [{ data: me }, { data: players }, { data: cfg }, { data: draft }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase
        .from("profiles")
        .select("id, display_name")
        .order("created_at", { ascending: true }),
      supabase
        .from("game_config")
        .select("predictions_open, predictions_locked_at")
        .eq("id", 1)
        .single(),
      supabase.rpc("draft_state"),
    ]);
```

Replace it with (adds `scores` and `teams`):

```ts
  const [
    { data: me },
    { data: players },
    { data: cfg },
    { data: draft },
    { data: scores },
    { data: teams },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, display_name")
      .order("created_at", { ascending: true }),
    supabase
      .from("game_config")
      .select("predictions_open, predictions_locked_at")
      .eq("id", 1)
      .single(),
    supabase.rpc("draft_state"),
    supabase.from("scores").select("user_id, total_points, breakdown"),
    supabase.from("teams").select("id, name, flag_url"),
  ]);
```

- [ ] **Step 3: Build the summary rows**

Immediately after the existing line `const list = players ?? [];`, add:

```ts
  const summaryRows = revealed
    ? buildLeaderboard(scores ?? [], list, teams ?? [], user.id)
    : [];
```

(`revealed` and `list` are already defined above this point in the component.)

- [ ] **Step 4: Render the card**

Immediately after the `searchParams.error` block (the closing `)}` of the error `<p>`), insert:

```tsx
      {revealed && <LeaderboardSummary rows={summaryRows} />}
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/(app)/home/page.tsx
git commit -m "feat: leaderboard summary card on /home

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: README apply-sequence entry + full verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add migration 0016 to the apply sequence**

In `README.md`, the SQL apply list currently ends with:

```
   16. `supabase/migrations/0015_single_pick_team_categories.sql` — makes Tournament Winner / Runner-Up / Wooden Spoon single-pick (one slot, not two) and clears any stale slot-2 picks on those categories.
```

Add after it:

```
   17. `supabase/migrations/0016_dashboard_rls.sql` — read policies on `scores` / `team_standings` / `matches` so the live dashboard (`/leaderboard` + the home summary) can read them.
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tsc clean; all tests pass (the existing 66 + the new `leaderboardView` tests); build succeeds with `/leaderboard` listed as a dynamic route.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add dashboard RLS migration to apply sequence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done criteria

- `npx tsc --noEmit` clean, `npm test` green (incl. new `leaderboardView` tests), `npm run build` succeeds.
- `/leaderboard` renders the ranked table (tap-to-expand), my-teams panel, and match strip when phase is live; shows the "not kicked off" message otherwise.
- `/home` shows the top-3 summary card once the tournament is underway.
- User has applied `0016_dashboard_rls.sql` in Supabase (without it, the dashboard reads return empty and the leaderboard shows everyone at 0 / no team rows).

## Post-merge (user action)

Apply `supabase/migrations/0016_dashboard_rls.sql` in the Supabase SQL editor. No env vars or redeploy needed beyond the normal Vercel auto-deploy from `main`.
