export function SupportSection() {
  return (
    <section id="support" className="px-6 py-20 md:py-32">
      <div className="max-w-4xl mx-auto text-center">
        <h2
          className="text-3xl font-bold text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Support ongoing development
        </h2>
        <p className="mt-6 text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          OpenCanopy runs on hosting costs and volunteer time. If this tool is
          useful to your community, consider supporting it.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://github.com/sponsors/ToastedandTripping"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 rounded-lg bg-[#2dd4bf] text-black text-sm font-medium hover:bg-[#2dd4bf]/90 transition-colors"
          >
            Sponsor on GitHub
          </a>
          <a
            href="https://github.com/ToastedandTripping/opencanopy/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 rounded-lg border border-white/10 text-zinc-300 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Contribute Code
          </a>
        </div>
      </div>
    </section>
  );
}
