"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runIngest, runRecalc } from "@/lib/pipeline";
import { refreshCooldownRemainingMs } from "@/lib/adminView";

// All admin actions return to /admin. On RPC error, surface the message in
// the page's error banner via the query string.
function back(error?: string): never {
  redirect(error ? `/admin?error=${encodeURIComponent(error)}` : "/admin");
}

async function call(rpc: string, args?: Record<string, unknown>): Promise<never> {
  const supabase = createClient();
  const { error } = await supabase.rpc(rpc, args);
  if (error) back(error.message);
  // Admin actions change phase/config that the friend-facing pages render,
  // so revalidate those too (not just /admin).
  revalidatePath("/admin");
  revalidatePath("/home");
  revalidatePath("/predictions");
  revalidatePath("/knockout");
  back();
}

export async function openRegistration() {
  await call("set_registration_open", { p_open: true });
}

export async function closeRegistration() {
  await call("set_registration_open", { p_open: false });
}

export async function startDraft() {
  await call("start_draft");
}

export async function adminAutopick() {
  await call("admin_autopick");
}

export async function lockPredictions() {
  await call("lock_predictions");
}

export async function openKnockoutRealloc() {
  await call("open_knockout_realloc");
}

async function requireAdmin(): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles").select("is_admin").eq("id", user?.id ?? "").single();
  if (!me?.is_admin) back("admins only");
}

function done(): never {
  revalidatePath("/admin");
  revalidatePath("/home");
  revalidatePath("/knockout");
  back();
}

// Auto-allocate the free agents, materialize knockout ownership, lock the phase,
// then recompute scores. A recalc runs FIRST too, so the pick order is
// snapshotted from up-to-date end-of-group-stage standings (refresh results
// before resolving for the freshest data); a second recalc after re-routes the
// knockout ladder to the new owners.
export async function resolveKnockoutRealloc() {
  await requireAdmin();
  const supabase = createClient();
  try {
    await runRecalc();
  } catch (e) {
    back(e instanceof Error ? e.message : String(e));
  }
  const { error } = await supabase.rpc("resolve_knockout_realloc");
  if (error) back(error.message);
  try {
    await runRecalc();
  } catch (e) {
    back(e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/predictions");
  done();
}

export async function refreshResults() {
  await requireAdmin();
  // Server-side cooldown — can't be bypassed by double-clicking the button.
  const supabase = createClient();
  const { data: cfg } = await supabase
    .from("game_config")
    .select("last_results_sync_at")
    .eq("id", 1)
    .single();
  const remaining = refreshCooldownRemainingMs(cfg?.last_results_sync_at ?? null);
  if (remaining > 0) {
    back(`Just synced — wait ${Math.ceil(remaining / 1000)}s before refreshing again.`);
  }
  try {
    await runIngest();
  } catch (e) {
    back(e instanceof Error ? e.message : String(e));
  }
  done();
}

export async function overrideMatch(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  // "" = auto (derive winner from the scores); a team id = penalties winner.
  const winner = String(formData.get("winner_team_id") ?? "");
  const { error } = await supabase.rpc("admin_override_match", {
    p_match_id: String(formData.get("match_id")),
    p_home_score: Number(formData.get("home_score")),
    p_away_score: Number(formData.get("away_score")),
    p_status: String(formData.get("status")),
    p_winner_team_id: winner || null,
  });
  if (error) back(error.message);
  try { await runRecalc(); } catch (e) { back(e instanceof Error ? e.message : String(e)); }
  done();
}

export async function resolveCategory(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_resolve_category", {
    p_category_id: String(formData.get("category_id")),
    p_answer: String(formData.get("answer") ?? ""),
  });
  if (error) back(error.message);
  try { await runRecalc(); } catch (e) { back(e instanceof Error ? e.message : String(e)); }
  done();
}
