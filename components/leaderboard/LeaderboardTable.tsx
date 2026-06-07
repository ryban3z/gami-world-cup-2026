"use client";
import { useState } from "react";
import type { LeaderRow } from "@/lib/leaderboardView";
import { pressable, focusRing } from "@/lib/ui";

// Ranked leaderboard. Tapping a row toggles its score breakdown (group/knockout/
// bonus totals + per-team points). The viewer's own row is gold-bordered; the
// leader gets a 🏆 once the tournament is complete.
export default function LeaderboardTable({
  rows,
  complete,
}: {
  rows: LeaderRow[];
  complete: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-bodytext">No scores yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const open = openId === r.userId;
        return (
          <li
            key={r.userId}
            className={`rounded-xl border bg-panel ${r.isSelf ? "border-gold" : "border-glow"}`}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.userId)}
              aria-expanded={open}
              className={`flex w-full items-center gap-3 p-4 text-left ${pressable} ${focusRing}`}
            >
              <span className="w-6 text-center text-sm font-bold text-caption">{r.rank}</span>
              <span className="flex-1 font-bold text-white">
                {complete && r.rank === 1 ? "🏆 " : ""}
                {r.displayName}
                {r.isSelf && <span className="ml-1 text-xs text-caption">(you)</span>}
              </span>
              <span className="text-lg font-bold text-gold">{r.total}</span>
              <span className="text-caption">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
              <div className="border-t border-glow px-4 py-3 text-sm">
                <div className="mb-2 flex gap-4 text-caption">
                  <span>Group <strong className="text-white">{r.group}</strong></span>
                  <span>Knockout <strong className="text-white">{r.knockout}</strong></span>
                  <span>Bonus <strong className="text-white">{r.bonus}</strong></span>
                </div>
                {r.byTeam.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {r.byTeam.map((t, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {t.flagUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.flagUrl} alt="" className="h-4 w-6 rounded-sm object-cover" />
                        )}
                        <span className="flex-1 text-white">{t.name}</span>
                        <span className="text-xs text-caption">{t.phase === "group" ? "group" : "KO"}</span>
                        <span className="font-bold text-gold">+{t.points}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-caption">No team points yet.</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
