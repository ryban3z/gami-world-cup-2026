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
