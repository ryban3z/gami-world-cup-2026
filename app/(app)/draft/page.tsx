import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { makePick } from "./actions";
import DraftStatus, { type DraftState } from "@/components/draft/DraftStatus";
import DraftBoard from "@/components/draft/DraftBoard";
import Rosters from "@/components/draft/Rosters";
import AdminControls from "@/components/draft/AdminControls";

export const dynamic = "force-dynamic"; // always reflect live draft state

export default async function DraftPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("draft_state");
  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
        <h1 className="text-2xl font-bold">Draft</h1>
        <p className="text-red-400">Couldn&apos;t load the draft: {error?.message ?? "no data"}</p>
      </main>
    );
  }
  const state = data as DraftState;
  const revealed = state.phase !== "registration" && state.phase !== "draft";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-28">
      <header>
        <h1 className="text-2xl font-bold">The Draft</h1>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}

      <DraftStatus state={state} />

      {state.is_admin && (
        <AdminControls phase={state.phase} currentUserName={state.current_user_name} />
      )}

      {(state.phase === "draft" || revealed) && (
        <DraftBoard
          board={state.board}
          isMyTurn={state.is_my_turn}
          myTeamIds={state.my_team_ids}
          revealed={revealed}
          makePick={makePick}
        />
      )}

      {revealed && state.rosters && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Rosters</h2>
          <Rosters rosters={state.rosters} board={state.board} />
        </section>
      )}
    </main>
  );
}
