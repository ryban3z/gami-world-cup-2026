import type { BoardTeam, Roster } from "./DraftStatus";
import { pressable } from "@/lib/ui";

// After group_locked: one card per manager with their teams, in pick order.
// Each card links to that manager's profile page — but only once profiles are
// unlocked (predictions locked). Before that the card shows the roster but isn't
// clickable, matching the route guard on /managers/[id].
export default function Rosters({
  rosters,
  board,
  profilesUnlocked = false,
  teamPoints = {},
}: {
  rosters: Roster[];
  board: BoardTeam[];
  profilesUnlocked?: boolean;
  teamPoints?: Record<string, number>; // `${userId}::${teamId}` → points so far
}) {
  const byId = new Map(board.map((t) => [t.id, t]));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rosters.map((r) => {
        const body = (
          <>
            <h3 className="text-sm font-bold uppercase tracking-wide text-gold">
              {r.display_name}
            </h3>
            <ul className="mt-2 flex flex-col gap-1">
              {r.team_ids.map((id) => {
                const t = byId.get(id);
                const pts = teamPoints[`${r.user_id}::${id}`] ?? 0;
                return (
                  <li key={id} className="flex items-center gap-2 text-sm text-white">
                    {t?.flag_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={t.flag_url} alt="" className="h-4 w-6 rounded-sm object-cover" />
                    )}
                    <span className="truncate">{t?.name ?? "—"}</span>
                    <span className="ml-auto shrink-0 text-caption">{pts} pts</span>
                  </li>
                );
              })}
            </ul>
          </>
        );
        return profilesUnlocked ? (
          <a
            key={r.user_id}
            href={`/managers/${r.user_id}`}
            className={`block rounded-xl border border-glow bg-panel p-4 hover:border-gold ${pressable}`}
          >
            {body}
          </a>
        ) : (
          <div
            key={r.user_id}
            className="block rounded-xl border border-glow bg-panel p-4"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
