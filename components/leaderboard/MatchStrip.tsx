import type { MatchStripItem } from "@/lib/leaderboardView";

function MatchRow({ m }: { m: MatchStripItem }) {
  const done = m.status === "final";
  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <span className="w-20 shrink-0 text-xs text-caption">{m.stageLabel}</span>
      <span className="flex flex-1 items-center justify-end gap-1 text-white">
        <span className="truncate">{m.homeName}</span>
        {m.homeFlag && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={m.homeFlag} alt="" className="h-3 w-5 rounded-sm object-cover" />
        )}
      </span>
      <span className="shrink-0 font-bold text-gold">
        {done ? `${m.homeScore}–${m.awayScore}` : "v"}
      </span>
      <span className="flex flex-1 items-center gap-1 text-white">
        {m.awayFlag && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={m.awayFlag} alt="" className="h-3 w-5 rounded-sm object-cover" />
        )}
        <span className="truncate">{m.awayName}</span>
      </span>
    </li>
  );
}

// Two stacked cards: most recent finished results, then the next upcoming fixtures.
export default function MatchStrip({
  recent,
  upcoming,
}: {
  recent: MatchStripItem[];
  upcoming: MatchStripItem[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-xl border border-glow bg-panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Recent results</h2>
        {recent.length > 0 ? (
          <ul className="flex flex-col">{recent.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        ) : (
          <p className="text-sm text-caption">Nothing yet.</p>
        )}
      </div>
      <div className="rounded-xl border border-glow bg-panel p-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Next up</h2>
        {upcoming.length > 0 ? (
          <ul className="flex flex-col">{upcoming.map((m) => <MatchRow key={m.id} m={m} />)}</ul>
        ) : (
          <p className="text-sm text-caption">Nothing scheduled.</p>
        )}
      </div>
    </section>
  );
}
