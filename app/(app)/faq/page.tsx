import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pressableLink } from "@/lib/ui";
import { FAQ_ENTRIES, SCORING_ROWS, STEPS } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6 pb-28 lg:max-w-2xl">
      <header>
        <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>
          ← Home
        </a>
        <h1 className="mt-3 text-2xl font-bold">Rules &amp; FAQ</h1>
        <p className="mt-1 text-bodytext">
          How scoring, the wildcard, and the knockout swap all work.
        </p>
      </header>

      {/* Scoring at a glance — mirrors the marketing-page table, kept in sync via
          lib/content.ts SCORING_ROWS. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gold">Scoring</h2>
        <div className="rounded-xl border border-glow bg-panel px-4 py-3">
          {SCORING_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`flex justify-between py-2 text-sm ${
                i < SCORING_ROWS.length - 1 ? "border-b border-glow" : ""
              }`}
            >
              <span className="text-bodytext">{row.label}</span>
              <span className="font-extrabold text-gold">{row.value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-caption">
          Knockout points are for a team&apos;s furthest stage and stack on the +4
          qualify reward (so an R16 team = 10). Group points stay with the drafter;
          knockout points go to the new owner after a swap.
        </p>
      </section>

      {/* The five-step lifecycle, same copy as the landing page. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gold">How it works</h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-3">
              <span className="text-sm font-black text-gold">{step.n}</span>
              <div>
                <div className="text-sm font-bold text-white">{step.title}</div>
                <div className="text-xs text-bodytext">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gold">FAQ</h2>
        <div className="flex flex-col gap-3">
          {FAQ_ENTRIES.map((entry) => (
            <div key={entry.q} className="rounded-xl border border-glow bg-panel p-4">
              <h3 className="text-sm font-bold text-white">{entry.q}</h3>
              <p className="mt-2 text-sm text-bodytext">{entry.a}</p>
            </div>
          ))}
        </div>
      </section>

      <a href="/home" className={`text-sm text-caption underline ${pressableLink}`}>
        ← Back to home
      </a>
    </main>
  );
}
