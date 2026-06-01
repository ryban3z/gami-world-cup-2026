import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Scoring from "@/components/Scoring";
import Timeline from "@/components/Timeline";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-md bg-navy">
      <Hero />
      <HowItWorks />
      <Scoring />
      <Timeline />
      <SiteFooter />
    </main>
  );
}
