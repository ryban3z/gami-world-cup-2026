import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { phaseSteps, type GamePhase } from "@/lib/adminView";
import PhaseBanner from "@/components/admin/PhaseBanner";
import ConfirmAction from "@/components/admin/ConfirmAction";
import {
  openRegistration,
  closeRegistration,
  startDraft,
  adminAutopick,
  lockPredictions,
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

  const [{ data: cfg }, { data: draft }] = await Promise.all([
    supabase
      .from("game_config")
      .select("registration_open, predictions_open, predictions_locked_at")
      .eq("id", 1)
      .single(),
    supabase.rpc("draft_state"),
  ]);

  const state = draft as { phase: GamePhase; current_user_name: string | null } | null;
  const phase: GamePhase = state?.phase ?? "registration";
  const registrationOpen = cfg?.registration_open ?? false;
  const predictionsOpen = cfg?.predictions_open ?? false;
  const currentPlayer = state?.current_user_name ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin control panel</h1>
        <a href="/home" className="text-sm text-caption underline">
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
    </main>
  );
}
