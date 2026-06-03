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
      {/* Full-bleed hero above; info sections in a readable column on mobile,
          a 3-up grid on desktop. */}
      <div className="mx-auto max-w-2xl lg:max-w-5xl lg:px-8">
        <div className="lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-5 lg:py-6">
          <HowItWorks />
          <Scoring />
          <Timeline />
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
