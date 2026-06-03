import type { BoardTeam, Roster } from "./DraftStatus";

// After group_locked: one card per player with their 3 teams, in pick order.
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
        <div key={r.user_id} className="rounded-xl border border-glow bg-panel p-4">
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
        </div>
      ))}
    </div>
  );
}
