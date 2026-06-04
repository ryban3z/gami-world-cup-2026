"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateCategoryPicks } from "@/lib/predictions";

// Saves the whole form: one save_bonus_category RPC call per active category.
// Form fields are named c_<categoryId>_1 and c_<categoryId>_2.
export async function savePredictions(formData: FormData) {
  const supabase = createClient();
  const { data: categories } = await supabase
    .from("bonus_categories")
    .select("id")
    .eq("is_active", true);

  for (const c of categories ?? []) {
    const v1 = String(formData.get(`c_${c.id}_1`) ?? "");
    const v2 = String(formData.get(`c_${c.id}_2`) ?? "");

    const check = validateCategoryPicks(v1, v2);
    if (!check.ok) redirect(`/predictions?error=${encodeURIComponent(check.error)}`);

    const { error } = await supabase.rpc("save_bonus_category", {
      p_category_id: c.id,
      p_value1: v1,
      p_value2: v2,
    });
    if (error) redirect(`/predictions?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/predictions");
  redirect("/predictions?saved=1");
}
