import { useWildcard } from "@/app/(app)/knockout/actions";
import SubmitButton from "@/components/SubmitButton";
import { BONUS_AWARD_INFO } from "@/lib/content";

// Team-pick categories render a single team dropdown; the rest are free text
// with two slots. Mirrors PredictionForm / the save RPC / the scoring engine.
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

// One-time wildcard: re-answer one whole bonus category. Each category is its
// own form (prefilled with the caller's current picks); submitting one spends
// the wildcard, after which the page hides this form. The DB enforces the
// one-time rule regardless.
export default function WildcardForm({
  categories,
  teams,
  picksByKey,
}: {
  categories: Category[];
  teams: Team[];
  picksByKey: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {categories.map((c) => {
        const isTeam = TEAM_PICK_KEYS.has(c.key);
        const slots = isTeam ? [1] : [1, 2];
        return (
          <form
            key={c.id}
            action={useWildcard}
            className="flex flex-col gap-2 rounded-xl border border-glow bg-panel p-4"
          >
            <input type="hidden" name="category_id" value={c.id} />
            <h3 className="text-sm font-bold text-gold">{c.name}</h3>
            {BONUS_AWARD_INFO[c.key] && (
              <p className="text-xs text-caption">{BONUS_AWARD_INFO[c.key]}</p>
            )}
            {slots.map((slot) => {
              const name = `w${slot}`;
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
            <SubmitButton
              pendingLabel="Using…"
              className="mt-1 rounded-full border border-gold px-4 py-2 text-sm font-bold text-gold transition hover:bg-gold hover:text-navy"
            >
              Use wildcard here
            </SubmitButton>
          </form>
        );
      })}
    </div>
  );
}
