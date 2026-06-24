// Pure view-layer helpers for the knockout re-allocation window. No IO. The
// reverse-standings pick order is the single source of truth, mirrored by the
// SQL in open_knockout_realloc() / resolve_knockout_realloc().

export interface StandingSnapshotRow {
  user_id: string;
  total_points: number;
}

/**
 * The knockout free-agent pick order: worst-placed manager (fewest
 * total_points) picks first, ties broken by reverse draft order (a later
 * original draft slot — a higher index in draftOrder — picks earlier). Returns
 * profile ids best-to-worst priority (i.e. first id picks first).
 */
export function reallocPickOrder(
  rows: StandingSnapshotRow[],
  draftOrder: string[],
): string[] {
  const draftIdx = new Map(draftOrder.map((id, i) => [id, i]));
  return [...rows]
    .sort((a, b) => {
      if (a.total_points !== b.total_points) return a.total_points - b.total_points; // worst first
      return (draftIdx.get(b.user_id) ?? -1) - (draftIdx.get(a.user_id) ?? -1);       // later slot first
    })
    .map((r) => r.user_id);
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
