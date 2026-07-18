// Pure view logic for the end-of-tournament "Final results" page (/results),
// shown once the game reaches the `complete` phase. No IO — it shapes
// already-fetched, already-ranked data into the winners view model. The full
// ranked standings come from buildLeaderboard (leaderboardView.ts); this layer
// pulls out the celebratory bits: the pool podium + champion, the wooden-spoon
// manager (last place), the World Cup champion team + who owned it, and which
// managers nailed each resolved bonus category.

import type { LeaderRow } from "@/lib/leaderboardView";
import { TEAM_PICK_KEYS, normalizeAnswer } from "@/lib/scoring";

// ---- inputs (structural "lite" types, decoupled from component/db types) ----
interface StandingLite {
  team_id: string;
  is_champion: boolean;
}
interface TeamLite {
  id: string;
  name: string;
  flag_url: string | null;
}
interface KnockoutOwnerLite {
  team_id: string;
  user_id: string;
}
interface ProfileLite {
  id: string;
  display_name: string;
}
interface CategoryLite {
  id: string;
  key: string;
  name: string;
  resolved_answer: string | null;
}
interface PredictionLite {
  user_id: string;
  category_id: string;
  pick_value: string;
}

// ---- output view model ----
export interface PodiumEntry {
  rank: number; // 1 | 2 | 3
  displayName: string;
  avatarUrl: string | null;
  total: number;
  isSelf: boolean;
}
export interface ChampionTeamView {
  name: string;
  flagUrl: string | null;
  ownerName: string | null; // manager who held it in the knockout phase (null = unowned/dropped)
  ownerIsSelf: boolean;
}
export interface BonusHighlight {
  categoryName: string;
  answer: string; // resolved answer, team names resolved for team-pick categories
  winners: string[]; // display names of managers who called it (sorted)
}
export interface FinalResults {
  // Top three by rank (ties share a rank, so a shared 1st can push 3rd off —
  // podium keeps everyone with rank ≤ 3). Empty until scores exist.
  podium: PodiumEntry[];
  // Rank-1 manager display names — usually one, more if the top is tied.
  champions: string[];
  // Last-place manager display names (lowest total). Empty when <2 managers.
  woodenSpoon: string[];
  // The World Cup winning country + owning manager, null before the final.
  championTeam: ChampionTeamView | null;
  // One row per resolved bonus category, in the given category order.
  bonusHighlights: BonusHighlight[];
}

// Builds the final-results view model. `rows` must already be ranked
// (buildLeaderboard output). Everything else is raw fetched data.
export function buildFinalResults(
  rows: LeaderRow[],
  standings: StandingLite[],
  teams: TeamLite[],
  knockoutOwners: KnockoutOwnerLite[],
  profiles: ProfileLite[],
  categories: CategoryLite[],
  predictions: PredictionLite[],
): FinalResults {
  const podium: PodiumEntry[] = rows
    .filter((r) => r.rank <= 3)
    .map((r) => ({
      rank: r.rank,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      total: r.total,
      isSelf: r.isSelf,
    }));

  const champions = rows.filter((r) => r.rank === 1).map((r) => r.displayName);

  // Wooden-spoon manager: the lowest total. Only meaningful with ≥2 managers
  // (nobody "loses" a one-player pool). Ties → everyone on the bottom total.
  let woodenSpoon: string[] = [];
  if (rows.length >= 2) {
    const lowest = Math.min(...rows.map((r) => r.total));
    woodenSpoon = rows.filter((r) => r.total === lowest).map((r) => r.displayName);
  }

  // World Cup champion team + owning manager (knockout-phase ownership).
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const nameByUser = new Map(profiles.map((p) => [p.id, p.display_name]));
  const koOwnerByTeam = new Map(knockoutOwners.map((o) => [o.team_id, o.user_id]));
  const selfId = rows.find((r) => r.isSelf)?.userId ?? null;
  const championStanding = standings.find((s) => s.is_champion);
  let championTeam: ChampionTeamView | null = null;
  if (championStanding) {
    const t = teamById.get(championStanding.team_id);
    const ownerId = koOwnerByTeam.get(championStanding.team_id) ?? null;
    championTeam = {
      name: t?.name ?? "—",
      flagUrl: t?.flag_url ?? null,
      ownerName: ownerId ? nameByUser.get(ownerId) ?? null : null,
      ownerIsSelf: ownerId != null && ownerId === selfId,
    };
  }

  // Bonus highlights: for each resolved category, who picked the right answer.
  // Reuses the scoring engine's matching rules (team-pick → exact id compare,
  // free text → normalizeAnswer) so this never drifts from awarded points.
  const predsByCat = new Map<string, PredictionLite[]>();
  for (const p of predictions) {
    const list = predsByCat.get(p.category_id) ?? [];
    list.push(p);
    predsByCat.set(p.category_id, list);
  }
  const bonusHighlights: BonusHighlight[] = [];
  for (const cat of categories) {
    if (!cat.resolved_answer) continue;
    const isTeamPick = TEAM_PICK_KEYS.has(cat.key);
    const answerRaw = cat.resolved_answer.trim();
    const answer = isTeamPick ? teamById.get(answerRaw)?.name ?? answerRaw : answerRaw;
    const winnerIds = new Set<string>();
    for (const p of predsByCat.get(cat.id) ?? []) {
      const hit = isTeamPick
        ? p.pick_value.trim() === answerRaw
        : normalizeAnswer(p.pick_value) === normalizeAnswer(cat.resolved_answer);
      if (hit) winnerIds.add(p.user_id);
    }
    const winners = [...winnerIds]
      .map((id) => nameByUser.get(id) ?? "—")
      .sort((a, b) => a.localeCompare(b));
    bonusHighlights.push({ categoryName: cat.name, answer, winners });
  }

  return { podium, champions, woodenSpoon, championTeam, bonusHighlights };
}
