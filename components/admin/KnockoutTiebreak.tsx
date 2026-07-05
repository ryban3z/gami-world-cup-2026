import { pressable } from "@/lib/ui";
import { knockoutTiedManagerIds } from "@/lib/knockoutView";
import { setKnockoutTiebreak } from "@/app/(app)/admin/actions";

export interface TiebreakStanding {
  user_id: string;
  display_name: string;
  total_points: number;
  goal_difference: number;
  tiebreak: number;
}

// Admin-only: the knockout pick order (worst-placed first) with each manager's
// points + goal difference, so the admin can spot a genuine tie — level on BOTH
// — and enter the managers'-vote result. Lower number picks earlier; only the
// tied rows need it. Shown during the knockout_realloc window.
export default function KnockoutTiebreak({ standings }: { standings: TiebreakStanding[] }) {
  const tied = knockoutTiedManagerIds(standings);
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-gold">
        Pick-order tiebreak
      </h2>
      <p className="mb-3 text-xs text-caption">
        Order is fewest points → worst goal difference → this manual tiebreak →
        reverse draft order. Only <span className="text-gold">tied</span> managers
        (level on points and GD) need a number — set a distinct value for each,
        lowest picks first. Enter the managers&apos;-vote result here before resolving.
      </p>
      <ol className="flex flex-col gap-2">
        {standings.map((s, i) => {
          const isTied = tied.has(s.user_id);
          return (
            <li
              key={s.user_id}
              className={`rounded-lg border p-2 ${isTied ? "border-gold/60 bg-navy" : "border-glow"}`}
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-white">
                  <span className="text-caption">{i + 1}.</span> {s.display_name}
                  {isTied && <span className="ml-1 text-xs font-bold text-gold">tie</span>}
                </span>
                <span className="text-xs text-caption">
                  {s.total_points} pts · GD {s.goal_difference >= 0 ? "+" : ""}
                  {s.goal_difference}
                </span>
              </div>
              <form action={setKnockoutTiebreak} className="mt-1 flex items-center gap-2">
                <input type="hidden" name="user_id" value={s.user_id} />
                <input
                  name="rank"
                  type="number"
                  defaultValue={s.tiebreak || ""}
                  placeholder="0"
                  aria-label={`Tiebreak for ${s.display_name}`}
                  className="w-20 rounded bg-navy p-1 text-white"
                />
                <button className={`rounded-full border border-gold px-3 py-1 text-xs font-bold text-gold ${pressable}`}>
                  Save
                </button>
              </form>
            </li>
          );
        })}
        {standings.length === 0 && <li className="text-sm text-caption">No managers yet.</li>}
      </ol>
    </section>
  );
}
