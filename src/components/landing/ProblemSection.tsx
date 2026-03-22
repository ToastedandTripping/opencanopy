export function ProblemSection() {
  return (
    <section id="problem" className="px-6 py-20 md:py-32">
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-3xl md:text-4xl font-bold text-white text-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          The data exists. Nobody can use it.
        </h2>
        <p className="mt-8 text-zinc-400 text-center max-w-2xl mx-auto leading-relaxed">
          BC publishes a Vegetation Resources Inventory covering every forest
          polygon in the province -- species, age, harvest history. The data is
          public. Using it requires GIS software, technical knowledge, and
          patience. Community groups, journalists, First Nations -- they all need
          this data and can&apos;t reach it.
        </p>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto">
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6 text-center">
            <p
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              4,927
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              VRI polygons in the Eldred Valley alone
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6 text-center">
            <p
              className="text-3xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              0
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Accessible tools for non-GIS users
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
