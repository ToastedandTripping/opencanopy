"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export function MapReveal() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const ratio = entry.intersectionRatio;
            setProgress(Math.min(ratio * 2, 1));
          }
        }
      },
      { threshold: Array.from({ length: 20 }, (_, i) => i / 20) }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative z-10 bg-[var(--color-surface-0)]"
    >
      <div className="max-w-5xl mx-auto px-6 md:px-16 py-16 md:py-24">
        <p className="text-center text-sm text-zinc-500 mb-8 tracking-wider uppercase">
          What it looks like when you can finally see it
        </p>
        <div
          className="relative rounded-2xl overflow-hidden border border-white/8 shadow-2xl shadow-black/50"
          style={{
            opacity: 0.3 + progress * 0.7,
            transform: `scale(${0.96 + progress * 0.04})`,
            transition: "transform 100ms ease-out",
          }}
        >
          <Image
            src="/images/map-preview.webp"
            alt="OpenCanopy map showing forest age classes across British Columbia"
            width={1920}
            height={1080}
            className="w-full h-auto"
            sizes="(max-width: 1280px) 100vw, 1280px"
          />
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          Forest age classes in the Eldred Valley. Green: old growth. Red: logged.
        </p>
      </div>
    </section>
  );
}
