import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pressableLink } from "@/lib/ui";
import { BONUS_AWARD_INFO } from "@/lib/content";
import { loadTopScorers } from "@/lib/footballData";
import { buildGoldenBootTracker, type GoldenBootPickRow } from "@/lib/bonusTrackerView";
import TopScorers from "@/components/leaderboard/TopScorers";
import GoldenBootTracker from "@/components/predictions/GoldenBootTracker";

export const dynamic = "force-dynamic"; // always reflect live scores + resolutions

export default async function BonusStatusPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: cfg },
    { data: categories },
    { data: teams },
    { data: picks },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("game_config").select("predictions_locked_at").eq("id", 1).single(),
    supabase.from("bonus_categories").select("id, key, name, resolved_answer").eq("is_active", true).order("name"),
    supabase.from("teams").select("id, name, flag_url, external_id"),
    // RLS only returns others' picks once predictions lock — the tracker stays
    // empty (its own "revealed at kickoff" copy) until then.
    supabase.from("bonus_predictions").select("user_id, category_id, pick_slot, pick_value").eq("is_active", true),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const locked = cfg?.predictions_locked_at != null;
  const cats = categories ?? [];
  const nameById: Record<string, string> = {};
  for (const p of profiles ?? []) nameById[p.id] = p.display_name;

  // Live top-10 scorers board. loadTopScorers guards a missing token / API
  // hiccup down to an empty container, never a broken page.
  const topScorers = await loadTopScorers(teams ?? [], 10);

  // Golden Boot picks cross-referenced against the live board.
  const goldenBootId = cats.find((c) => c.key === "golden_boot")?.id;
  const bootPicks: GoldenBootPickRow[] = goldenBootId
    ? buildGoldenBootTracker(
        topScorers,
        (picks ?? []).filter((p) => p.category_id === goldenBootId),
        nameById,
      )
    : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-3xl">
      <a href="/home" className={`self-start text-sm text-caption underline ${pressableLink}`}>
        ← Home
      </a>

      <header>
        <h1 className="text-2xl font-bold">Bonus Tracker</h1>
        <p className="mt-1 text-sm text-bodytext">
          Live award race + how everyone&apos;s bonus predictions are tracking.{" "}
          <a href="/predictions" className={`text-gold underline ${pressableLink}`}>
            Make / view picks →
          </a>
        </p>
      </header>

      <TopScorers rows={topScorers} />
      <GoldenBootTracker picks={bootPicks} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-caption">Award status</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {cats.map((c) => {
            const answer = c.resolved_answer?.trim() || null;
            return (
              <div key={c.id} className="rounded-xl border border-glow bg-panel p-4">
                <h3 className="text-sm font-bold text-gold">{c.name}</h3>
                {BONUS_AWARD_INFO[c.key] && (
                  <p className="mt-0.5 text-xs text-caption">{BONUS_AWARD_INFO[c.key]}</p>
                )}
                <p className="mt-2 text-sm">
                  {answer ? (
                    <span className="font-bold text-white">✓ {answer}</span>
                  ) : (
                    <span className="text-caption">Not yet decided</span>
                  )}
                </p>
              </div>
            );
          })}
          {cats.length === 0 && <p className="text-sm text-caption">No awards configured.</p>}
        </div>
      </section>

      {!locked && (
        <p className="text-xs text-caption">
          The Golden Boot picks list fills in once predictions lock at kickoff.
        </p>
      )}
    </main>
  );
}
