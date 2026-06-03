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

  const [{ data: me }, { data: players }, { data: cfg }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("profiles")
      .select("id, display_name")
      .order("created_at", { ascending: true }),
    supabase.from("game_config").select("current_phase").eq("id", 1).single(),
  ]);

  const list = players ?? [];
  const draftOpen = (cfg?.current_phase ?? "registration") !== "registration";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{branding.poolName}</h1>
        <p className="mt-2 text-bodytext">
          Welcome, <strong className="text-white">{me?.display_name ?? "player"}</strong>.
          {draftOpen ? " The draft is underway — head in and pick." : " The draft hasn't opened yet — sit tight."}
        </p>
      </div>

      {draftOpen && (
        <a
          href="/draft"
          className="inline-block rounded-full bg-gold px-6 py-3 text-center text-sm font-bold uppercase tracking-wide text-navy transition hover:brightness-110"
        >
          Go to the draft →
        </a>
      )}

      <section className="rounded-xl border border-glow bg-panel p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gold">
          Players registered ({list.length})
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="text-gold">●</span>
              <span className="text-white">{p.display_name}</span>
              {p.id === user.id && <span className="text-caption">(you)</span>}
            </li>
          ))}
        </ul>
      </section>

      <form action={signOut}>
        <button className="text-sm text-caption underline">Sign out</button>
      </form>
    </main>
  );
}
