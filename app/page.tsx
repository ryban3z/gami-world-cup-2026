import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Scoring from "@/components/Scoring";
import Timeline from "@/components/Timeline";
import SiteFooter from "@/components/SiteFooter";

// Re-render at most every 30s so the registration_open flag is picked up
// without hitting Supabase on every visit.
export const revalidate = 30;

export default function Home() {
  return (
    <main className="min-h-screen bg-navy">
      <Hero />
      {/* Full-bleed hero above; info sections centered in a readable column. */}
      <div className="mx-auto max-w-2xl">
        <HowItWorks />
        <Scoring />
        <Timeline />
      </div>
      <SiteFooter />
    </main>
  );
}
