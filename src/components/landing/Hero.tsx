import Link from "next/link";

export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-6 pt-32 pb-20">
      <h1
        className="text-5xl md:text-6xl font-bold text-white text-center"
        style={{ fontFamily: "var(--font-display)" }}
      >
        See what&apos;s left.
      </h1>
      <p className="mt-6 text-lg md:text-xl text-zinc-400 max-w-2xl text-center leading-relaxed">
        Open-source conservation mapping for British Columbia. Government forest
        data, made usable.
      </p>
      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <Link
          href="/map"
          className="inline-flex items-center px-6 py-3 rounded-lg bg-[#2dd4bf] text-black text-sm font-medium hover:bg-[#2dd4bf]/90 transition-colors"
        >
          Open the Map
        </Link>
        <a
          href="#problem"
          className="inline-flex items-center px-6 py-3 rounded-lg border border-white/10 text-zinc-300 text-sm font-medium hover:bg-white/5 transition-colors"
        >
          Learn More
        </a>
      </div>
    </section>
  );
}
