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
  category: "forest",  // forest | water | species | protection | context
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

4. Add the layer ID to the edge function's `LAYER_CONFIG` in `edge/wfs-proxy.ts`.
5. Test at multiple zoom levels to verify the data loads and renders.

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
