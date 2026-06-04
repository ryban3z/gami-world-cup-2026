"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The draft UI now lives on /home, so actions return there.
function backWithError(message: string): never {
  redirect(`/home?error=${encodeURIComponent(message)}`);
}

export async function makePick(teamId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("make_pick", { p_team_id: teamId });
  if (error) backWithError(error.message);
  revalidatePath("/home");
  redirect("/home");
}
