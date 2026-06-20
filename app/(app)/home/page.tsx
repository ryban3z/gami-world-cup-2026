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
import LeaderboardSummary from "@/components/leaderboard/LeaderboardSummary";
import MatchStrip from "@/components/leaderboard/MatchStrip";
import { buildLeaderboard, buildMatchStrip, buildRosterTeamPoints } from "@/lib/leaderboardView";
import { bonusPicksComplete } from "@/lib/predictions";

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

  const [
    { data: me },
    { data: players },
    { data: cfg },
    { data: draft },
    { data: scores },
    { data: teams },
    { data: matches },
    { data: bonusCategories },
    { data: myPicks },
    { data: standings },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .order("created_at", { ascending: true }),
    supabase
      .from("game_config")
      .select("predictions_open, predictions_locked_at")
      .eq("id", 1)
      .single(),
    supabase.rpc("draft_state"),
    supabase.from("scores").select("user_id, total_points, breakdown"),
    supabase.from("teams").select("id, name, flag_url"),
    supabase
      .from("matches")
      .select(
        "id, stage, group_letter, home_team_id, away_team_id, kickoff_at, home_score, away_score, winner_team_id, status",
      ),
    supabase.from("bonus_categories").select("id, key").eq("is_active", true),
    supabase
      .from("bonus_predictions")
      .select("category_id, pick_value")
      .eq("user_id", user.id),
    supabase.from("team_standings").select("team_id, qualified"),
  ]);

  const state = (draft as DraftState | null) ?? null;
  const phase = state?.phase ?? "registration";
  const inRegistration = phase === "registration";
  const revealed = phase !== "registration" && phase !== "draft";
  const predictionsOpen = cfg?.predictions_open ?? false;
  const predictionsStarted =
    predictionsOpen || cfg?.predictions_locked_at != null;
  // Bonus-pick progress for the home CTA: nudge harder while the window is open
  // and the picks aren't all in; show a tick once they're complete.
  const picksComplete = bonusPicksComplete(bonusCategories ?? [], myPicks ?? []);
  // Manager profiles unlock when bonus picks lock — until then roster cards
  // aren't clickable and the /managers/[id] route redirects home. Admins get an
  // early bypass so they can preview/proofread every profile before the reveal.
  const isAdmin = state?.is_admin ?? false;
  const predictionsLocked = cfg?.predictions_locked_at != null;
  const profilesUnlocked = predictionsLocked || isAdmin;
  const list = players ?? [];
  const summaryRows = revealed
    ? buildLeaderboard(scores ?? [], list, teams ?? [], user.id)
    : [];
  // Recent/upcoming match strip — live phases only. Shows the last 5 results
  // and next 5 fixtures; the full strip stays on /leaderboard.
  const strip = revealed
    ? buildMatchStrip(matches ?? [], teams ?? [], {
        recent: 5,
        upcoming: 5,
        ownership: state?.rosters ? { rosters: state.rosters, profiles: list } : undefined,
      })
    : null;
  // Per-team points for the roster cards (keyed `${userId}::${teamId}`).
  const rosterTeamPoints = revealed ? buildRosterTeamPoints(scores ?? []) : {};
  // Teams that have clinched a knockout spot — drives the "Qualified" marker on
  // the roster cards (same flag as the leaderboard "My teams" panel).
  const qualifiedTeamIds = revealed
    ? new Set((standings ?? []).filter((s) => s.qualified).map((s) => s.team_id))
    : new Set<string>();

  // Bonus-predictions CTA: while the window is open, nudge hard if picks are
  // incomplete (filled urgent button) or confirm with a tick if done. Once
  // locked, picks can't change — fall back to a neutral "view everyone's" link.
  const predUrgent = predictionsOpen && !predictionsLocked && !picksComplete;
  const predLabel = predictionsLocked
    ? "Bonus predictions →"
    : picksComplete
      ? "Bonus predictions ✓ all picks in"
      : "Make your bonus picks — clock is ticking! ⏰";
  const predClass = predUrgent
    ? `inline-block rounded-full bg-gold px-6 py-3 text-center text-sm font-bold uppercase tracking-wide text-navy hover:brightness-110 ${pressable}`
    : `inline-block rounded-full border border-gold px-6 py-3 text-center text-sm font-bold uppercase tracking-wide text-gold hover:bg-gold hover:text-navy ${pressable}`;

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

      {state && phase !== "draft" && <DraftStatus state={state} />}

      {revealed && <LeaderboardSummary rows={summaryRows} />}

      {state && phase === "draft" && (
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
      )}

      {/* The A–L group grid is the draft pick interface — only needed while the
          draft is live. Post-draft, ownership is shown by manager in Rosters below. */}
      {state && phase === "draft" && (
        <DraftBoard
          board={state.board}
          isMyTurn={state.is_my_turn}
          myTeamIds={state.my_team_ids}
          revealed={revealed}
          makePick={makePick}
        />
      )}

      {revealed && strip && <MatchStrip recent={strip.recent} upcoming={strip.upcoming} />}

      {revealed && state?.rosters && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Rosters</h2>
          {!predictionsLocked && (
            <p className="text-xs text-caption">
              {isAdmin
                ? "Admin preview — profiles are clickable for you, but stay sealed for everyone else until bonus picks lock."
                : "Manager profiles unlock when bonus picks lock at kickoff."}
            </p>
          )}
          <Rosters
            rosters={state.rosters}
            board={state.board}
            profilesUnlocked={profilesUnlocked}
            teamPoints={rosterTeamPoints}
            qualifiedTeamIds={qualifiedTeamIds}
          />
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

      {/* Secondary navigation — live scores and rosters above are what people
          open the app for, so these sit at the bottom of the page. */}
      {predictionsStarted && (
        <a href="/predictions" className={predClass}>
          {predLabel}
        </a>
      )}

      {state?.is_admin && (
        <a
          href="/admin"
          className={`inline-block self-start rounded-full border border-gold/60 px-4 py-2 text-sm font-bold text-gold hover:bg-gold hover:text-navy ${pressable}`}
        >
          ⚙ Admin
        </a>
      )}

      <form action={signOut}>
        <button className={`text-sm text-caption underline ${pressableLink}`}>Sign out</button>
      </form>
    </main>
  );
}
