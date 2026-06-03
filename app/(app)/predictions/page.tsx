import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PredictionForm from "@/components/predictions/PredictionForm";
import RevealPicks from "@/components/predictions/RevealPicks";

export const dynamic = "force-dynamic";

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: cfg },
    { data: me },
    { data: categories },
    { data: teams },
    { data: picks },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("game_config").select("predictions_open, predictions_locked_at").eq("id", 1).single(),
    supabase.from("profiles").select("is_admin").eq("id", user.id).single(),
    supabase.from("bonus_categories").select("id, key, name").eq("is_active", true).order("name"),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("bonus_predictions").select("user_id, category_id, pick_slot, pick_value"),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const open = cfg?.predictions_open ?? false;
  const locked = cfg?.predictions_locked_at != null;
  const isAdmin = me?.is_admin ?? false;
  const cats = categories ?? [];
  const allPicks = picks ?? [];

  // Caller's own picks, keyed for prefilling the form.
  const picksByKey: Record<string, string> = {};
  for (const p of allPicks) {
    if (p.user_id === user.id) picksByKey[`${p.category_id}_${p.pick_slot}`] = p.pick_value;
  }
  const nameById: Record<string, string> = {};
  for (const pr of profiles ?? []) nameById[pr.id] = pr.display_name;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20">
      <header>
        <h1 className="text-2xl font-bold">Bonus Predictions</h1>
        <p className="mt-1 text-sm text-bodytext">
          2 picks per category — the two must differ. Locks at kickoff.
        </p>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}
      {searchParams.saved && !searchParams.error && (
        <p className="rounded-lg border border-gold/40 bg-panel p-3 text-sm text-gold">Saved.</p>
      )}

      {!open && !locked && (
        <p className="text-bodytext">Predictions open when the admin starts the draft. Sit tight.</p>
      )}

      {open && !locked && (
        <PredictionForm categories={cats} teams={teams ?? []} picksByKey={picksByKey} isAdmin={isAdmin} />
      )}

      {locked && (
        <>
          <p className="text-lg font-bold text-gold">Locked — here&apos;s everyone&apos;s picks.</p>
          <RevealPicks categories={cats} picks={allPicks} nameById={nameById} />
        </>
      )}
    </main>
  );
}
