import Countdown from "./Countdown";
import GetStarted from "./GetStarted";
import { HOST_NATIONS } from "@/lib/content";
import { isRegistrationOpen, getRegisteredCount } from "@/lib/landing";

export default async function Hero() {
  const [registrationOpen, registeredCount] = await Promise.all([
    isRegistrationOpen(),
    getRegisteredCount(),
  ]);

  return (
    <section
      className="px-6 pt-12 pb-9 text-center md:pt-20 md:pb-16"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #1c2a5e 0%, #0a0e27 65%)",
      }}
    >
      <div className="mx-auto max-w-2xl lg:max-w-5xl">
        <div className="text-[10px] font-bold tracking-[0.2em] text-gold md:text-xs lg:text-sm">
          FIFA WORLD CUP 2026 · THE FRIENDS POOL
        </div>
        {/* Stacked on mobile (forced breaks); a single wide line on desktop. */}
        <h1 className="my-3 text-4xl font-black uppercase leading-[0.98] md:my-5 md:text-6xl lg:my-6 lg:whitespace-nowrap lg:text-7xl">
          Gami{" "}
          <br className="lg:hidden" />
          World Cup{" "}
          <br className="lg:hidden" />
          <span className="text-gold">&apos;26</span>
        </h1>
        <p className="text-xs text-bodytext md:text-base">You &amp; your mates · snake-draft 48 nations</p>
        <p className="mb-1 text-xs font-semibold md:text-base">winner lifts the Golden Drumstick 🍗</p>
        <p className="mb-5 text-[11px] text-caption md:mb-7 md:text-sm">{HOST_NATIONS}</p>
        <Countdown />

        {registeredCount > 0 && (
          <p className="mt-5 text-sm font-bold text-gold md:mt-6 md:text-base">
            🔥 {registeredCount} {registeredCount === 1 ? "manager" : "managers"} already in the pool
          </p>
        )}

        <GetStarted registrationOpen={registrationOpen} />
      </div>
    </section>
  );
}
