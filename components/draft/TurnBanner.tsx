import { turnContext } from "@/lib/draftView";

// The "on the clock" banner shown during phase === 'draft'. Replaces the bare
// status line. Pure presentational; all data comes from draft_state().
export default function TurnBanner({
  isMyTurn,
  currentUserName,
  picksMade,
  picksTotal,
  playerCount,
}: {
  isMyTurn: boolean;
  currentUserName: string | null;
  picksMade: number;
  picksTotal: number;
  playerCount: number;
}) {
  const ctx = turnContext(picksMade, picksTotal, playerCount);
  const subline = `Pick ${ctx.pickNumber} of ${ctx.picksTotal} · Round ${ctx.round} · pick your ${ctx.teamOrdinal} team`;

  if (isMyTurn) {
    return (
      <div className="rounded-xl border border-gold bg-gradient-to-b from-[#1a2350] to-panel p-4 text-center">
        <p className="text-lg font-black uppercase tracking-wide text-gold">
          ⏰ You&apos;re on the clock
        </p>
        <p className="mt-1 text-xs text-bodytext">{subline}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-glow bg-panel p-4 text-center">
      <p className="text-base font-bold">
        Waiting on <span className="text-white">{currentUserName ?? "the current player"}</span>…
      </p>
      <p className="mt-1 text-xs text-caption">{subline}</p>
    </div>
  );
}
