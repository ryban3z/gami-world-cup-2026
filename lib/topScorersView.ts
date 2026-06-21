// Pure view-layer helper for the dashboard's top-scorers container. No IO.
// Shapes already-fetched football-data scorers into ranked, render-ready rows.
// Structural "lite" team input decouples lib/ from component types (same pattern
// as leaderboardView.ts / managerProfileView.ts).

import type { MappedScorer } from "@/lib/footballData";

export interface TopScorerRow {
  rank: number;
  playerName: string;
  teamName: string | null;
  flagUrl: string | null;
  goals: number;
  assists: number | null;
  penalties: number | null;
}

interface TeamLite { external_id: string | null; flag_url: string | null; }

// Ranked top scorers. football-data returns the list pre-sorted by goals, but we
// re-sort (goals desc, then assists, then name) so the view never depends on the
// feed's ordering. Ranking is standard competition style — equal goals share a
// rank and the next rank skips (1, 2, 2, 4). Team external_ids resolve to our own
// flag_url so flags match the rest of the dashboard (null when unmapped).
export function buildTopScorers(
  scorers: MappedScorer[],
  teams: TeamLite[],
  limit = 10,
): TopScorerRow[] {
  const flagByExt = new Map(
    teams.filter((t) => t.external_id).map((t) => [t.external_id as string, t.flag_url]),
  );

  const sorted = [...scorers].sort(
    (a, b) =>
      b.goals - a.goals ||
      (b.assists ?? 0) - (a.assists ?? 0) ||
      a.playerName.localeCompare(b.playerName),
  );

  let lastGoals: number | null = null;
  let lastRank = 0;
  return sorted.slice(0, limit).map((s, i) => {
    const rank = lastGoals !== null && s.goals === lastGoals ? lastRank : i + 1;
    lastGoals = s.goals;
    lastRank = rank;
    return {
      rank,
      playerName: s.playerName,
      teamName: s.teamName,
      flagUrl: (s.teamExternalId && flagByExt.get(s.teamExternalId)) || null,
      goals: s.goals,
      assists: s.assists,
      penalties: s.penalties,
    };
  });
}
