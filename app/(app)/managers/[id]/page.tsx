import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DraftState } from "@/components/draft/DraftStatus";
import { buildManagerProfileView } from "@/lib/managerProfileView";
import ManagerProfile from "@/components/managers/ManagerProfile";

export const dynamic = "force-dynamic"; // reflect live phase/lock state

export default async function ManagerPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: manager },
    { data: cfg },
    { data: draft },
    { data: categories },
    { data: predictions },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, summary, chicken_flavour, avatar_url")
      .eq("id", params.id)
      .single(),
    supabase.from("game_config").select("predictions_locked_at").eq("id", 1).single(),
    supabase.rpc("draft_state"),
    supabase.from("bonus_categories").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("bonus_predictions")
      .select("category_id, pick_slot, pick_value")
      .eq("user_id", params.id)
      .eq("is_active", true),
  ]);

  if (!manager) notFound();

  const state = (draft as DraftState | null) ?? null;

  // Manager profiles stay sealed until bonus picks lock (~Jun 10) — except for
  // admins, who can preview every profile beforehand to proofread them. The
  // roster cards on /home mirror this (clickable for admins, or after the lock).
  // The route is guarded here too, so a non-admin typed URL can't peek early.
  if (cfg?.predictions_locked_at == null && !state?.is_admin) redirect("/home");
  const view = buildManagerProfileView({
    displayName: manager.display_name,
    summary: manager.summary ?? null,
    chickenFlavour: manager.chicken_flavour ?? null,
    avatarUrl: manager.avatar_url ?? null,
    isSelf: user.id === params.id,
    targetUserId: params.id,
    rosters: state?.rosters ?? null,
    board: state?.board ?? [],
    predictionsLockedAt: cfg?.predictions_locked_at ?? null,
    categories: categories ?? [],
    predictions: predictions ?? [],
  });

  return <ManagerProfile view={view} />;
}
