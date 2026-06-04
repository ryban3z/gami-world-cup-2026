import DraftBoard from "@/components/draft/DraftBoard";
import TurnBanner from "@/components/draft/TurnBanner";
import DraftOrderRail from "@/components/draft/DraftOrderRail";
import MyPicks from "@/components/draft/MyPicks";
import type { DraftState, BoardTeam } from "@/components/draft/DraftStatus";

// ---------------------------------------------------------------------------
// PREVIEW-ONLY PAGE. Public, unlinked, fake data — lets us eyeball the
// draft-night dashboard UI without putting the real game into the draft phase.
// Renders the actual components (TurnBanner / DraftOrderRail / MyPicks /
// DraftBoard) from hardcoded mock state. Not part of the real app flow.
// Safe to delete once the draft has been run for real.
// ---------------------------------------------------------------------------

export const dynamic = "force-static";

// No-op stand-in for the real makePick server action — the board is a static
// mock here, so confirming a pick just closes the confirm bar.
async function previewPick(_teamId: string) {
  "use server";
}

const ORDER = ["Deano", "Priya", "You", "Tomek", "Sam", "Aziz"];

const BOARD: BoardTeam[] = [
  { id: "ar", name: "Argentina", group_letter: "C", flag_url: "https://flagcdn.com/w40/ar.png", taken: false, owner_name: null },
  { id: "sa", name: "Saudi Arabia", group_letter: "C", flag_url: "https://flagcdn.com/w40/sa.png", taken: true, owner_name: null },
  { id: "mx", name: "Mexico", group_letter: "C", flag_url: "https://flagcdn.com/w40/mx.png", taken: false, owner_name: null },
  { id: "pl", name: "Poland", group_letter: "C", flag_url: "https://flagcdn.com/w40/pl.png", taken: false, owner_name: null },
  { id: "fr", name: "France", group_letter: "D", flag_url: "https://flagcdn.com/w40/fr.png", taken: false, owner_name: null },
  { id: "dk", name: "Denmark", group_letter: "D", flag_url: "https://flagcdn.com/w40/dk.png", taken: true, owner_name: null },
  { id: "au", name: "Australia", group_letter: "D", flag_url: "https://flagcdn.com/w40/au.png", taken: false, owner_name: null },
  { id: "tn", name: "Tunisia", group_letter: "D", flag_url: "https://flagcdn.com/w40/tn.png", taken: true, owner_name: null },
];

// Scenario A — it's YOUR turn. Reversed (round 2) snake, you on the clock,
// one team already in hand (Denmark), picking your 2nd.
const YOUR_TURN: DraftState = {
  phase: "draft",
  is_admin: false,
  current_user_id: "you",
  current_user_name: "You",
  is_my_turn: true,
  picks_made: 9,
  picks_total: 18,
  order_names: ORDER,
  my_team_ids: ["dk"],
  board: BOARD,
  rosters: null,
};

// Scenario B — waiting on someone else (round 1, forward).
const WAITING: DraftState = {
  ...YOUR_TURN,
  current_user_id: "sam",
  current_user_name: "Sam",
  is_my_turn: false,
  picks_made: 4,
};

function Section({ state, withBoard }: { state: DraftState; withBoard?: boolean }) {
  const playerCount = state.order_names.length;
  return (
    <div className="flex flex-col gap-5">
      <TurnBanner
        isMyTurn={state.is_my_turn}
        currentUserName={state.current_user_name}
        picksMade={state.picks_made}
        picksTotal={state.picks_total}
        playerCount={playerCount}
      />
      <DraftOrderRail
        orderNames={state.order_names}
        picksMade={state.picks_made}
        playerCount={playerCount}
      />
      <MyPicks
        myTeamIds={state.my_team_ids}
        board={state.board}
        slotCount={state.picks_total / playerCount}
        isMyTurn={state.is_my_turn}
      />
      {withBoard && (
        <DraftBoard
          board={state.board}
          isMyTurn={state.is_my_turn}
          myTeamIds={state.my_team_ids}
          revealed={false}
          makePick={previewPick}
        />
      )}
    </div>
  );
}

export default function DraftPreviewPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 p-6 pb-28 lg:max-w-4xl">
      <header className="rounded-lg border border-dashed border-gold/50 bg-panel/40 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gold">Preview · mock data</p>
        <p className="mt-1 text-xs text-caption">
          The draft-night dashboard with fake players. Non-interactive — tapping a team and
          confirming does nothing here. Not the live game.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-bodytext">Scenario · your turn</h2>
        <Section state={YOUR_TURN} withBoard />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-bodytext">Scenario · waiting on someone</h2>
        <Section state={WAITING} />
      </section>
    </main>
  );
}
