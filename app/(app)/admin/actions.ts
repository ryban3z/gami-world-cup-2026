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
  back();
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
  const { error } = await supabase.rpc("admin_override_match", {
    p_match_id: String(formData.get("match_id")),
    p_home_score: Number(formData.get("home_score")),
    p_away_score: Number(formData.get("away_score")),
    p_status: String(formData.get("status")),
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
