import { TIMELINE } from "@/lib/content";

export default function Timeline() {
  return (
    <section className="border-t border-glow px-6 py-6">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.15em] text-gold">
        THE ROAD AHEAD
      </h2>
      <ul className="space-y-2 text-[11px] text-bodytext">
        {TIMELINE.map((item) => (
          <li key={item.label}>
            <span className="text-gold">●</span> {item.label}{" "}
            <span className="text-caption">— {item.when}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
