import { STEPS } from "@/lib/content";

export default function HowItWorks() {
  return (
    <section className="border-t border-glow px-6 py-6">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.15em] text-gold">
        HOW IT WORKS
      </h2>
      <ol className="space-y-3">
        {STEPS.map((step) => (
          <li key={step.n} className="flex gap-3">
            <span className="text-sm font-black text-gold">{step.n}</span>
            <div>
              <div className="text-[13px] font-bold">{step.title}</div>
              <div className="text-[11px] text-bodytext">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
