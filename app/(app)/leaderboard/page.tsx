import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { pressableLink } from "@/lib/ui";
import type { DraftState } from "@/components/draft/DraftStatus";
import { buildLeaderboard, buildMyTeams } from "@/lib/leaderboardView";
import { loadTopScorers } from "@/lib/footballData";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import MyTeamsPanel from "@/components/leaderboard/MyTeamsPanel";
import TopScorers from "@/components/leaderboard/TopScorers";
import SyncedAt from "@/components/admin/SyncedAt";

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
    { data: teams },
    { data: cfg },
  ] = await Promise.all([
    supabase.from("scores").select("user_id, total_points, breakdown"),
    supabase.from("profiles").select("id, display_name, avatar_url"),
    supabase.from("team_standings").select("team_id, furthest_stage, is_eliminated, is_champion, qualified"),
    supabase.from("teams").select("id, name, flag_url, external_id"),
    supabase.from("game_config").select("last_results_sync_at").eq("id", 1).single(),
  ]);

  const rows = buildLeaderboard(scores ?? [], profiles ?? [], teams ?? [], user.id);
  // Teams the viewer dropped in the knockout swap (empty before the swap locks);
  // shown struck-through after their live squad.
  const myDropped = state?.rosters?.find((r) => r.user_id === user.id)?.dropped_team_ids ?? [];
  const myTeams = buildMyTeams(state?.my_team_ids ?? [], state?.board ?? [], standings ?? [], myDropped);

  // Live Golden Boot board (full top-10). loadTopScorers guards a missing token
  // or an API hiccup down to an empty container, never a broken dashboard.
  const topScorers = await loadTopScorers(teams ?? []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6 pb-20 lg:max-w-3xl">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{branding.poolName} — Leaderboard</h1>
          {cfg?.last_results_sync_at && (
            <p className="mt-1 text-xs text-caption">
              Results updated <SyncedAt iso={cfg.last_results_sync_at} />
            </p>
          )}
        </div>
        <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>← Home</a>
      </header>
      <LeaderboardTable rows={rows} complete={phase === "complete"} />
      <MyTeamsPanel teams={myTeams} />
      <TopScorers rows={topScorers} href="/predictions/status" />
    </main>
  );
}
