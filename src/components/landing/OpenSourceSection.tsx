export function OpenSourceSection() {
  return (
    <section id="open-source" className="px-6 py-20 md:py-32">
      <div className="max-w-4xl mx-auto text-center">
        <h2
          className="text-3xl font-bold text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Open source. AGPLv3.
        </h2>
        <p className="mt-6 text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Conservation tools should be public infrastructure. Anyone can run
          their own instance, add data layers, or contribute improvements. The
          AGPL license means modifications must stay open. Community benefits
          from every contribution.
        </p>
        <p className="mt-4 text-zinc-500 text-sm">
          Adding a data layer is a single TypeScript object.
        </p>
        <div className="mt-8">
          <a
            href="https://github.com/ToastedandTripping/opencanopy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 rounded-lg border border-[#2dd4bf] text-[#2dd4bf] text-sm font-medium hover:bg-[#2dd4bf]/10 transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
