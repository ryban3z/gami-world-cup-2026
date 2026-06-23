import { submitSwapNomination } from "@/app/(app)/knockout/actions";
import SubmitButton from "@/components/SubmitButton";

interface Team {
  id: string;
  name: string;
  flag_url: string | null;
  group_letter: string | null;
}
interface Submission {
  drop_team_id: string | null;
  pick_team_ids: string[];
}

// Blind free-agent swap: drop one owned team and rank up to 3 unowned R32 teams.
// Prefilled from the caller's current submission; re-submitting overwrites it.
// Leaving the drop blank (or all picks blank) keeps the roster unchanged.
export default function SwapForm({
  roster,
  freeAgents,
  submission,
}: {
  roster: Team[];
  freeAgents: Team[];
  submission: Submission | null;
}) {
  const dropDefault = submission?.drop_team_id ?? "";
  const wishDefaults = submission?.pick_team_ids ?? [];

  return (
    <form action={submitSwapNomination} className="flex flex-col gap-4">
      <div className="rounded-xl border border-glow bg-panel p-4">
        <h3 className="text-sm font-bold text-gold">Drop a team</h3>
        <p className="mb-2 mt-0.5 text-xs text-caption">
          The team you&apos;re willing to give up. It only leaves your roster if you
          successfully claim a free agent below.
        </p>
        <select
          name="drop_team_id"
          defaultValue={dropDefault}
          className="w-full rounded border p-3"
        >
          <option value="">— keep all my teams —</option>
          {roster.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-glow bg-panel p-4">
        <h3 className="text-sm font-bold text-gold">Wishlist (ranked)</h3>
        <p className="mb-2 mt-0.5 text-xs text-caption">
          Up to 3 unowned teams that reached the Round of 32, best first. You&apos;ll
          be awarded your highest still-available pick when the window closes.
        </p>
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((rank) => (
            <label key={rank} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-sm font-bold text-caption">
                {rank}.
              </span>
              <select
                name={`wish_${rank}`}
                defaultValue={wishDefaults[rank - 1] ?? ""}
                className="w-full rounded border p-3"
              >
                <option value="">— no pick —</option>
                {freeAgents.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.group_letter ? `${t.group_letter} · ` : ""}
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <SubmitButton
        pendingLabel="Saving…"
        className="rounded-full bg-gold px-6 py-3 font-bold text-navy transition hover:brightness-110"
      >
        Save swap
      </SubmitButton>
    </form>
  );
}
