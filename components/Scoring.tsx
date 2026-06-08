import { SCORING_ROWS } from "@/lib/content";

export default function Scoring() {
  return (
    <section className="border-t border-glow px-6 py-6 lg:h-full lg:rounded-xl lg:border lg:bg-panel/20">
      <h2 className="mb-3 text-[10px] font-bold tracking-[0.15em] text-gold lg:text-xs">
        SCORING
      </h2>
      <div className="rounded-xl bg-panel px-4 py-3">
        {SCORING_ROWS.map((row, i) => (
          <div
            key={row.label}
            className={`flex justify-between py-1.5 text-xs ${
              i < SCORING_ROWS.length - 1 ? "border-b border-glow" : ""
            }`}
          >
            <span className="text-bodytext">{row.label}</span>
            <span className="font-extrabold text-gold">{row.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9px] text-caption">
        Knockout points are for a team&apos;s furthest stage and stack on the +5
        (so an R16 team = 11). Group points stay with the drafter; knockout points
        go to the new owner after a swap. One scoring pick per bonus category.
      </p>
    </section>
  );
}
