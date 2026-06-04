import { myPickSlots } from "@/lib/draftView";
import type { BoardTeam } from "./DraftStatus";

// The caller's roster filling up during the draft. The first empty slot is
// highlighted as "pick now" when it's the caller's turn. Pure presentational.
export default function MyPicks({
  myTeamIds,
  board,
  slotCount,
  isMyTurn,
}: {
  myTeamIds: string[];
  board: BoardTeam[];
  slotCount: number;
  isMyTurn: boolean;
}) {
  const slots = myPickSlots(myTeamIds, board, slotCount);
  const filled = myTeamIds.length;

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-caption">
        My picks ({filled} / {slotCount})
      </h2>
      <div className="flex gap-2">
        {slots.map((slot, i) => {
          const isNextToPick = isMyTurn && i === filled;
          if (slot) {
            return (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-gold bg-panel p-3 text-center"
              >
                {slot.flag_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={slot.flag_url} alt="" className="h-5 w-8 rounded-sm object-cover" />
                )}
                <span className="text-[11px] text-white">{slot.name}</span>
              </div>
            );
          }
          return (
            <div
              key={i}
              className={[
                "flex flex-1 items-center justify-center rounded-lg border border-dashed p-3 text-center text-[11px]",
                isNextToPick ? "border-gold text-gold" : "border-glow text-caption",
              ].join(" ")}
            >
              {isNextToPick ? "pick now" : "—"}
            </div>
          );
        })}
      </div>
    </section>
  );
}
