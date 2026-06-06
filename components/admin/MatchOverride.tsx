import { pressable } from "@/lib/ui";
import { overrideMatch } from "@/app/(app)/admin/actions";

export interface OverrideMatch {
  id: string;
  label: string; // e.g. "GROUP A — Mexico vs South Africa"
  home_score: number | null;
  away_score: number | null;
  status: string;
  is_manual_override: boolean;
}

export default function MatchOverride({ matches }: { matches: OverrideMatch[] }) {
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Match override</h2>
      <ul className="flex flex-col gap-3">
        {matches.map((m) => (
          <li key={m.id} className="rounded-lg border border-glow p-3">
            <p className="mb-2 text-sm text-white">
              {m.label} {m.is_manual_override && <span className="text-caption">(overridden)</span>}
            </p>
            <form action={overrideMatch} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="match_id" value={m.id} />
              <input name="home_score" type="number" min={0} defaultValue={m.home_score ?? 0}
                className="w-14 rounded bg-navy p-1 text-center text-white" aria-label="home score" />
              <span className="text-caption">–</span>
              <input name="away_score" type="number" min={0} defaultValue={m.away_score ?? 0}
                className="w-14 rounded bg-navy p-1 text-center text-white" aria-label="away score" />
              <select name="status" defaultValue={m.status}
                className="rounded bg-navy p-1 text-white" aria-label="status">
                <option value="scheduled">scheduled</option>
                <option value="live">live</option>
                <option value="final">final</option>
              </select>
              <button className={`rounded-full border border-gold px-3 py-1 text-xs font-bold text-gold ${pressable}`}>
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
