import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Scoring from "@/components/Scoring";
import Timeline from "@/components/Timeline";
import SiteFooter from "@/components/SiteFooter";

// Dynamic so we can send logged-in users straight to their dashboard; the
// public marketing page renders for everyone else.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Logged-in users belong on the dashboard, not the marketing page.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

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
