import type { LeaderRow } from "@/lib/leaderboardView";
import { pressableLink } from "@/lib/ui";

// Compact top-3 leaderboard card for /home, linking to the full /leaderboard.
export default function LeaderboardSummary({ rows }: { rows: LeaderRow[] }) {
  const top = rows.slice(0, 3);
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold">Leaderboard</h2>
      {top.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {top.map((r) => (
            <li key={r.userId} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-center font-bold text-caption">{r.rank}</span>
              {r.avatarUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={r.avatarUrl}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full border border-glow object-cover"
                />
              )}
              <span className={`flex-1 ${r.isSelf ? "font-bold text-white" : "text-bodytext"}`}>
                {r.displayName}
                {r.isSelf && <span className="ml-1 text-xs text-caption">(you)</span>}
              </span>
              <span className="font-bold text-gold">{r.total}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-caption">No scores yet.</p>
      )}
      <a href="/leaderboard" className={`mt-3 inline-block text-sm text-gold underline ${pressableLink}`}>
        Full leaderboard →
      </a>
    </section>
  );
}
