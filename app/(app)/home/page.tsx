import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { branding } from "@/lib/config";
import { signOut } from "../../(auth)/actions";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_admin")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">{branding.poolName}</h1>
      <p>
        Welcome, <strong>{profile?.display_name ?? "player"}</strong>. The draft
        hasn&apos;t opened yet — sit tight.
      </p>
      <form action={signOut}>
        <button className="text-sm underline">Sign out</button>
      </form>
    </main>
  );
}
