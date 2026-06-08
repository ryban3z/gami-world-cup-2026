import { BONUS_AWARD_INFO } from "@/lib/content";

interface Category {
  id: string;
  key: string;
  name: string;
}
interface Pick {
  user_id: string;
  category_id: string;
  pick_slot: number;
  pick_value: string;
}

// Read-only reveal after lock: one card per category, each player's picks listed.
export default function RevealPicks({
  categories,
  picks,
  nameById,
}: {
  categories: Category[];
  picks: Pick[];
  nameById: Record<string, string>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => {
        const rows = picks
          .filter((p) => p.category_id === c.id)
          .sort((a, b) => a.pick_slot - b.pick_slot);
        const byUser = new Map<string, string[]>();
        for (const p of rows) {
          if (!byUser.has(p.user_id)) byUser.set(p.user_id, []);
          byUser.get(p.user_id)!.push(p.pick_value);
        }
        return (
          <div key={c.id} className="rounded-xl border border-glow bg-panel p-4">
            <h3 className="text-sm font-bold text-gold">{c.name}</h3>
            {BONUS_AWARD_INFO[c.key] && (
              <p className="mt-0.5 text-xs text-caption">{BONUS_AWARD_INFO[c.key]}</p>
            )}
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {[...byUser.entries()].map(([uid, vals]) => (
                <li key={uid} className="flex justify-between gap-2">
                  <span className="text-caption">{nameById[uid] ?? "player"}</span>
                  <span className="text-right text-white">{vals.join(", ")}</span>
                </li>
              ))}
              {byUser.size === 0 && <li className="text-caption">No picks.</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
