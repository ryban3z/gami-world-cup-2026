import Countdown from "./Countdown";
import { HOST_NATIONS } from "@/lib/content";
import { isRegistrationOpen } from "@/lib/landing";

export default async function Hero() {
  const registrationOpen = await isRegistrationOpen();

  return (
    <section
      className="px-6 pt-12 pb-9 text-center"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #1c2a5e 0%, #0a0e27 65%)",
      }}
    >
      <div className="text-[10px] font-bold tracking-[0.2em] text-neon">
        FIFA WORLD CUP 2026 · THE FRIENDS POOL
      </div>
      <h1 className="my-3 text-4xl font-black uppercase leading-[0.98]">
        Gami
        <br />
        World Cup
        <br />
        <span className="text-neon">&apos;26</span>
      </h1>
      <p className="text-xs text-bodytext">8 mates · snake-draft 48 nations</p>
      <p className="mb-1 text-xs font-semibold">winner lifts the Golden Drumstick 🍗</p>
      <p className="mb-5 text-[11px] text-caption">{HOST_NATIONS}</p>
      <Countdown />

      {registrationOpen ? (
        <a
          href="/gate"
          className="mt-6 inline-block rounded-full bg-neon px-8 py-3 text-sm font-bold uppercase tracking-wide text-navy shadow-[0_0_24px_rgba(0,255,157,0.45)] transition hover:brightness-110"
        >
          Get started →
        </a>
      ) : (
        <span
          aria-disabled="true"
          title="Registration isn't open yet"
          className="mt-6 inline-block cursor-not-allowed select-none rounded-full border border-glow bg-panel px-8 py-3 text-sm font-bold uppercase tracking-wide text-caption opacity-60"
        >
          Registration opens soon
        </span>
      )}
    </section>
  );
}
