import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { pressableLink } from "@/lib/ui";
import type { DraftState } from "@/components/draft/DraftStatus";
import { buildLeaderboard } from "@/lib/leaderboardView";
import { buildFinalResults } from "@/lib/finalResultsView";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import WinnersBoard from "@/components/results/WinnersBoard";

export const dynamic = "force-dynamic"; // reflect final scores + phase

// The end-of-tournament winners page. Only meaningful in the `complete` phase
// (the final standings are frozen there) — before that, send people to the live
// leaderboard.
export default async function ResultsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: draft } = await supabase.rpc("draft_state");
  const state = (draft as DraftState | null) ?? null;
  const phase = (state?.phase ?? "registration") as string;
  if (phase !== "complete") redirect("/leaderboard");

  const [
    { data: scores },
    { data: profiles },
    { data: teams },
    { data: standings },
    { data: categories },
    { data: predictions },
  ] = await Promise.all([
    supabase.from("scores").select("user_id, total_points, breakdown"),
    supabase.from("profiles").select("id, display_name, avatar_url"),
    supabase.from("teams").select("id, name, flag_url"),
    supabase.from("team_standings").select("team_id, is_champion"),
    supabase
      .from("bonus_categories")
      .select("id, key, name, resolved_answer")
      .eq("is_active", true)
      .order("name"),
    supabase.from("bonus_predictions").select("user_id, category_id, pick_value").eq("is_active", true),
  ]);

  // team_ownership isn't directly readable by clients (RLS exposes it only via
  // draft_state()); in the `complete` phase its rosters already reflect the
  // post-swap knockout ownership, so flatten them into team_id → user_id.
  const owners = (state?.rosters ?? []).flatMap((r) =>
    r.team_ids.map((team_id) => ({ team_id, user_id: r.user_id })),
  );

  const rows = buildLeaderboard(scores ?? [], profiles ?? [], teams ?? [], user.id);
  const results = buildFinalResults(
    rows,
    standings ?? [],
    teams ?? [],
    owners,
    profiles ?? [],
    categories ?? [],
    predictions ?? [],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6 pb-20 lg:max-w-3xl">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{branding.poolName} — Final results</h1>
          <p className="mt-1 text-sm text-caption">That&apos;s a wrap. 🎉</p>
        </div>
        <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>← Home</a>
      </header>

      <WinnersBoard results={results} trophyName={branding.trophyName} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Final standings</h2>
        <LeaderboardTable rows={rows} complete />
      </section>
    </main>
  );
}
