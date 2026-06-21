import type { GoldenBootPickRow, GoldenBootStatus } from "@/lib/bonusTrackerView";

// Live status badge for a manager's Golden Boot pick vs the current board.
const BADGE: Record<GoldenBootStatus, { icon: string; label: string; cls: string }> = {
  leading: { icon: "👑", label: "Leading", cls: "text-gold" },
  contention: { icon: "▲", label: "In contention", cls: "text-white" },
  off: { icon: "✗", label: "Off the board", cls: "text-caption" },
};

function PickRow({ p }: { p: GoldenBootPickRow }) {
  const b = BADGE[p.status];
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm leading-5">
      <span className="min-w-0 flex-1 truncate">
        <span className="text-caption">{p.managerName}</span>
        <span className="text-white"> · {p.playerName}</span>
      </span>
      {p.goals != null && (
        <span className="shrink-0 tabular-nums text-caption">
          {p.goals} {p.goals === 1 ? "goal" : "goals"}
        </span>
      )}
      <span className={`shrink-0 text-right text-xs font-bold ${b.cls}`} title={b.label}>
        {b.icon} {b.label}
      </span>
    </li>
  );
}

// Who's currently on track for the Golden Boot — each manager's pick scored
// against the live scorers board. Only meaningful once predictions have locked
// (before that, picks are private and the list is empty).
export default function GoldenBootTracker({ picks }: { picks: GoldenBootPickRow[] }) {
  return (
    <section className="rounded-xl border border-glow bg-panel p-4">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-caption">Golden Boot picks · live</h2>
      {picks.length > 0 ? (
        <ul className="flex flex-col">{picks.map((p, i) => <PickRow key={`${p.managerName}-${p.playerName}-${i}`} p={p} />)}</ul>
      ) : (
        <p className="text-sm text-caption">Picks are revealed once predictions lock at kickoff.</p>
      )}
    </section>
  );
}
