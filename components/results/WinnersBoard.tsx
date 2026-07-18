import type { FinalResults } from "@/lib/finalResultsView";

// Presentational (server component) — the celebratory top of /results: the pool
// champion hero, the top-3 podium, the World Cup winning team + its owner, the
// wooden-spoon manager, and the bonus-prediction callouts. The full expandable
// standings render below via the existing LeaderboardTable.
const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "—";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export default function WinnersBoard({
  results,
  trophyName,
}: {
  results: FinalResults;
  trophyName: string;
}) {
  const { podium, champions, woodenSpoon, championTeam, bonusHighlights } = results;

  return (
    <div className="flex flex-col gap-6">
      {/* Champion hero */}
      {champions.length > 0 && (
        <section className="rounded-2xl border border-gold bg-gradient-to-b from-gold/15 to-panel p-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-gold">
            {champions.length > 1 ? "Co-champions" : "Pool champion"}
          </p>
          <p className="mt-2 text-3xl font-black text-white">🏆 {nameList(champions)}</p>
          <p className="mt-1 text-sm text-caption">Winner of {trophyName}</p>
        </section>
      )}

      {/* Podium */}
      {podium.length > 0 && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold">Podium</h2>
          <ul className="flex flex-col gap-2">
            {podium.map((p) => (
              <li key={p.rank + p.displayName} className="flex items-center gap-3">
                <span className="w-7 text-center text-xl">{MEDAL[p.rank] ?? p.rank}</span>
                {p.avatarUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={p.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full border border-glow object-cover"
                  />
                )}
                <span className={`flex-1 font-bold ${p.isSelf ? "text-white" : "text-bodytext"}`}>
                  {p.displayName}
                  {p.isSelf && <span className="ml-1 text-xs font-normal text-caption">(you)</span>}
                </span>
                <span className="text-lg font-bold text-gold">{p.total}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* World Cup champion team + owner */}
      {championTeam && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold">
            World Cup winners
          </h2>
          <div className="flex items-center gap-3">
            {championTeam.flagUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={championTeam.flagUrl}
                alt=""
                className="h-8 w-12 shrink-0 rounded-sm object-cover"
              />
            )}
            <span className="flex-1 text-lg font-bold text-white">{championTeam.name}</span>
          </div>
          <p className="mt-2 text-sm text-caption">
            {championTeam.ownerName
              ? championTeam.ownerIsSelf
                ? "Held by you in the knockouts 🎉"
                : `Held by ${championTeam.ownerName} in the knockouts`
              : "Unowned — dropped in the knockout swap"}
          </p>
        </section>
      )}

      {/* Wooden spoon (last-place manager) */}
      {woodenSpoon.length > 0 && (
        <section className="rounded-xl border border-glow bg-panel p-4">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">
            🥄 Wooden spoon
          </h2>
          <p className="text-bodytext">
            Better luck next time, <strong className="text-white">{nameList(woodenSpoon)}</strong>.
          </p>
        </section>
      )}

      {/* Bonus-prediction callouts */}
      {bonusHighlights.length > 0 && (
        <section className="rounded-xl border border-gold/40 bg-panel p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold">
            Bonus predictions
          </h2>
          <ul className="flex flex-col gap-3">
            {bonusHighlights.map((h) => (
              <li key={h.categoryName} className="text-sm">
                <p className="text-caption">
                  {h.categoryName}: <span className="font-bold text-white">{h.answer}</span>
                </p>
                <p className="mt-0.5 text-bodytext">
                  {h.winners.length > 0 ? (
                    <>Called it: <span className="text-gold">{nameList(h.winners)}</span></>
                  ) : (
                    <span className="text-caption">Nobody called it</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
