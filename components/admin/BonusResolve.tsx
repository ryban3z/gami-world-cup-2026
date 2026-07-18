import { pressable } from "@/lib/ui";
import { resolveCategory } from "@/app/(app)/admin/actions";
import { TEAM_PICK_KEYS } from "@/lib/scoring";
import type { WoodenSpoonRow } from "@/lib/woodenSpoonView";
import { woodenSpoonCandidates } from "@/lib/woodenSpoonView";

export interface ResolveCategory {
  id: string;
  key: string;
  name: string;
  resolved_answer: string | null;
  suggestions: string[]; // distinct submitted pick_values
}

const gd = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

// The computed wooden-spoon hint: worst by fewest points → goal difference. A
// single candidate is the clear answer (prefilled below); more than one is a
// genuine tie for the managers' vote to break, so the admin enters the winner.
function WoodenSpoonHint({ standings }: { standings: WoodenSpoonRow[] }) {
  if (standings.length === 0) {
    return <p className="mb-2 text-xs text-caption">No completed group matches yet — resolve once the group stage is done.</p>;
  }
  const candidates = woodenSpoonCandidates(standings);
  return (
    <div className="mb-2 rounded-lg border border-glow bg-navy p-2 text-xs">
      {candidates.length === 1 ? (
        <p className="text-white">
          Computed worst:{" "}
          <span className="font-bold text-gold">{candidates[0].name}</span>{" "}
          <span className="text-caption">
            ({candidates[0].points} pts, GD {gd(candidates[0].goal_difference)})
          </span>
        </p>
      ) : (
        <p className="text-white">
          <span className="font-bold text-gold">Tied for worst</span> on points and
          goal difference — managers vote, then enter the winner:{" "}
          <span className="text-caption">
            {candidates
              .map((c) => `${c.name} (${c.points} pts, GD ${gd(c.goal_difference)})`)
              .join(" · ")}
          </span>
        </p>
      )}
    </div>
  );
}

export default function BonusResolve({
  categories,
  woodenSpoonStandings = [],
  savedId = null,
  locked = false,
  teamNames = [],
}: {
  categories: ResolveCategory[];
  woodenSpoonStandings?: WoodenSpoonRow[];
  // Category id that was just saved (from ?saved=…) — flags it with a tick.
  savedId?: string | null;
  // Tournament complete → answers frozen, forms become read-only.
  locked?: boolean;
  // Seeded team names: team-pick categories resolve via a dropdown of these
  // (scoring compares the answer against dropdown-entered picks, so a typed
  // answer risks a silent mismatch).
  teamNames?: string[];
}) {
  return (
    <section id="resolve" className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-gold">Resolve bonus categories</h2>
      <p className="mb-3 text-xs text-caption">
        {locked
          ? "Tournament completed — answers are locked."
          : "Answers save immediately and stay editable until you complete the tournament."}
      </p>
      <ul className="flex flex-col gap-4">
        {categories.map((c) => {
          const isSpoon = c.key === "wooden_spoon";
          const justSaved = savedId === c.id;
          // Prefill the answer with the clear computed worst team (single
          // candidate) when the category isn't resolved yet; the admin can override.
          const spoonPrefill =
            isSpoon && !c.resolved_answer && woodenSpoonCandidates(woodenSpoonStandings).length === 1
              ? woodenSpoonCandidates(woodenSpoonStandings)[0].name
              : null;
          return (
            <li key={c.id}>
              <p className="mb-1 flex flex-wrap items-center gap-2 text-sm text-white">
                <span>{c.name}</span>
                {c.resolved_answer && <span className="text-caption">→ {c.resolved_answer}</span>}
                {justSaved && (
                  <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-bold text-green-300">
                    Saved ✓
                  </span>
                )}
              </p>
              {isSpoon && !locked && <WoodenSpoonHint standings={woodenSpoonStandings} />}
              {c.suggestions.length > 0 && !locked && (
                <p className="mb-2 text-xs text-caption">Submitted: {c.suggestions.join(", ")}</p>
              )}
              {locked ? (
                <p className="text-sm text-caption">
                  {c.resolved_answer ? (
                    <>Final answer: <span className="text-white">{c.resolved_answer}</span></>
                  ) : (
                    "Left unresolved."
                  )}
                </p>
              ) : (
                <form action={resolveCategory} className="flex items-center gap-2">
                  <input type="hidden" name="category_id" value={c.id} />
                  {TEAM_PICK_KEYS.has(c.key) && teamNames.length > 0 ? (
                    // Team-pick answers come from the same seeded list the
                    // managers picked from — no typed answer to mismatch.
                    <select name="answer" defaultValue={c.resolved_answer ?? spoonPrefill ?? ""}
                      className="flex-1 rounded bg-navy p-1 text-white" aria-label="answer">
                      <option value="">— select team —</option>
                      {teamNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    <input name="answer" defaultValue={c.resolved_answer ?? spoonPrefill ?? ""} placeholder="winning answer"
                      className="flex-1 rounded bg-navy p-1 text-white" aria-label="answer" />
                  )}
                  <button className={`rounded-full border border-gold px-3 py-1 text-xs font-bold text-gold ${pressable}`}>
                    {c.resolved_answer ? "Update" : "Save"}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
