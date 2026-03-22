# OpenCanopy

Open-source conservation mapping for British Columbia. Visualize old-growth forests, logging activity, species at risk, and carbon value using real-time BC government data.

**Live:** [opencanopy.ca](https://opencanopy.ca) (coming soon)

## What It Does

- Interactive map with 8 data layers (forest age, cutblocks, fish streams, species at risk, parks, conservancies)
- Draw-a-box carbon calculator: select any area to see tonnes of CO2 stored, equivalent cars/homes/flights
- Shareable URLs: every view is a link
- Layer presets: Overview, Threats, Ecology, Protection
- Curated hot spots: Eldred Valley, Fairy Creek, Inland Rainforest, and more

## Data Sources

All data is freely available from BC government sources:
- [BC Vegetation Resources Inventory (VRI)](https://catalogue.data.gov.bc.ca/dataset/vri-2023-forest-vegetation-composite-rank-1-layer-r1-)
- [RESULTS - Forest Cover](https://catalogue.data.gov.bc.ca/dataset/results-forest-cover-inventory)
- [BC Freshwater Atlas](https://catalogue.data.gov.bc.ca/dataset/freshwater-atlas-stream-network)
- [BC Conservation Data Centre](https://catalogue.data.gov.bc.ca/dataset/cdc-species-and-ecosystems-at-risk-publicly-available-occurrences)
- [BC Parks and Protected Areas](https://catalogue.data.gov.bc.ca/dataset/bc-parks-ecological-reserves-and-protected-areas)

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+

### Development
```bash
git clone https://github.com/secretsaunacompany/opencanopy.git
cd opencanopy
cp .env.example .env.local
# Add your MapTiler API key to .env.local
npm install
npm run dev
```

The app works without a MapTiler key (falls back to OpenFreeMap) but satellite imagery and terrain require one. Get a free key at [maptiler.com](https://www.maptiler.com/).

### Build
```bash
npm run build
```

## Carbon Calculation Methodology

See [METHODOLOGY.md](METHODOLOGY.md) for details on the carbon estimation model, species density tables, and data sources.

**Important:** Carbon estimates are approximate and intended for comparative purposes. They are not audited carbon accounting. Accuracy improves at higher zoom levels.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

The easiest way to contribute is adding new data layers -- each layer is a single TypeScript configuration object in `src/lib/layers/registry.ts`.

## License

Code: [AGPLv3](LICENSE)
Documentation: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## Built By

[Secret Sauna Company](https://secretsaunacompany.ca) -- Squamish, BC

Built with data from the BC government. Not affiliated with or endorsed by the Province of British Columbia.
