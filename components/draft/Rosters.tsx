import type { BoardTeam, Roster } from "./DraftStatus";
import { buildRosterCardTeams } from "@/lib/leaderboardView";
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
  qualifiedTeamIds,
}: {
  rosters: Roster[];
  board: BoardTeam[];
  profilesUnlocked?: boolean;
  teamPoints?: Record<string, number>; // `${userId}::${teamId}` → points so far
  qualifiedTeamIds?: Set<string>; // teams that have clinched a knockout spot
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
              {buildRosterCardTeams(r).map(({ teamId: id, status }) => {
                const t = byId.get(id);
                const pts = teamPoints[`${r.user_id}::${id}`] ?? 0;
                // Dropped teams don't qualify-badge (they're no longer in the squad).
                const qualified = status !== "dropped" && (qualifiedTeamIds?.has(id) ?? false);
                const dropped = status === "dropped";
                return (
                  <li
                    key={`${status}-${id}`}
                    className={`flex items-center gap-2 text-sm ${dropped ? "text-caption" : "text-white"}`}
                  >
                    {t?.flag_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={t.flag_url}
                        alt=""
                        className={`h-4 w-6 rounded-sm object-cover ${dropped ? "opacity-40 grayscale" : ""}`}
                      />
                    )}
                    <span className={`truncate ${dropped ? "line-through" : ""}`}>
                      {t?.name ?? "—"}
                    </span>
                    {status === "claimed" && (
                      <span
                        title="Picked up in the knockout swap"
                        className="shrink-0 rounded-full border border-gold/60 px-1.5 text-[10px] font-bold uppercase text-gold"
                      >
                        New
                      </span>
                    )}
                    {dropped && (
                      <span
                        title="Dropped in the knockout swap"
                        className="shrink-0 rounded-full border border-glow px-1.5 text-[10px] font-bold uppercase text-caption"
                      >
                        Dropped
                      </span>
                    )}
                    {qualified && (
                      <span
                        title="Qualified for the knockouts"
                        className="shrink-0 rounded-full border border-green-400/50 px-1.5 text-[10px] font-bold uppercase text-green-300"
                      >
                        ✓ Q
                      </span>
                    )}
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
