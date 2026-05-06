import { LandingNav } from "@/components/landing/LandingNav";
import { PhotoHero } from "@/components/landing/PhotoHero";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { MapReveal } from "@/components/landing/MapReveal";
import { CapabilitiesSection } from "@/components/landing/CapabilitiesSection";
import { PhotoCloser } from "@/components/landing/PhotoCloser";
import { SupportSection } from "@/components/landing/SupportSection";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main>
      <LandingNav />
      <PhotoHero />
      <ProblemSection />
      <MapReveal />
      <CapabilitiesSection />
      <PhotoCloser />
      <SupportSection />
      <Footer />
    </main>
  );
}
