import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pressableLink } from "@/lib/ui";
import SwapForm from "@/components/knockout/SwapForm";
import WildcardForm from "@/components/knockout/WildcardForm";

export const dynamic = "force-dynamic";

interface Team {
  id: string;
  name: string;
  flag_url: string | null;
  group_letter: string | null;
}
interface ReallocState {
  phase: string;
  is_admin: boolean;
  wildcard_used: boolean;
  my_roster: Team[];
  free_agents: Team[];
  my_submission: { drop_team_id: string | null; pick_team_ids: string[] } | null;
  results:
    | { user_id: string; display_name: string; drop_name: string; claimed_name: string; claimed_flag_url: string | null }[]
    | null;
}

export default async function KnockoutPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: stateData }, { data: categories }, { data: teams }, { data: picks }] =
    await Promise.all([
      supabase.rpc("knockout_realloc_state"),
      supabase.from("bonus_categories").select("id, key, name").eq("is_active", true).order("name"),
      supabase.from("teams").select("id, name").order("name"),
      supabase
        .from("bonus_predictions")
        .select("category_id, pick_slot, pick_value")
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);

  const state = (stateData as ReallocState | null) ?? null;
  const phase = state?.phase ?? "registration";
  const open = phase === "knockout_realloc";
  const revealed = phase === "knockout_locked" || phase === "complete";

  // Caller's current active picks, keyed for prefilling the wildcard form.
  const picksByKey: Record<string, string> = {};
  for (const p of picks ?? []) picksByKey[`${p.category_id}_${p.pick_slot}`] = p.pick_value;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-6 pb-20 lg:max-w-3xl">
      <a href="/home" className={`self-start text-sm text-caption underline ${pressableLink}`}>
        ← Home
      </a>

      <header>
        <h1 className="text-2xl font-bold">Knockout swap & wildcard</h1>
        <p className="mt-1 text-sm text-bodytext">
          One optional team swap (drop one, claim a free agent that reached the
          Round of 32) and one optional wildcard (change one of your bonus picks).
          Both are blind until the window closes.
        </p>
      </header>

      {searchParams.error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {searchParams.error}
        </p>
      )}
      {searchParams.saved && !searchParams.error && (
        <p className="rounded-lg border border-gold/40 bg-panel p-3 text-sm text-gold">
          {searchParams.saved === "wildcard" ? "Wildcard used." : "Swap saved."}
        </p>
      )}

      {!open && !revealed && (
        <p className="text-bodytext">
          The knockout swap opens when the admin closes the group stage. Sit tight.
        </p>
      )}

      {open && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-caption">
              Team swap
            </h2>
            <SwapForm
              roster={state?.my_roster ?? []}
              freeAgents={state?.free_agents ?? []}
              submission={state?.my_submission ?? null}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-caption">
              Wildcard
            </h2>
            {state?.wildcard_used ? (
              <p className="rounded-lg border border-glow bg-panel p-3 text-sm text-bodytext">
                You&apos;ve used your wildcard. Picks lock in with everyone else&apos;s.
              </p>
            ) : (
              <WildcardForm
                categories={categories ?? []}
                teams={teams ?? []}
                picksByKey={picksByKey}
              />
            )}
          </section>
        </>
      )}

      {revealed && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-gold">Swaps are in.</h2>
          {state?.results && state.results.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {state.results.map((r) => (
                <li
                  key={r.user_id}
                  className="rounded-xl border border-glow bg-panel p-3 text-sm"
                >
                  <span className="font-bold text-white">{r.display_name}</span>{" "}
                  <span className="text-caption">dropped</span> {r.drop_name}{" "}
                  <span className="text-caption">→ claimed</span>{" "}
                  <span className="font-bold text-gold">{r.claimed_name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-bodytext">No swaps were made — every roster stays as drafted.</p>
          )}
        </section>
      )}
    </main>
  );
}
