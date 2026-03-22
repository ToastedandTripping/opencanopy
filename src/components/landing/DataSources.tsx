const sources = [
  {
    name: "BC Vegetation Resources Inventory",
    url: "https://catalogue.data.gov.bc.ca/dataset/vri-2023-forest-vegetation-composite-rank-1-layer-r1-",
  },
  {
    name: "RESULTS Forest Cover Inventory",
    url: "https://catalogue.data.gov.bc.ca/dataset/results-forest-cover-inventory",
  },
  {
    name: "BC Freshwater Atlas",
    url: "https://catalogue.data.gov.bc.ca/dataset/freshwater-atlas-stream-network",
  },
  {
    name: "BC Conservation Data Centre",
    url: "https://catalogue.data.gov.bc.ca/dataset/species-and-ecosystems-at-risk-publicly-available-occurrences-cdc",
  },
  {
    name: "BC Parks and Protected Areas",
    url: "https://catalogue.data.gov.bc.ca/dataset/bc-parks-ecological-reserves-and-protected-areas",
  },
];

export function DataSources() {
  return (
    <section id="data" className="px-6 py-20 md:py-32">
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-3xl font-bold text-white text-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Real data. Real-time.
        </h2>
        <ul className="mt-10 space-y-3 max-w-xl mx-auto">
          {sources.map((source) => (
            <li key={source.name}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2dd4bf] hover:text-[#2dd4bf]/80 transition-colors text-sm"
              >
                {source.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-zinc-400 text-center max-w-xl mx-auto">
          Data sourced directly from BC government WFS endpoints. Nothing
          editorialized.
        </p>
        <p className="mt-4 text-xs text-zinc-500 text-center">
          Not affiliated with or endorsed by the Province of British Columbia.
        </p>
      </div>
    </section>
  );
}
