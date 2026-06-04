import { snakeRailForRound, type RailStatus } from "@/lib/draftView";

// Horizontal snake-order pills for the current round. Pure presentational.
const PILL: Record<RailStatus, string> = {
  done: "border-glow bg-panel text-caption opacity-50",
  now: "border-gold bg-gold font-bold text-navy",
  next: "border-gold text-gold",
  upcoming: "border-glow bg-panel text-bodytext",
};

export default function DraftOrderRail({
  orderNames,
  picksMade,
  playerCount,
}: {
  orderNames: string[];
  picksMade: number;
  playerCount: number;
}) {
  const { round, entries } = snakeRailForRound(orderNames, picksMade, playerCount);

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-caption">
        Draft order · Round {round}
      </h2>
      <div className="flex flex-wrap gap-2">
        {entries.map((e, i) => (
          <span
            key={`${e.name}-${i}`}
            className={`rounded-full border px-3 py-1 text-xs ${PILL[e.status]}`}
          >
            {e.name}
            {e.status === "next" && " ▸"}
          </span>
        ))}
      </div>
    </section>
  );
}
