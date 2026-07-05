// Pure helpers for resolving the "Wooden Spoon — Worst Team" bonus category.
// Managers guess the worst-performing team; the wooden spoon is decided by
// fewest group-stage points, then worst goal difference, then a managers' vote
// (the admin enters the winner). No IO — fed the completed match rows.

export interface SpoonMatch {
  stage: string;
  status: string;
  home_id: string | null;
  home_name: string | null;
  away_id: string | null;
  away_name: string | null;
  home_score: number | null;
  away_score: number | null;
}

export interface WoodenSpoonRow {
  team_id: string;
  name: string;
  played: number;
  points: number;         // 3 win / 1 draw / 0 loss
  goal_difference: number; // goals for − goals against
  goals_for: number;
}

/**
 * Each team's group-stage record from completed ('final') matches, ranked
 * worst-first: fewest points, then worst goal difference, then fewest goals
 * scored, then name (a stable display order — the real tie the vote breaks is
 * only points + goal difference; see woodenSpoonCandidates). Every team plays
 * exactly three group games, so points compare fairly across groups. Only teams
 * with at least one completed group match appear.
 */
export function woodenSpoonStandings(matches: SpoonMatch[]): WoodenSpoonRow[] {
  const rec = new Map<string, WoodenSpoonRow>();
  const ensure = (id: string, name: string) => {
    let r = rec.get(id);
    if (!r) {
      r = { team_id: id, name, played: 0, points: 0, goal_difference: 0, goals_for: 0 };
      rec.set(id, r);
    }
    return r;
  };
  for (const m of matches) {
    if (m.stage !== "group" || m.status !== "final") continue;
    if (!m.home_id || !m.away_id || m.home_score == null || m.away_score == null) continue;
    const h = ensure(m.home_id, m.home_name ?? "");
    const a = ensure(m.away_id, m.away_name ?? "");
    h.played += 1;
    a.played += 1;
    h.goals_for += m.home_score;
    a.goals_for += m.away_score;
    h.goal_difference += m.home_score - m.away_score;
    a.goal_difference += m.away_score - m.home_score;
    if (m.home_score > m.away_score) h.points += 3;
    else if (m.home_score < m.away_score) a.points += 3;
    else {
      h.points += 1;
      a.points += 1;
    }
  }
  return [...rec.values()].sort(
    (x, y) =>
      x.points - y.points ||
      x.goal_difference - y.goal_difference ||
      x.goals_for - y.goals_for ||
      x.name.localeCompare(y.name),
  );
}

/**
 * The wooden-spoon candidate(s): the team(s) level on BOTH fewest points and
 * worst goal difference. A single row is a clear winner; more than one is a
 * genuine tie for the managers' vote to break.
 */
export function woodenSpoonCandidates(rows: WoodenSpoonRow[]): WoodenSpoonRow[] {
  if (rows.length === 0) return [];
  const worst = rows[0];
  return rows.filter(
    (r) => r.points === worst.points && r.goal_difference === worst.goal_difference,
  );
}
