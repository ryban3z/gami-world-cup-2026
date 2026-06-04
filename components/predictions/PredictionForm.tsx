import { savePredictions } from "@/app/(app)/predictions/actions";
import SubmitButton from "@/components/SubmitButton";

interface Category {
  id: string;
  key: string;
  name: string;
}
interface Team {
  id: string;
  name: string;
}

// Editable form: 2 inputs per active category. The Tournament Winner category
// (key 'tournament_winner') renders team dropdowns; the rest are free text.
// Prefilled from the caller's existing picks. One Save action for the whole form.
export default function PredictionForm({
  categories,
  teams,
  picksByKey,
}: {
  categories: Category[];
  teams: Team[];
  picksByKey: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <form action={savePredictions} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map((c) => {
          const isWinner = c.key === "tournament_winner";
          return (
            <div key={c.id} className="rounded-xl border border-glow bg-panel p-4">
              <h3 className="mb-2 text-sm font-bold text-gold">{c.name}</h3>
              <div className="flex flex-col gap-2">
                {[1, 2].map((slot) => {
                  const name = `c_${c.id}_${slot}`;
                  const val = picksByKey[`${c.id}_${slot}`] ?? "";
                  return isWinner ? (
                    <select key={slot} name={name} defaultValue={val} className="rounded border p-3">
                      <option value="">— pick a team —</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      key={slot}
                      name={name}
                      defaultValue={val}
                      placeholder={`Pick ${slot}`}
                      className="rounded border p-3"
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-full bg-gold px-6 py-3 font-bold text-navy transition hover:brightness-110"
        >
          Save predictions
        </SubmitButton>
      </form>
    </div>
  );
}
