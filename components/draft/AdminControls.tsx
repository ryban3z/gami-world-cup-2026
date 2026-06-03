import { startDraft, adminAutopick } from "@/app/(app)/draft/actions";
import SubmitButton from "@/components/SubmitButton";

// Admin-only controls shown on the home dashboard. During registration: Start.
// During the draft: Auto-pick for the stalled current player (after a nudge).
export default function AdminControls({
  phase,
  currentUserName,
}: {
  phase: string;
  currentUserName: string | null;
}) {
  return (
    <section className="rounded-xl border border-gold/40 bg-panel p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-gold">Admin</h2>
      {phase === "registration" && (
        <form action={startDraft} className="mt-3">
          <SubmitButton
            pendingLabel="Starting…"
            className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-navy transition hover:brightness-110"
          >
            Start draft
          </SubmitButton>
          <p className="mt-2 text-xs text-caption">
            Randomises the pick order and opens the draft. Closes registration.
          </p>
        </form>
      )}
      {phase === "draft" && (
        <form action={adminAutopick} className="mt-3">
          <SubmitButton
            pendingLabel="Picking…"
            className="rounded-full border border-gold px-5 py-2 text-sm font-bold text-gold transition hover:bg-gold hover:text-navy"
          >
            Auto-pick for {currentUserName ?? "current player"}
          </SubmitButton>
          <p className="mt-2 text-xs text-caption">
            Assigns a random available team to the current player. Use only after nudging them.
          </p>
        </form>
      )}
    </section>
  );
}
