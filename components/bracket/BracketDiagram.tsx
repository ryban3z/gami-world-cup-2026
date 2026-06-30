import type { BracketView, BracketColumn, BracketMatchCell } from "@/lib/bracketView";
import BracketMatch from "./BracketMatch";

// Shared header height so every column's match body starts at the same y —
// otherwise the equal-slot centring below would be offset between columns.
const HEADER = "flex h-6 items-center justify-center text-[10px] font-bold uppercase tracking-wide";

// A round-column laid out as equal flex slots: the body is split into one
// `flex-1` slot per match, each centred. R32 has 16 slots and drives the shared
// (stretched) height, so an R16 column's 8 slots are each exactly 2× an R32 slot
// — its centred card lands at the midpoint of the two R32 cards that feed it.
function Column({ col }: { col: BracketColumn }) {
  return (
    <div className="flex shrink-0 flex-col">
      <h3 className={`${HEADER} text-caption`}>{col.label}</h3>
      <div className="flex flex-1 flex-col">
        {col.matches.map((m) => (
          <div key={m.externalId} className="flex flex-1 items-center justify-center py-1.5">
            <BracketMatch match={m} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Right-most column: the final (with a champion line once decided), centred so
// it aligns with the midpoint of the two semi-finals, and the third-place
// play-off stacked beneath.
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
    <div className="flex shrink-0 flex-col">
      <h3 className={`${HEADER} text-gold`}>Final</h3>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-1.5">
        <div className="flex flex-col items-center">
          <BracketMatch match={final} />
          {champ?.name && (
            <p className="mt-2 text-center text-xs font-bold text-gold">🏆 {champ.name}</p>
          )}
        </div>
        <div className="flex flex-col items-center">
          <h4 className="mb-1 text-center text-[10px] font-bold uppercase tracking-wide text-caption">
            Third place
          </h4>
          <BracketMatch match={thirdPlace} />
        </div>
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
