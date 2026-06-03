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
  team_ids: string[];
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
  const { phase, is_my_turn, current_user_name, picks_made, picks_total } = state;

  if (phase === "registration") {
    return (
      <p className="text-bodytext">
        The draft hasn&apos;t started yet. Once the admin opens it, come back here to pick.
      </p>
    );
  }

  if (phase === "draft") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold">
          {is_my_turn ? (
            <span className="text-gold">It&apos;s YOUR turn — pick a team</span>
          ) : (
            <>Waiting on <span className="text-white">{current_user_name}</span>…</>
          )}
        </p>
        <p className="text-sm text-caption">Pick {picks_made + 1} of {picks_total}</p>
      </div>
    );
  }

  // group_locked and beyond
  return (
    <p className="text-lg font-bold text-gold">
      Draft complete — all {picks_total} picks are in. Rosters revealed below.
    </p>
  );
}
