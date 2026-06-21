import type { TopScorerRow } from "@/lib/topScorersView";

// Golden Boot race — the tournament's top scorers, pulled live from
// football-data.org. Read-only colour (not a scoring input). Penalties shown
// inline when the feed provides them; assists are free-tier-flaky so we surface
// them only when present.
function ScorerRow({ s }: { s: TopScorerRow }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm leading-5">
      <span className="w-5 shrink-0 text-right font-bold text-caption tabular-nums">{s.rank}</span>
      {s.flagUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={s.flagUrl} alt="" className="h-3 w-5 shrink-0 rounded-sm object-cover" />
      )}
      <span className="min-w-0 flex-1 truncate text-white">
        {s.playerName}
        {s.teamName && <span className="text-caption"> · {s.teamName}</span>}
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="font-bold text-gold">{s.goals}</span>
        <span className="text-caption"> {s.goals === 1 ? "goal" : "goals"}</span>
        {s.penalties != null && s.penalties > 0 && (
          <span className="text-caption"> ({s.penalties} pen)</span>
        )}
      </span>
    </li>
  );
}

export default function TopScorers({ rows }: { rows: TopScorerRow[] }) {
  return (
    <section className="rounded-xl border border-glow bg-panel p-4">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Golden Boot race</h2>
      {rows.length > 0 ? (
        <ul className="flex flex-col">{rows.map((s) => <ScorerRow key={`${s.rank}-${s.playerName}`} s={s} />)}</ul>
      ) : (
        <p className="text-sm text-caption">No goals yet.</p>
      )}
    </section>
  );
}
