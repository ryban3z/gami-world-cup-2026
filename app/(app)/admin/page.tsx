import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { phaseSteps, type GamePhase } from "@/lib/adminView";
import { pressableLink } from "@/lib/ui";
import PhaseBanner from "@/components/admin/PhaseBanner";
import ConfirmAction from "@/components/admin/ConfirmAction";
import MatchOverride, { type OverrideMatch } from "@/components/admin/MatchOverride";
import BonusResolve, { type ResolveCategory } from "@/components/admin/BonusResolve";
import {
  openRegistration,
  closeRegistration,
  startDraft,
  adminAutopick,
  lockPredictions,
  refreshResults,
} from "./actions";

export const dynamic = "force-dynamic"; // always reflect live game state

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) redirect("/home");

  const [{ data: cfg }, { data: draft }, { data: matchRows }, { data: cats }, { data: preds }] =
    await Promise.all([
      supabase.from("game_config").select("registration_open, predictions_open, last_results_sync_at").eq("id", 1).single(),
      supabase.rpc("draft_state"),
      supabase
        .from("matches")
        .select("id, stage, group_letter, status, home_score, away_score, is_manual_override, home:home_team_id(name), away:away_team_id(name)")
        .order("kickoff_at"),
      supabase.from("bonus_categories").select("id, name, resolved_answer").eq("is_active", true).order("name"),
      supabase.from("bonus_predictions").select("category_id, pick_value").eq("is_active", true),
    ]);

  const lastSync = cfg?.last_results_sync_at ?? null;
  const overrideMatches: OverrideMatch[] = (matchRows ?? []).map((m: any) => ({
    id: m.id,
    label: `${m.stage.toUpperCase()}${m.group_letter ? " " + m.group_letter : ""} — ${m.home?.name ?? "TBD"} vs ${m.away?.name ?? "TBD"}`,
    home_score: m.home_score, away_score: m.away_score, status: m.status,
    is_manual_override: m.is_manual_override,
  }));
  const suggestionsByCat = new Map<string, Set<string>>();
  for (const p of preds ?? []) {
    const set = suggestionsByCat.get(p.category_id) ?? new Set<string>();
    set.add(p.pick_value);
    suggestionsByCat.set(p.category_id, set);
  }
  const resolveCategories: ResolveCategory[] = (cats ?? []).map((c: any) => ({
    id: c.id, name: c.name, resolved_answer: c.resolved_answer ?? null,
    suggestions: [...(suggestionsByCat.get(c.id) ?? [])].sort(),
  }));

  const state = draft as { phase: GamePhase; current_user_name: string | null } | null;
  const phase: GamePhase = state?.phase ?? "registration";
  const registrationOpen = cfg?.registration_open ?? false;
  const predictionsOpen = cfg?.predictions_open ?? false;
  const currentPlayer = state?.current_user_name ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin control panel</h1>
        <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>
          ← Home
        </a>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}

      <PhaseBanner steps={phaseSteps(phase)} />

      {phase === "registration" && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Registration</h2>
          {registrationOpen ? (
            <ConfirmAction
              action={closeRegistration}
              tone="danger"
              label="Close registration"
              pendingLabel="Closing…"
              confirmPrompt="Close registration so no new players can join. Confirm?"
              description="Hides the join CTA on the landing page."
            />
          ) : (
            <ConfirmAction
              action={openRegistration}
              label="Open registration"
              pendingLabel="Opening…"
              confirmPrompt="Open registration so friends can join. Confirm?"
              description="Shows the join CTA on the landing page."
            />
          )}
        </section>
      )}

      {phase === "registration" && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Draft</h2>
          <ConfirmAction
            action={startDraft}
            label="Start draft"
            pendingLabel="Starting…"
            confirmPrompt="Start the draft — randomises pick order, closes registration, and opens bonus predictions. Can't be undone. Confirm?"
            description="Randomises order; closes registration; opens predictions."
          />
        </section>
      )}

      {phase === "draft" && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Draft</h2>
          <ConfirmAction
            action={adminAutopick}
            tone="danger"
            label={`Auto-pick for ${currentPlayer ?? "current player"}`}
            pendingLabel="Picking…"
            confirmPrompt={`Assign a random available team to ${currentPlayer ?? "the current player"}? Use only after nudging them. Confirm?`}
            description="Assigns a random team to the player on the clock."
          />
        </section>
      )}

      {predictionsOpen && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Predictions</h2>
          <ConfirmAction
            action={lockPredictions}
            tone="danger"
            label="Lock predictions"
            pendingLabel="Locking…"
            confirmPrompt="Lock predictions — closes the window and reveals everyone's picks. Can't be undone. Confirm?"
            description="Closes the window and reveals all picks."
          />
        </section>
      )}

      <section className="rounded-xl border border-gold/40 bg-panel p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Results</h2>
        <p className="mb-3 text-xs text-caption">
          Last synced: {lastSync ? new Date(lastSync).toLocaleString() : "never"}
        </p>
        <ConfirmAction
          action={refreshResults}
          label="Refresh results now"
          pendingLabel="Refreshing…"
          confirmPrompt="Fetch the latest results from football-data.org and recompute scores. Confirm?"
          description="Runs the ingest + recalc pipeline."
        />
      </section>

      <BonusResolve categories={resolveCategories} />
      <MatchOverride matches={overrideMatches} />
    </main>
  );
}
