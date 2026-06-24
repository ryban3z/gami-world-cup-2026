"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Submit (or overwrite) the blind drop + ranked top-3 wishlist. Empty fields
// fall through to "no swap" — the RPC treats a missing drop / empty wishlist as
// keeping the roster. Fields: drop_team_id, wish_1, wish_2, wish_3.
export async function submitSwapNomination(formData: FormData) {
  const supabase = createClient();
  const dropTeamId = String(formData.get("drop_team_id") ?? "");
  const picks = [
    String(formData.get("wish_1") ?? ""),
    String(formData.get("wish_2") ?? ""),
    String(formData.get("wish_3") ?? ""),
  ].filter((v) => v.length > 0);

  const { error } = await supabase.rpc("submit_swap_nomination", {
    p_drop_team_id: dropTeamId || null,
    p_pick_team_ids: picks,
  });
  if (error) redirect(`/knockout?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/knockout");
  redirect("/knockout?saved=swap");
}

// Use the one-time wildcard to replace a single bonus pick (one slot of one
// category). Fields: category_id, pick_slot, value.
export async function useWildcard(formData: FormData) {
  const supabase = createClient();

  const { error } = await supabase.rpc("use_wildcard", {
    p_category_id: String(formData.get("category_id")),
    p_pick_slot: Number(formData.get("pick_slot")),
    p_value: String(formData.get("value") ?? ""),
  });
  if (error) redirect(`/knockout?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/knockout");
  revalidatePath("/predictions");
  redirect("/knockout?saved=wildcard");
}
