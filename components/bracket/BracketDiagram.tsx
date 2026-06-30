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

function CentreColumn({ final, thirdPlace }: { final: BracketMatchCell; thirdPlace: BracketMatchCell }) {
  // Crown the champion when the final has a decided winner.
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
    <div className="flex flex-col gap-4">
      {/* The full tree is wider than a phone — scroll it horizontally. The two
          halves flow inward: left columns L→R, right columns rendered reversed
          so the semi-finals sit either side of the centred final. */}
      <div className="-mx-6 overflow-x-auto px-6 pb-2">
        <div className="flex min-w-max items-stretch gap-3 sm:gap-4">
          {view.leftColumns.map((c) => (
            <Column key={`l-${c.stage}`} col={c} />
          ))}
          <CentreColumn final={view.final} thirdPlace={view.thirdPlace} />
          {[...view.rightColumns].reverse().map((c) => (
            <Column key={`r-${c.stage}`} col={c} />
          ))}
        </div>
      </div>

      {view.pendingR32.length > 0 && (
        <section className="rounded-xl border border-glow bg-panel p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-caption">
            Round of 32 — awaiting result
          </h3>
          <p className="mb-3 text-xs text-caption">
            These ties slot into the bracket above once a winner is decided.
          </p>
          <div className="flex flex-wrap gap-3">
            {view.pendingR32.map((m) => (
              <BracketMatch key={m.externalId} match={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
