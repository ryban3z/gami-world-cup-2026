import type { PhaseStep } from "@/lib/adminView";

// Read-only orientation banner: the phase state machine as a row of pills,
// the current phase highlighted in gold, past phases dimmed, future faded.
export default function PhaseBanner({ steps }: { steps: PhaseStep[] }) {
  return (
    <section className="rounded-xl border border-glow bg-panel p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-caption">Current phase</h2>
      <ol className="mt-3 flex flex-wrap gap-2">
        {steps.map((s) => (
          <li
            key={s.key}
            className={[
              "rounded-full px-3 py-1 text-xs font-bold",
              s.status === "current"
                ? "bg-gold text-navy"
                : s.status === "done"
                  ? "border border-glow text-caption"
                  : "border border-glow text-bodytext opacity-50",
            ].join(" ")}
          >
            {s.label}
          </li>
        ))}
      </ol>
    </section>
  );
}
