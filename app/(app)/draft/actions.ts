"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function backWithError(message: string): never {
  redirect(`/draft?error=${encodeURIComponent(message)}`);
}

export async function startDraft() {
  const supabase = createClient();
  const { error } = await supabase.rpc("start_draft");
  if (error) backWithError(error.message);
  revalidatePath("/draft");
  redirect("/draft");
}

export async function makePick(teamId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("make_pick", { p_team_id: teamId });
  if (error) backWithError(error.message);
  revalidatePath("/draft");
  redirect("/draft");
}

export async function adminAutopick() {
  const supabase = createClient();
  const { error } = await supabase.rpc("admin_autopick");
  if (error) backWithError(error.message);
  revalidatePath("/draft");
  redirect("/draft");
}
