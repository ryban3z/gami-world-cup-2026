import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { pressableLink } from "@/lib/ui";
import type { DraftState } from "@/components/draft/DraftStatus";
import { buildBracket } from "@/lib/bracketView";
import BracketDiagram from "@/components/bracket/BracketDiagram";

export const dynamic = "force-dynamic"; // always reflect live knockout results

// The bracket spine (R16 → final) is meaningful from the group stage on; teams
// fill in as the knockouts resolve. Before group lock there's nothing to show.
const VISIBLE_PHASES = new Set([
  "group_locked",
  "knockout_realloc",
  "knockout_locked",
  "complete",
]);

export default async function BracketPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: draft } = await supabase.rpc("draft_state");
  const state = (draft as DraftState | null) ?? null;
  const phase = state?.phase ?? "registration";

  if (!VISIBLE_PHASES.has(phase)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 lg:max-w-5xl">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Knockout bracket</h1>
          <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>← Home</a>
        </header>
        <p className="text-bodytext">
          The road to the final opens once the group stage kicks off — check back then.
        </p>
      </main>
    );
  }

  const [{ data: matches }, { data: teams }, { data: profiles }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "external_id, stage, home_team_id, away_team_id, home_score, away_score, home_penalties, away_penalties, winner_team_id, status, kickoff_at",
      ),
    supabase.from("teams").select("id, name, flag_url"),
    supabase.from("profiles").select("id, display_name, avatar_url"),
  ]);

  // Rosters from draft_state() carry current ownership (group-stage until the
  // knockout swap locks, then the knockout snapshot) — same source the home
  // match strip uses, so owner badges stay consistent across the app.
  const view = buildBracket(matches ?? [], teams ?? [], {
    rosters: (state?.rosters ?? []).map((r) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      team_ids: r.team_ids,
    })),
    profiles: profiles ?? [],
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-5xl">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{branding.poolName} — Knockout bracket</h1>
          <p className="mt-1 text-xs text-caption">
            The road to the final. Owner photos show who holds each team. Swipe to follow both halves.
          </p>
        </div>
        <a href="/home" className={`shrink-0 text-sm text-caption underline ${pressableLink}`}>← Home</a>
      </header>
      <BracketDiagram view={view} />
    </main>
  );
}
