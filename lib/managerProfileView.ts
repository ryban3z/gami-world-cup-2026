// Pure view-layer helpers for a manager's profile page. No IO. Shapes the
// already-fetched profile/roster/prediction data into a render-ready view model.
// Structural "lite" types decouple lib/ from the richer BoardTeam/Roster types
// declared in components/draft/DraftStatus.

import { buildRosterCardTeams, type RosterTeamStatus } from "./leaderboardView";

interface RosterLite {
  user_id: string;
  team_ids: string[];
  claimed_team_ids?: string[];
  dropped_team_ids?: string[];
}

interface BoardTeamLite {
  id: string;
  name: string;
  flag_url: string | null;
}

interface CategoryLite {
  id: string;
  name: string;
}

interface PredictionLite {
  category_id: string;
  pick_slot: number;
  pick_value: string;
}

interface ScoreLite {
  total_points: number;
  breakdown: {
    group: number;
    group_qualify?: number;
    group_win?: number;
    knockout: number;
    bonus: number;
    by_team: { team: string; phase: "group" | "knockout"; points: number }[];
  };
}

export interface ManagerProfileInput {
  displayName: string;
  summary: string | null;
  avatarUrl: string | null;
  isSelf: boolean;
  targetUserId: string;
  rosters: RosterLite[] | null; // from draft_state(); null until the reveal
  board: BoardTeamLite[];
  predictionsLockedAt: string | null;
  categories: CategoryLite[]; // active categories, in display order
  predictions: PredictionLite[]; // this manager's active picks
  score: ScoreLite | null; // this manager's score row; null until they've scored
}

export interface ProfileTeam {
  name: string;
  flagUrl: string | null;
  points: number; // accumulated points from this team (all ownership phases)
  status: RosterTeamStatus; // kept / claimed (NEW) / dropped — knockout swap markers
}

export interface ManagerPoints {
  total: number;
  group: number;
  groupQualify: number;
  groupWin: number;
  knockout: number;
  bonus: number;
}

export interface CategoryPicks {
  categoryName: string;
  picks: string[];
}

export interface ManagerProfileView {
  displayName: string;
  summary: string | null;
  avatarUrl: string | null;
  initials: string;
  isSelf: boolean;
  rosterVisible: boolean;
  teams: ProfileTeam[];
  predictionsVisible: boolean;
  predictionsByCategory: CategoryPicks[];
  points: ManagerPoints;
}

export function buildManagerProfileView(input: ManagerProfileInput): ManagerProfileView {
  const {
    displayName, summary, avatarUrl, isSelf, targetUserId,
    rosters, board, predictionsLockedAt, categories, predictions, score,
  } = input;

  const trimmed = summary?.trim();
  const cleanSummary = trimmed ? trimmed : null;

  const cleanAvatar = avatarUrl?.trim() ? avatarUrl.trim() : null;
  // Up to two initials for the no-photo fallback: first letters of the first
  // two whitespace-separated words, else the first two letters of a single word.
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const initials = (
    words.length > 1
      ? words[0][0] + words[1][0]
      : (words[0] ?? "?").slice(0, 2)
  ).toUpperCase();

  // Per-team points: sum every by_team entry for a team id (a team can score in
  // both the group and knockout ownership phases, though only one manager owns
  // each phase). Teams with no entry default to 0.
  const pointsByTeam = new Map<string, number>();
  for (const bt of score?.breakdown.by_team ?? []) {
    pointsByTeam.set(bt.team, (pointsByTeam.get(bt.team) ?? 0) + bt.points);
  }

  // Roster is revealed once draft_state() returns a (non-null) rosters array.
  const rosterVisible = rosters !== null;
  const byId = new Map(board.map((t) => [t.id, t]));
  const row = rosters?.find((r) => r.user_id === targetUserId) ?? null;
  const teams: ProfileTeam[] = row
    ? buildRosterCardTeams(row).map(({ teamId: id, status }) => {
        const t = byId.get(id);
        return {
          name: t?.name ?? "—",
          flagUrl: t?.flag_url ?? null,
          points: pointsByTeam.get(id) ?? 0,
          status,
        };
      })
    : [];

  const points: ManagerPoints = {
    total: score?.total_points ?? 0,
    group: score?.breakdown.group ?? 0,
    groupQualify: score?.breakdown.group_qualify ?? 0,
    groupWin: score?.breakdown.group_win ?? 0,
    knockout: score?.breakdown.knockout ?? 0,
    bonus: score?.breakdown.bonus ?? 0,
  };

  // Others' predictions are visible only after the kickoff lock; your own always are.
  const predictionsVisible = predictionsLockedAt !== null || isSelf;
  const predictionsByCategory: CategoryPicks[] = predictionsVisible
    ? categories
        .map((cat) => ({
          categoryName: cat.name,
          picks: predictions
            .filter((p) => p.category_id === cat.id)
            .sort((a, b) => a.pick_slot - b.pick_slot)
            .map((p) => p.pick_value),
        }))
        .filter((c) => c.picks.length > 0)
    : [];

  return {
    displayName,
    summary: cleanSummary,
    avatarUrl: cleanAvatar,
    initials,
    isSelf,
    rosterVisible,
    teams,
    predictionsVisible,
    predictionsByCategory,
    points,
  };
}
