"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-3 transition-colors duration-300 ${
        scrolled
          ? "bg-black/80 backdrop-blur-md border-b border-white/5"
          : "bg-transparent"
      }`}
    >
      <Link
        href="/"
        className="flex items-baseline gap-0 opacity-80 hover:opacity-100 transition-opacity"
        aria-label="OpenCanopy home"
      >
        <span
          className="text-base font-normal text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Open
        </span>
        <span
          className="text-base font-normal text-[#f0f0f0]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Canopy
        </span>
      </Link>

      <a
        href="/map"
        className="text-xs text-zinc-400 hover:text-white px-4 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
      >
        Open the map
      </a>
    </nav>
  );
}
