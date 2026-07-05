// Pure view-layer helpers for the knockout re-allocation window. No IO. The
// reverse-standings pick order is the single source of truth, mirrored by the
// SQL in open_knockout_realloc() / resolve_knockout_realloc().

export interface StandingSnapshotRow {
  user_id: string;
  total_points: number;
  /** Aggregate goal difference across the manager's teams (higher = better). */
  goal_difference?: number;
  /**
   * Admin-entered manual tiebreak, used only when points AND goal difference
   * are level. Lower picks earlier; 0 (the default) means "unset".
   */
  tiebreak?: number;
}

/**
 * The knockout free-agent pick order: worst-placed manager picks first. The
 * ranking is decided by (1) fewest total_points, then (2) worst goal
 * difference, then (3) the admin-entered manual tiebreak (lower picks first),
 * and finally (4) reverse draft order (a later original draft slot — a higher
 * index in draftOrder — picks earlier) as a deterministic backstop. Returns
 * profile ids best-to-worst priority (i.e. first id picks first). Mirrors the
 * SQL in resolve_knockout_realloc().
 */
export function reallocPickOrder(
  rows: StandingSnapshotRow[],
  draftOrder: string[],
): string[] {
  const draftIdx = new Map(draftOrder.map((id, i) => [id, i]));
  return [...rows]
    .sort((a, b) => {
      if (a.total_points !== b.total_points) return a.total_points - b.total_points; // fewest points first
      const gdA = a.goal_difference ?? 0;
      const gdB = b.goal_difference ?? 0;
      if (gdA !== gdB) return gdA - gdB;                                              // worst GD first
      const tbA = a.tiebreak ?? 0;
      const tbB = b.tiebreak ?? 0;
      if (tbA !== tbB) return tbA - tbB;                                              // admin tiebreak, lower first
      return (draftIdx.get(b.user_id) ?? -1) - (draftIdx.get(a.user_id) ?? -1);       // later slot first
    })
    .map((r) => r.user_id);
}

/**
 * The set of manager ids that are in a genuine pick-order tie — level with at
 * least one other manager on BOTH total_points and goal difference, so the
 * automatic order can't separate them and an admin tiebreak is needed.
 */
export function knockoutTiedManagerIds(rows: StandingSnapshotRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.total_points}|${r.goal_difference ?? 0}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const tied = new Set<string>();
  for (const r of rows) {
    const key = `${r.total_points}|${r.goal_difference ?? 0}`;
    if ((counts.get(key) ?? 0) > 1) tied.add(r.user_id);
  }
  return tied;
}

// Structural subset of a team needed for the free-agent / roster lists.
export interface TeamLite {
  id: string;
  name: string;
  flag_url: string | null;
  group_letter: string | null;
}

/**
 * Free agents grouped by their group letter (A–L) for a tidy display, each
 * group's teams kept in the incoming order. Teams with no group letter fall
 * under "?".
 */
export function freeAgentsByGroup(teams: TeamLite[]): { letter: string; teams: TeamLite[] }[] {
  const byLetter = new Map<string, TeamLite[]>();
  for (const t of teams) {
    const letter = t.group_letter ?? "?";
    const list = byLetter.get(letter) ?? [];
    list.push(t);
    byLetter.set(letter, list);
  }
  return [...byLetter.keys()]
    .sort()
    .map((letter) => ({ letter, teams: byLetter.get(letter)! }));
}
