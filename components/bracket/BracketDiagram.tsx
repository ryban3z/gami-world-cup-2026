import { Fragment } from "react";
import type { BracketView, BracketColumn, BracketMatchCell } from "@/lib/bracketView";
import BracketMatch from "./BracketMatch";

// Shared header height so every column's match body starts at the same y —
// otherwise the equal-slot centring + connectors below would be offset.
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

// Connector column between two rounds: one cell per child match. Each cell spans
// two feeder slots (feeders centred at 25% / 75%, child at 50%), and draws the
// bracket "⊣": arms out to the two feeders, a vertical join, and a lead-out to
// the child. Heights come from flex ratios 1:2:1 (= 25% / 50% / 25%).
function Connector({ cells }: { cells: number }) {
  return (
    <div className="flex w-6 shrink-0 flex-col">
      <div className={HEADER} />
      <div className="flex flex-1 flex-col">
        {Array.from({ length: cells }).map((_, i) => (
          <div key={i} className="flex flex-1">
            <div className="flex w-1/2 flex-col">
              <div className="flex-1" />
              {/* 25%–75% band: right border = vertical join, top/bottom borders = arms to feeders */}
              <div className="flex-[2] border-y border-r border-glow/80" />
              <div className="flex-1" />
            </div>
            <div className="flex w-1/2 items-center">
              <div className="h-px w-full bg-glow/80" /> {/* lead-out to the child */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Right-most column: the final centred (so the SF→Final lead-out meets it), with
// a champion line once decided, and the third-place play-off pinned beneath.
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
      <div className="relative flex flex-1 flex-col items-center justify-center">
        <div className="flex flex-col items-center">
          <BracketMatch match={final} />
          {champ?.name && (
            <p className="mt-2 text-center text-xs font-bold text-gold">🏆 {champ.name}</p>
          )}
        </div>
        <div className="absolute bottom-0 flex flex-col items-center">
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
    // strictly left→right: R32 → R16 → QF → SF → (Final / Third place), with a
    // connector column drawing the path between each round (gap-0; the connectors
    // supply the spacing).
    <div className="-mx-6 overflow-x-auto px-6 pb-2">
      <div className="flex min-w-max items-stretch">
        {view.columns.map((c, i) => (
          <Fragment key={c.stage}>
            <Column col={c} />
            <Connector cells={i + 1 < view.columns.length ? view.columns[i + 1].matches.length : 1} />
          </Fragment>
        ))}
        <FinaleColumn final={view.final} thirdPlace={view.thirdPlace} />
      </div>
    </div>
  );
}
