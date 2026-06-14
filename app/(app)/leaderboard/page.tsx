import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { pressableLink } from "@/lib/ui";
import type { DraftState } from "@/components/draft/DraftStatus";
import { buildLeaderboard, buildMyTeams, buildMatchStrip } from "@/lib/leaderboardView";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import MyTeamsPanel from "@/components/leaderboard/MyTeamsPanel";
import MatchStrip from "@/components/leaderboard/MatchStrip";

export const dynamic = "force-dynamic"; // always reflect live scores

// Phases where scores exist (predictions lock at kickoff → group_locked).
const LIVE_PHASES = new Set([
  "group_locked",
  "knockout_realloc",
  "knockout_locked",
  "complete",
]);

export default async function LeaderboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: draft } = await supabase.rpc("draft_state");
  const state = (draft as DraftState | null) ?? null;
  const phase = state?.phase ?? "registration";

  if (!LIVE_PHASES.has(phase)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 lg:max-w-3xl">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>← Home</a>
        </header>
        <p className="text-bodytext">
          The tournament hasn&apos;t kicked off yet — check back after the group stage begins.
        </p>
      </main>
    );
  }

  const [
    { data: scores },
    { data: profiles },
    { data: standings },
    { data: matches },
    { data: teams },
  ] = await Promise.all([
    supabase.from("scores").select("user_id, total_points, breakdown"),
    supabase.from("profiles").select("id, display_name, avatar_url"),
    supabase.from("team_standings").select("team_id, furthest_stage, is_eliminated, is_champion"),
    supabase
      .from("matches")
      .select(
        "id, stage, group_letter, home_team_id, away_team_id, kickoff_at, home_score, away_score, winner_team_id, status",
      ),
    supabase.from("teams").select("id, name, flag_url"),
  ]);

  const rows = buildLeaderboard(scores ?? [], profiles ?? [], teams ?? [], user.id);
  const myTeams = buildMyTeams(state?.my_team_ids ?? [], state?.board ?? [], standings ?? []);
  const strip = buildMatchStrip(matches ?? [], teams ?? [], {
    ownership: state?.rosters ? { rosters: state.rosters, profiles: profiles ?? [] } : undefined,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6 pb-20 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{branding.poolName} — Leaderboard</h1>
        <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>← Home</a>
      </header>
      <LeaderboardTable rows={rows} complete={phase === "complete"} />
      <MyTeamsPanel teams={myTeams} />
      <MatchStrip recent={strip.recent} upcoming={strip.upcoming} />
    </main>
  );
}
