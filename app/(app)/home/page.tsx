import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { pressable, pressableLink } from "@/lib/ui";
import { signOut } from "../../(auth)/actions";
import { makePick } from "../draft/actions";
import DraftStatus, { type DraftState } from "@/components/draft/DraftStatus";
import DraftBoard from "@/components/draft/DraftBoard";
import Rosters from "@/components/draft/Rosters";
import TurnBanner from "@/components/draft/TurnBanner";
import DraftOrderRail from "@/components/draft/DraftOrderRail";
import MyPicks from "@/components/draft/MyPicks";

export const dynamic = "force-dynamic"; // always reflect live game state

export default async function HomePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: players }, { data: cfg }, { data: draft }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase
        .from("profiles")
        .select("id, display_name")
        .order("created_at", { ascending: true }),
      supabase
        .from("game_config")
        .select("predictions_open, predictions_locked_at")
        .eq("id", 1)
        .single(),
      supabase.rpc("draft_state"),
    ]);

  const state = (draft as DraftState | null) ?? null;
  const phase = state?.phase ?? "registration";
  const inRegistration = phase === "registration";
  const revealed = phase !== "registration" && phase !== "draft";
  const predictionsStarted =
    (cfg?.predictions_open ?? false) || cfg?.predictions_locked_at != null;
  const list = players ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-28 lg:max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">{branding.poolName}</h1>
        <p className="mt-1 text-bodytext">
          Welcome, <strong className="text-white">{me?.display_name ?? "player"}</strong>.
        </p>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}

      {state && phase === "draft" ? (
        <>
          <TurnBanner
            isMyTurn={state.is_my_turn}
            currentUserName={state.current_user_name}
            picksMade={state.picks_made}
            picksTotal={state.picks_total}
            playerCount={state.order_names.length}
          />
          <DraftOrderRail
            orderNames={state.order_names}
            picksMade={state.picks_made}
            playerCount={state.order_names.length}
          />
          <MyPicks
            myTeamIds={state.my_team_ids}
            board={state.board}
            slotCount={state.picks_total / state.order_names.length}
            isMyTurn={state.is_my_turn}
          />
        </>
      ) : (
        state && <DraftStatus state={state} />
      )}

      {state?.is_admin && (
        <a
          href="/admin"
          className={`inline-block self-start rounded-full border border-gold/60 px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-navy ${pressable}`}
        >
          ⚙ Admin
        </a>
      )}

      {predictionsStarted && (
        <a
          href="/predictions"
          className={`inline-block rounded-full border border-gold px-6 py-3 text-center text-sm font-bold uppercase tracking-wide text-gold hover:bg-gold hover:text-navy ${pressable}`}
        >
          Bonus predictions →
        </a>
      )}

      {state && (phase === "draft" || revealed) && (
        <DraftBoard
          board={state.board}
          isMyTurn={state.is_my_turn}
          myTeamIds={state.my_team_ids}
          revealed={revealed}
          makePick={makePick}
        />
      )}

      {revealed && state?.rosters && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Rosters</h2>
          <Rosters rosters={state.rosters} board={state.board} />
        </section>
      )}

      {/* Who's in — most useful before the draft kicks off. */}
      {inRegistration && (
        <section className="rounded-xl border border-glow bg-panel p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gold">
            Players registered ({list.length})
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="text-gold">●</span>
                <span className="text-white">{p.display_name}</span>
                {p.id === user.id && <span className="text-caption">(you)</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={signOut}>
        <button className={`text-sm text-caption underline ${pressableLink}`}>Sign out</button>
      </form>
    </main>
  );
}
