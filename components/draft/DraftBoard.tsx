"use client";
import { useState, useTransition } from "react";
import type { BoardTeam } from "./DraftStatus";

// Groups the 48 teams A–L. During the draft, available teams are tappable only
// on your turn; tapping selects, then a confirm bar commits via makePick.
export default function DraftBoard({
  board,
  isMyTurn,
  myTeamIds,
  revealed,
  makePick,
}: {
  board: BoardTeam[];
  isMyTurn: boolean;
  myTeamIds: string[];
  revealed: boolean;
  makePick: (teamId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<BoardTeam | null>(null);
  const [pending, startTransition] = useTransition();
  const mine = new Set(myTeamIds);

  // Group by letter, preserving the board's A→L, name-sorted order.
  const groups = new Map<string, BoardTeam[]>();
  for (const t of board) {
    const key = t.group_letter ?? "?";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  function confirm() {
    if (!selected) return;
    const id = selected.id;
    startTransition(async () => {
      await makePick(id);
      setSelected(null);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {[...groups.entries()].map(([letter, teams]) => (
        <div key={letter}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-caption">
            Group {letter}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {teams.map((t) => {
              const isMine = mine.has(t.id);
              const tappable = isMyTurn && !t.taken && !pending;
              return (
                <button
                  key={t.id}
                  disabled={!tappable}
                  onClick={() => tappable && setSelected(t)}
                  className={[
                    "flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition",
                    t.taken
                      ? isMine
                        ? "border-gold/60 bg-panel text-gold"
                        : "border-glow bg-panel/50 text-caption opacity-60"
                      : tappable
                        ? "border-glow bg-panel text-white hover:border-gold hover:brightness-110"
                        : "border-glow bg-panel text-bodytext",
                  ].join(" ")}
                >
                  {t.flag_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.flag_url} alt="" className="h-4 w-6 shrink-0 rounded-sm object-cover" />
                  )}
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.taken && (
                    <span className="text-[10px] uppercase">
                      {revealed && t.owner_name ? t.owner_name : isMine ? "yours" : "taken"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-glow bg-navy/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <span className="text-sm">
              Draft <strong className="text-gold">{selected.name}</strong>?
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(null)}
                disabled={pending}
                className="rounded-full border border-glow px-4 py-2 text-sm text-caption"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={pending}
                className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-navy transition hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Picking…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
