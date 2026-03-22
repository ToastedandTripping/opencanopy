"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 100);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-black/80 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-0" aria-label="OpenCanopy home">
          <span
            className="text-xl font-semibold text-[#94a3b8]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Open
          </span>
          <span
            className="text-xl font-semibold text-[#f0f0f0]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Canopy
          </span>
        </Link>

        <Link
          href="/map"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-[#2dd4bf] text-black text-sm font-medium hover:bg-[#2dd4bf]/90 transition-colors"
        >
          Open the Map
        </Link>
      </div>
    </nav>
  );
}
