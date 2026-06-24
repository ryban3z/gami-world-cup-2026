import { setWildcard, clearWildcard } from "@/app/(app)/knockout/actions";
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
interface Pending {
  category_id: string;
  pick_slot: number;
  new_value: string;
}

// Wildcard: change a single bonus pick (one slot of one category). The choice is
// pending and editable — each pick is its own form; submitting one sets/replaces
// the pending wildcard (one per manager). It's applied to the prediction only
// when the admin resolves, so it can be changed or cleared until then.
export default function WildcardForm({
  categories,
  teams,
  picksByKey,
  pending,
}: {
  categories: Category[];
  teams: Team[];
  picksByKey: Record<string, string>;
  pending: Pending | null;
}) {
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "a category";

  return (
    <div className="flex flex-col gap-4">
      {pending ? (
        <div className="flex flex-col gap-2 rounded-xl border border-gold/50 bg-navy/40 p-4">
          <p className="text-sm text-bodytext">
            Your pending wildcard:{" "}
            <strong className="text-gold">{categoryName(pending.category_id)}</strong>
            {" — "}pick {pending.pick_slot} →{" "}
            <strong className="text-white">{pending.new_value}</strong>
          </p>
          <form action={clearWildcard}>
            <SubmitButton
              pendingLabel="Clearing…"
              className="rounded-full border border-glow px-4 py-2 text-sm text-caption"
            >
              Clear wildcard
            </SubmitButton>
          </form>
          <p className="text-xs text-caption">
            You can change or clear this until the admin closes the window.
          </p>
        </div>
      ) : (
        <p className="text-xs text-caption">
          Pick one answer to change. You can edit or clear it until the window closes.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {categories.flatMap((c) => {
          const isTeam = TEAM_PICK_KEYS.has(c.key);
          const slots = isTeam ? [1] : [1, 2];
          return slots.map((slot) => {
            const isPending = pending?.category_id === c.id && pending?.pick_slot === slot;
            // Prefill: the pending new value on the chosen slot, else current pick.
            const val = isPending ? pending!.new_value : picksByKey[`${c.id}_${slot}`] ?? "";
            // Two-answer categories label each guess; team picks are single-slot.
            const heading = isTeam ? c.name : `${c.name} — pick ${slot}`;
            return (
              <form
                key={`${c.id}_${slot}`}
                action={setWildcard}
                className={`flex flex-col gap-2 rounded-xl border bg-panel p-4 ${
                  isPending ? "border-gold" : "border-glow"
                }`}
              >
                <input type="hidden" name="category_id" value={c.id} />
                <input type="hidden" name="pick_slot" value={slot} />
                <h3 className="text-sm font-bold text-gold">
                  {heading}
                  {isPending && <span className="ml-2 text-xs text-caption">(your wildcard)</span>}
                </h3>
                {BONUS_AWARD_INFO[c.key] && (
                  <p className="text-xs text-caption">{BONUS_AWARD_INFO[c.key]}</p>
                )}
                {isTeam ? (
                  <select name="value" defaultValue={val} className="rounded border p-3">
                    <option value="">— pick a team —</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="value"
                    defaultValue={val}
                    placeholder={`Pick ${slot}`}
                    className="rounded border p-3"
                  />
                )}
                <SubmitButton
                  pendingLabel="Saving…"
                  className="mt-1 rounded-full border border-gold px-4 py-2 text-sm font-bold text-gold transition hover:bg-gold hover:text-navy"
                >
                  {isPending ? "Update wildcard" : "Use wildcard here"}
                </SubmitButton>
              </form>
            );
          });
        })}
      </div>
    </div>
  );
}
