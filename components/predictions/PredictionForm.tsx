import { savePredictions } from "@/app/(app)/predictions/actions";
import SubmitButton from "@/components/SubmitButton";
import { BONUS_AWARD_INFO } from "@/lib/content";

// Categories whose picks are teams (rendered as dropdowns). All other
// categories are free text. These are also single-pick: there's exactly one
// winner / runner-up / worst team, so they get one slot, not two. Player
// awards (Golden Boot, etc.) allow two guesses. Mirrors the DB guard in
// save_bonus_category and the scoring engine's TEAM_PICK_KEYS.
const TEAM_PICK_KEYS = new Set(["tournament_winner", "runner_up", "wooden_spoon"]);

interface Category {
  id: string;
  key: string;
  name: string;
}
interface Team {
  id: string;
  name: string;
}

// Editable form: 2 inputs per active category. Team-pick categories (see
// TEAM_PICK_KEYS) render team dropdowns; the rest are free text.
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
          const isTeam = TEAM_PICK_KEYS.has(c.key);
          // Team picks are single-pick (one slot); player awards get two.
          const slots = isTeam ? [1] : [1, 2];
          return (
            <div key={c.id} className="rounded-xl border border-glow bg-panel p-4">
              <h3 className="text-sm font-bold text-gold">{c.name}</h3>
              {BONUS_AWARD_INFO[c.key] && (
                <p className="mb-2 mt-0.5 text-xs text-caption">{BONUS_AWARD_INFO[c.key]}</p>
              )}
              <div className="flex flex-col gap-2">
                {slots.map((slot) => {
                  const name = `c_${c.id}_${slot}`;
                  const val = picksByKey[`${c.id}_${slot}`] ?? "";
                  return isTeam ? (
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
