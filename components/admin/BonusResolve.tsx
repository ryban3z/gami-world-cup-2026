import { pressable } from "@/lib/ui";
import { resolveCategory } from "@/app/(app)/admin/actions";

export interface ResolveCategory {
  id: string;
  name: string;
  resolved_answer: string | null;
  suggestions: string[]; // distinct submitted pick_values
}

export default function BonusResolve({ categories }: { categories: ResolveCategory[] }) {
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">Resolve bonus categories</h2>
      <ul className="flex flex-col gap-4">
        {categories.map((c) => (
          <li key={c.id}>
            <p className="mb-1 text-sm text-white">
              {c.name}{" "}
              {c.resolved_answer && <span className="text-caption">→ {c.resolved_answer}</span>}
            </p>
            {c.suggestions.length > 0 && (
              <p className="mb-2 text-xs text-caption">Submitted: {c.suggestions.join(", ")}</p>
            )}
            <form action={resolveCategory} className="flex items-center gap-2">
              <input type="hidden" name="category_id" value={c.id} />
              <input name="answer" defaultValue={c.resolved_answer ?? ""} placeholder="winning answer"
                className="flex-1 rounded bg-navy p-1 text-white" aria-label="answer" />
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
