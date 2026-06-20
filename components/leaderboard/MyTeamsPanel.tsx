import type { MyTeamStatus } from "@/lib/leaderboardView";

// The viewer's teams with a status badge: gold for champion, red for eliminated,
// green for a clinched group qualification, neutral for still-alive (showing the
// furthest stage reached).
export default function MyTeamsPanel({ teams }: { teams: MyTeamStatus[] }) {
  if (teams.length === 0) return null;
  return (
    <section className="rounded-xl border border-glow bg-panel p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-caption">My teams</h2>
      <ul className="flex flex-col gap-2">
        {teams.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {t.flagUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={t.flagUrl} alt="" className="h-4 w-6 rounded-sm object-cover" />
            )}
            <span className="flex-1 text-white">{t.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                t.isChampion
                  ? "bg-gold text-navy"
                  : t.isEliminated
                    ? "border border-red-400/50 text-red-300"
                    : t.isQualified
                      ? "border border-green-400/50 text-green-300"
                      : "border border-glow text-caption"
              }`}
            >
              {t.stageLabel}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
