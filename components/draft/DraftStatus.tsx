// Shape of the JSON returned by the draft_state() RPC.
export interface BoardTeam {
  id: string;
  name: string;
  group_letter: string | null;
  flag_url: string | null;
  taken: boolean;
  owner_name: string | null; // null while phase = 'draft'
}

export interface Roster {
  user_id: string;
  display_name: string;
  team_ids: string[]; // current roster (kept + claimed), in display order
  // Knockout-swap markers (empty before the swap locks): free agents picked up,
  // and group teams given up. See draft_state() / buildRosterCardTeams.
  claimed_team_ids?: string[];
  dropped_team_ids?: string[];
}

export interface DraftState {
  phase:
    | "registration"
    | "draft"
    | "group_locked"
    | "knockout_realloc"
    | "knockout_locked"
    | "complete";
  is_admin: boolean;
  current_user_id: string | null;
  current_user_name: string | null;
  is_my_turn: boolean;
  picks_made: number;
  picks_total: number;
  order_names: string[];
  my_team_ids: string[];
  board: BoardTeam[];
  rosters: Roster[] | null;
}

export default function DraftStatus({ state }: { state: DraftState }) {
  const { phase } = state;

  if (phase === "registration") {
    return (
      <p className="text-bodytext">
        The draft hasn&apos;t started yet. Once the admin opens it, come back here to pick.
      </p>
    );
  }

  // group_locked and beyond (the draft phase is handled by TurnBanner on /home)
  const message =
    phase === "group_locked"
      ? "Group stage underway — every goal counts. ⚽"
      : phase === "knockout_realloc"
        ? "Knockout swap window's open. 🔄"
        : phase === "knockout_locked"
          ? "Knockout football is here. ⚡"
          : "Full time — champions crowned. 🏆";
  return <p className="text-lg font-bold text-gold">{message}</p>;
}
