"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
