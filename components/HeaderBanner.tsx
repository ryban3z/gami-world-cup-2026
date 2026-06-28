import { branding } from "@/lib/config";

// Decorative home header: a gold-gradient panel carrying the page title. The
// pool name stays env-driven and short ({branding.poolName}); the event line and
// the trophy being played for ({branding.trophyName}) frame it. Purely
// presentational — the page h1 lives here so /home has a single, prominent title.
export default function HeaderBanner() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-navy via-panel to-gold/20 px-5 py-6 sm:px-7 sm:py-7">
      {/* Oversized translucent trophy for depth — decorative only. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 -top-4 select-none text-[6.5rem] leading-none opacity-[0.08] sm:text-[8.5rem]"
      >
        🏆
      </span>
      <div className="relative flex flex-col gap-1.5">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-gold/75">
          World Cup 2026 Competition
        </p>
        <h1 className="text-3xl font-black leading-none tracking-tight text-gold sm:text-4xl">
          {branding.poolName}
        </h1>
        <p className="mt-1 text-sm text-bodytext">
          Playing for <span className="font-bold text-white">{branding.trophyName}</span> 🍗
        </p>
      </div>
    </section>
  );
}
