import type { BoardTeam, Roster } from "./DraftStatus";
import { pressable } from "@/lib/ui";

// After group_locked: one card per manager with their teams, in pick order.
// Each card links to that manager's profile page.
export default function Rosters({
  rosters,
  board,
}: {
  rosters: Roster[];
  board: BoardTeam[];
}) {
  const byId = new Map(board.map((t) => [t.id, t]));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rosters.map((r) => (
        <a
          key={r.user_id}
          href={`/managers/${r.user_id}`}
          className={`block rounded-xl border border-glow bg-panel p-4 hover:border-gold ${pressable}`}
        >
          <h3 className="text-sm font-bold uppercase tracking-wide text-gold">
            {r.display_name}
          </h3>
          <ul className="mt-2 flex flex-col gap-1">
            {r.team_ids.map((id) => {
              const t = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 text-sm text-white">
                  {t?.flag_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.flag_url} alt="" className="h-4 w-6 rounded-sm object-cover" />
                  )}
                  <span>{t?.name ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        </a>
      ))}
    </div>
  );
}
