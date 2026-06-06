// Pure view-layer helpers for a manager's profile page. No IO. Shapes the
// already-fetched profile/roster/prediction data into a render-ready view model.
// Structural "lite" types decouple lib/ from the richer BoardTeam/Roster types
// declared in components/draft/DraftStatus.

interface RosterLite {
  user_id: string;
  team_ids: string[];
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

export interface ManagerProfileInput {
  displayName: string;
  summary: string | null;
  isSelf: boolean;
  targetUserId: string;
  rosters: RosterLite[] | null; // from draft_state(); null until the reveal
  board: BoardTeamLite[];
  predictionsLockedAt: string | null;
  categories: CategoryLite[]; // active categories, in display order
  predictions: PredictionLite[]; // this manager's active picks
}

export interface ProfileTeam {
  name: string;
  flagUrl: string | null;
}

export interface CategoryPicks {
  categoryName: string;
  picks: string[];
}

export interface ManagerProfileView {
  displayName: string;
  summary: string | null;
  isSelf: boolean;
  rosterVisible: boolean;
  teams: ProfileTeam[];
  predictionsVisible: boolean;
  predictionsByCategory: CategoryPicks[];
}

export function buildManagerProfileView(input: ManagerProfileInput): ManagerProfileView {
  const {
    displayName, summary, isSelf, targetUserId,
    rosters, board, predictionsLockedAt, categories, predictions,
  } = input;

  const trimmed = summary?.trim();
  const cleanSummary = trimmed ? trimmed : null;

  // Roster is revealed once draft_state() returns a (non-null) rosters array.
  const rosterVisible = rosters !== null;
  const byId = new Map(board.map((t) => [t.id, t]));
  const row = rosters?.find((r) => r.user_id === targetUserId) ?? null;
  const teams: ProfileTeam[] = row
    ? row.team_ids.map((id) => {
        const t = byId.get(id);
        return { name: t?.name ?? "—", flagUrl: t?.flag_url ?? null };
      })
    : [];

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
    isSelf,
    rosterVisible,
    teams,
    predictionsVisible,
    predictionsByCategory,
  };
}
