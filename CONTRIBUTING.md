# Contributing to OpenCanopy

Contributions are welcome. This document covers the basics.

## Adding a New Data Layer

Each layer is a single configuration object in `src/lib/layers/registry.ts`. To add one:

1. Find the dataset in the [BC Data Catalogue](https://catalogue.data.gov.bc.ca/).
2. Confirm it has a WFS endpoint (look for OGC WFS under "Resource").
3. Add a `LayerDefinition` to the `LAYER_REGISTRY` array:

```typescript
{
  id: "your-layer-id",
  label: "Human-Readable Name",
  category: "forest",  // forest | accountability | disturbance | water | species | protection | context
  description: "One-line description for tooltips",
  source: {
    type: "wfs",
    url: "https://openmaps.gov.bc.ca/geo/pub/DATASET_NAME/ows",
    typeName: "pub:DATASET_NAME",
    cqlFilter: "OPTIONAL_FILTER",  // optional
    attribution: "Source name",
  },
  style: {
    type: "fill",  // fill | line | circle
    paint: {
      "fill-color": "#hexcolor",
      "fill-opacity": 0.6,
    },
    opacity: 0.6,
  },
  zoomRange: [8, 18],
  defaultEnabled: false,
  interactive: true,
  legendItems: [{ color: "#hexcolor", label: "Legend label" }],
}
```

4. Add the id to `PUBLIC_LAYER_IDS` in the same file. The UI, URL hydration
   and rendering only ever see `LAYER_REGISTRY_AVAILABLE` (the registry
   filtered by that set); without this step the layer exists but is invisible.
5. Mirror the layer in the edge function's `LAYER_CONFIG` in
   `netlify/edge-functions/wfs-proxy.ts` (URL, typeName, cqlFilter). The proxy
   cannot import from `src/`, so this is a hand-mirror; `npm test` fails on
   drift (`proxy-consistency-audit`).
6. Run `npm test`. The audit suites enforce, per layer: registry ↔ proxy
   mirror; legend swatch colour == paint colour for every `classSlug`;
   effective opacity ≥ 0.15 inside `zoomRange`; every zoom in `zoomRange`
   actually rendered by some tier; and, for any fill on the shared forest-age
   PMTiles source, a `tileSource.minZoom` crash-gate or a raster overview.
7. Test at multiple zoom levels on a deploy — the map cannot render from a
   keyless sandbox (R2 serves no CORS to localhost).

## Adding a Hot Spot

Hot spots are curated locations in `src/data/hotspots.ts`. Add a new entry to the `HOT_SPOTS` array:

```typescript
{
  id: "kebab-case-id",
  name: "Display Name",
  description: "One to two sentences about why this place matters.",
  center: [-123.45, 49.67],  // [lng, lat]
  zoom: 12,
  layers: ["forest-age", "parks"],  // Layer IDs to enable
}
```

## Code Style

- TypeScript strict mode
- Tailwind CSS for styling (no external UI component libraries)
- Inline SVG for icons (no icon library dependencies)
- Dark glass aesthetic: `bg-black/60 backdrop-blur-md border border-white/10`
- Components are `"use client"` where hooks are needed
- Functional components only

## Pull Requests

1. Fork the repo and create a branch from `main`.
2. Keep changes focused. One feature or fix per PR.
3. Test the build: `npm run build` must succeed.
4. Write a clear PR description explaining what changed and why.

## Reporting Issues

Open an issue on GitHub. Include:
- What you expected to happen
- What actually happened
- Browser and OS
- Screenshot if it's a visual issue
