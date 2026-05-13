"use client";

import dynamic from "next/dynamic";
import { HeroSection } from "@/components/story/HeroSection";

const ScrollytellingContainer = dynamic(
  () =>
    import("@/components/story/ScrollytellingContainer").then((m) => ({
      default: m.ScrollytellingContainer,
    })),
  { ssr: false }
);

const CtaSection = dynamic(
  () =>
    import("@/components/story/CtaSection").then((m) => ({
      default: m.CtaSection,
    }))
);

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <ScrollytellingContainer />
      <CtaSection />
    </main>
  );
}
