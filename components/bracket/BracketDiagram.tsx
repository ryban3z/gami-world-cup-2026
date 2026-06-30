import type { BracketView, BracketColumn, BracketMatchCell } from "@/lib/bracketView";
import BracketMatch from "./BracketMatch";

// A vertical round-column. `justify-around` spreads the matches so each later
// round sits centred between the two feeders that produced it — the classic
// bracket taper toward the final.
function Column({ col }: { col: BracketColumn }) {
  return (
    <div className="flex shrink-0 flex-col">
      <h3 className="mb-2 text-center text-[10px] font-bold uppercase tracking-wide text-caption">
        {col.label}
      </h3>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {col.matches.map((m) => (
          <BracketMatch key={m.externalId} match={m} />
        ))}
      </div>
    </div>
  );
}

// Right-most column: the final (with a champion line once decided) stacked above
// the third-place play-off.
function FinaleColumn({ final, thirdPlace }: { final: BracketMatchCell; thirdPlace: BracketMatchCell }) {
  const champ =
    final.status === "final"
      ? final.home.isWinner
        ? final.home
        : final.away.isWinner
          ? final.away
          : null
      : null;
  return (
    <div className="flex shrink-0 flex-col justify-center gap-4">
      <div className="flex flex-col items-center">
        <h3 className="mb-2 text-center text-xs font-bold uppercase tracking-wide text-gold">Final</h3>
        <BracketMatch match={final} />
        {champ?.name && (
          <p className="mt-2 text-center text-xs font-bold text-gold">🏆 {champ.name}</p>
        )}
      </div>
      <div className="flex flex-col items-center">
        <h3 className="mb-1 text-center text-[10px] font-bold uppercase tracking-wide text-caption">
          Third place
        </h3>
        <BracketMatch match={thirdPlace} />
      </div>
    </div>
  );
}

export default function BracketDiagram({ view }: { view: BracketView }) {
  return (
    // The full draw is wider than a phone — scroll it horizontally. Columns flow
    // strictly left→right: R32 → R16 → QF → SF → (Final / Third place).
    <div className="-mx-6 overflow-x-auto px-6 pb-2">
      <div className="flex min-w-max items-stretch gap-3 sm:gap-4">
        {view.columns.map((c) => (
          <Column key={c.stage} col={c} />
        ))}
        <FinaleColumn final={view.final} thirdPlace={view.thirdPlace} />
      </div>
    </div>
  );
}
