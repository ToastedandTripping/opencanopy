"use client";

export function ProblemSection() {
  return (
    <section id="problem" className="relative z-10 bg-[var(--color-surface-0)] py-28 md:py-36">
      <div className="max-w-4xl mx-auto px-6 md:px-16">
        <h2
          className="text-3xl md:text-5xl text-white tracking-tight leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          The data exists.<br />
          Nobody can use it.
        </h2>
        <p className="mt-6 max-w-2xl text-base md:text-lg text-zinc-400 leading-relaxed">
          British Columbia publishes a Vegetation Resources Inventory covering
          every forest polygon in the province. Species, age, harvest history.
          The data is public. Using it requires GIS software, technical
          knowledge, and patience. The communities who need it most can&apos;t
          reach it.
        </p>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard number="6.2M" label="forest polygons" sublabel="in the BC VRI dataset" />
          <StatCard number="18" label="data layers" sublabel="assembled from government sources" />
          <StatCard number="0" label="accessible tools" sublabel="for non-GIS users (before this)" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ number, label, sublabel }: { number: string; label: string; sublabel: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-6">
      <p
        className="text-3xl md:text-4xl text-[var(--color-accent)] tracking-tight"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {number}
      </p>
      <p className="mt-1 text-sm font-semibold text-zinc-200">{label}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{sublabel}</p>
    </div>
  );
}
